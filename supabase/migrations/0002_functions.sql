-- ============================================================================
-- Migration 0002: Functions & Triggers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- generic updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','promoters','products','suppliers','purchases','club_tables',
    'guestlists','orders','expenses'
  ] loop
    execute format('create trigger trg_%1$s_updated_at before update on %1$s
                     for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- helper: is user in a given role (or higher)
-- SECURITY DEFINER is required here: these functions are called FROM inside
-- RLS policies on `profiles` / `promoters`. If they run as the caller
-- (default, RLS-subject), their internal SELECT re-triggers the very same
-- RLS policy that called them (e.g. profiles_select_self calls is_staff(),
-- which calls current_user_role(), which selects from profiles again,
-- which re-evaluates profiles_select_self...) causing infinite recursion
-- and a Postgres "stack depth limit exceeded" error. Running as SECURITY
-- DEFINER (owned by a role that bypasses RLS) breaks that cycle. search_path
-- is locked down to prevent search-path hijacking of a definer function.
-- ----------------------------------------------------------------------------
create or replace function current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin_or_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(current_user_role() in ('ADMIN','MANAGER'), false);
$$;

create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(current_user_role() in ('ADMIN','MANAGER','CASHIER','INVENTORY_STAFF'), false);
$$;

create or replace function current_promoter_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from promoters where profile_id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- audit log helper
-- ----------------------------------------------------------------------------
create or replace function write_audit_log(
  p_action text, p_module text, p_table text, p_record_id uuid,
  p_old jsonb, p_new jsonb, p_reason text default null
) returns void language plpgsql security definer as $$
begin
  insert into audit_logs(user_id, action, module, record_table, record_id, old_value, new_value, reason)
  values (auth.uid(), p_action, p_module, p_table, p_record_id, p_old, p_new, p_reason);
end;
$$;

-- ----------------------------------------------------------------------------
-- duplicate guest/group detection within the same business_date
-- returns any existing guestlist rows with a matching normalized name
-- ----------------------------------------------------------------------------
create or replace function check_duplicate_guest(
  p_group_name text, p_business_date date, p_exclude_id uuid default null
) returns setof guestlists language sql stable as $$
  select * from guestlists
  where lower(trim(group_name)) = lower(trim(p_group_name))
    and business_date = p_business_date
    and status not in ('RELEASED')
    and (p_exclude_id is null or id <> p_exclude_id);
$$;

-- ----------------------------------------------------------------------------
-- guestlist cutoff enforcement: mark a submission as walk-in if created after
-- 11:00 PM local business time and not previously registered.
-- Assumes business timezone is set via app; adjust 'Asia/Manila' as needed.
-- ----------------------------------------------------------------------------
create or replace function apply_guestlist_cutoff()
returns trigger language plpgsql as $$
declare
  local_time time;
begin
  local_time := (new.created_at at time zone 'Asia/Manila')::time;
  if local_time >= time '23:00' and new.status = 'RESERVED' then
    new.is_walk_in := true;
    new.status := 'WALK_IN';
  end if;
  return new;
end;
$$;

create trigger trg_guestlist_cutoff
  before insert on guestlists
  for each row execute function apply_guestlist_cutoff();

-- ----------------------------------------------------------------------------
-- inventory stock adjustment (single source of truth for stock changes)
-- ----------------------------------------------------------------------------
create or replace function adjust_stock(
  p_product_id uuid, p_delta numeric, p_txn_type inventory_txn_type,
  p_reference_type text default null, p_reference_id uuid default null,
  p_unit_cost numeric default null, p_reason text default null
) returns void language plpgsql security definer as $$
declare
  v_before numeric;
  v_after numeric;
begin
  select current_stock into v_before from products where id = p_product_id for update;
  v_after := v_before + p_delta;

  update products set current_stock = v_after where id = p_product_id;

  insert into inventory_transactions(
    product_id, txn_type, quantity, unit_cost, reference_type, reference_id,
    reason, stock_before, stock_after, created_by
  ) values (
    p_product_id, p_txn_type, p_delta, p_unit_cost, p_reference_type, p_reference_id,
    p_reason, v_before, v_after, auth.uid()
  );
end;
$$;

-- deduct inventory automatically when an order item is added (ACTIVE only)
create or replace function order_item_deduct_inventory()
returns trigger language plpgsql as $$
begin
  if new.status = 'ACTIVE' then
    perform adjust_stock(new.product_id, -new.quantity, 'SALE_DEDUCTION', 'order_item', new.id, new.unit_cost, null);
  end if;
  return new;
end;
$$;

create trigger trg_order_item_deduct
  after insert on order_items
  for each row execute function order_item_deduct_inventory();

-- restore inventory if an order item is voided/refunded after creation
create or replace function order_item_status_change()
returns trigger language plpgsql as $$
begin
  if old.status = 'ACTIVE' and new.status in ('VOIDED','REFUNDED') then
    perform adjust_stock(new.product_id, new.quantity, 'ADJUSTMENT', 'order_item', new.id, new.unit_cost,
      'Reversal for ' || new.status::text);
    perform write_audit_log(new.status::text, 'pos', 'order_items', new.id,
      jsonb_build_object('status','ACTIVE'), jsonb_build_object('status', new.status), new.void_reason);
  end if;
  return new;
end;
$$;

create trigger trg_order_item_status_change
  after update of status on order_items
  for each row execute function order_item_status_change();

-- receiving a purchase increases inventory
create or replace function purchase_item_receive()
returns trigger language plpgsql as $$
begin
  if new.received = true and (old.received is distinct from true) then
    perform adjust_stock(new.product_id, new.quantity, 'PURCHASE_RECEIVE', 'purchase_item', new.id, new.unit_cost, null);
    new.received_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_purchase_item_receive
  before update of received on purchase_items
  for each row execute function purchase_item_receive();

-- ----------------------------------------------------------------------------
-- order totals recalculation (subtotal, discount, grand total from active items)
-- ----------------------------------------------------------------------------
create or replace function recalc_order_totals(p_order_id uuid)
returns void language plpgsql security definer as $$
declare
  v_subtotal numeric;
  v_discount numeric;
begin
  select coalesce(sum(quantity*unit_price),0), coalesce(sum(discount_amount),0)
    into v_subtotal, v_discount
    from order_items where order_id = p_order_id and status = 'ACTIVE';

  update orders
    set subtotal = v_subtotal,
        discount_total = v_discount,
        grand_total = v_subtotal - v_discount + entrance_total
    where id = p_order_id;
end;
$$;

create or replace function order_items_recalc_trigger()
returns trigger language plpgsql as $$
begin
  perform recalc_order_totals(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end;
$$;

create trigger trg_order_items_recalc
  after insert or update or delete on order_items
  for each row execute function order_items_recalc_trigger();

-- ----------------------------------------------------------------------------
-- COMMISSION ENGINE
-- Finds the commission rule active at a given timestamp for a room.
-- ----------------------------------------------------------------------------
create or replace function get_active_commission_rule(p_room_id uuid, p_at timestamptz default now())
returns commission_rules language sql stable as $$
  select * from commission_rules
  where room_id = p_room_id
    and effective_from <= p_at
    and (effective_until is null or effective_until > p_at)
  order by effective_from desc
  limit 1;
$$;

-- Entrance commission: triggered when a guest's entrance is marked paid
-- (guestlist_guests.paid_entrance flips true). Only for verified, non-walk-in guests.
create or replace function credit_entrance_commission()
returns trigger language plpgsql security definer as $$
declare
  v_guestlist guestlists;
  v_rule commission_rules;
begin
  if new.paid_entrance = true and (old.paid_entrance is distinct from true) then
    select * into v_guestlist from guestlists where id = new.guestlist_id;

    if v_guestlist.is_walk_in then
      return new; -- rule 11: no commission on walk-ins
    end if;

    select * into v_rule from get_active_commission_rule(v_guestlist.room_id, now());
    if v_rule.id is null then
      return new;
    end if;

    insert into commission_records(
      promoter_id, guestlist_id, commission_rule_id, component,
      base_amount, rate, commission_amount, status, business_date
    ) values (
      v_guestlist.promoter_id, v_guestlist.id, v_rule.id, 'ENTRANCE',
      1, v_rule.entrance_commission_per_head, v_rule.entrance_commission_per_head,
      'APPROVED', v_guestlist.business_date
    );
  end if;
  return new;
end;
$$;

create trigger trg_credit_entrance_commission
  after update of paid_entrance on guestlist_guests
  for each row execute function credit_entrance_commission();

-- Consumption commission: triggered when an order is marked PAID.
-- Calculated on the FINAL PAID BILL (grand_total, which already excludes voided/
-- refunded items via recalc_order_totals), using the rule active at payment time.
create or replace function credit_consumption_commission()
returns trigger language plpgsql security definer as $$
declare
  v_rule commission_rules;
  v_promoter uuid;
  v_business_date date;
begin
  if new.status = 'PAID' and (old.status is distinct from 'PAID') then
    v_promoter := new.promoter_id;

    -- no commission if no promoter attribution (e.g. walk-in / no guestlist link)
    if v_promoter is null then
      return new;
    end if;

    select * into v_rule from get_active_commission_rule(new.room_id, now());
    if v_rule.id is null then
      return new;
    end if;

    v_business_date := (new.paid_at at time zone 'Asia/Manila')::date;

    insert into commission_records(
      promoter_id, guestlist_id, order_id, commission_rule_id, component,
      base_amount, rate, commission_amount, status, business_date
    ) values (
      v_promoter, new.guestlist_id, new.id, v_rule.id, 'CONSUMPTION',
      new.grand_total, v_rule.consumption_commission_pct,
      round(new.grand_total * v_rule.consumption_commission_pct / 100.0, 2),
      'APPROVED', v_business_date
    );
  end if;
  return new;
end;
$$;

create trigger trg_credit_consumption_commission
  after update of status on orders
  for each row execute function credit_consumption_commission();

-- If an order is later voided/cancelled after payment (refund), void the
-- associated consumption commission record too (rule 13: no commission on refunds).
create or replace function void_commission_on_order_refund()
returns trigger language plpgsql security definer as $$
begin
  if new.status in ('CANCELLED','VOIDED') and old.status = 'PAID' then
    update commission_records
      set status = 'VOIDED', voided_at = now(), voided_by = auth.uid(),
          void_reason = 'Order ' || new.status::text
      where order_id = new.id and status <> 'VOIDED';
  end if;
  return new;
end;
$$;

create trigger trg_void_commission_on_refund
  after update of status on orders
  for each row execute function void_commission_on_order_refund();

-- ----------------------------------------------------------------------------
-- guest arrival -> auto-associate order/table with promoter (attribution follows
-- the guest group, not the table). Called when guestlist status -> ARRIVED.
-- ----------------------------------------------------------------------------
create or replace function on_guest_arrived()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'ARRIVED' and (old.status is distinct from 'ARRIVED') then
    new.arrived_at := now();
    if new.table_id is not null then
      update club_tables set status = 'OCCUPIED' where id = new.table_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_guest_arrived
  before update of status on guestlists
  for each row execute function on_guest_arrived();

-- ----------------------------------------------------------------------------
-- manual commission adjustment -> always writes an audit log (rule 17)
-- ----------------------------------------------------------------------------
create or replace function log_commission_adjustment()
returns trigger language plpgsql security definer as $$
begin
  perform write_audit_log('COMMISSION_ADJUSTMENT', 'commission', 'commission_adjustments', new.id,
    jsonb_build_object('original_amount', new.original_amount),
    jsonb_build_object('new_amount', new.new_amount, 'adjustment_amount', new.adjustment_amount),
    new.reason);
  return new;
end;
$$;

create trigger trg_log_commission_adjustment
  after insert on commission_adjustments
  for each row execute function log_commission_adjustment();

-- ----------------------------------------------------------------------------
-- commission rule change -> audit log + enforce no-overlap by closing prior rule
-- (application should call close_and_replace_commission_rule instead of raw insert)
-- ----------------------------------------------------------------------------
create or replace function close_and_replace_commission_rule(
  p_room_id uuid, p_entrance_fee numeric, p_entrance_commission numeric,
  p_consumption_pct numeric, p_effective_from timestamptz
) returns commission_rules language plpgsql security definer as $$
declare
  v_old commission_rules;
  v_new commission_rules;
begin
  select * into v_old from commission_rules where room_id = p_room_id and effective_until is null;

  if v_old.id is not null then
    update commission_rules set effective_until = p_effective_from where id = v_old.id;
  end if;

  insert into commission_rules(room_id, entrance_fee, entrance_commission_per_head,
    consumption_commission_pct, effective_from, created_by)
  values (p_room_id, p_entrance_fee, p_entrance_commission, p_consumption_pct, p_effective_from, auth.uid())
  returning * into v_new;

  perform write_audit_log('COMMISSION_RULE_UPDATE', 'commission', 'commission_rules', v_new.id,
    to_jsonb(v_old), to_jsonb(v_new), 'Commission settings updated');

  return v_new;
end;
$$;

-- ----------------------------------------------------------------------------
-- expense soft-delete requires reason + audit log
-- ----------------------------------------------------------------------------
create or replace function soft_delete_expense(p_expense_id uuid, p_reason text)
returns void language plpgsql security definer as $$
declare v_old expenses;
begin
  select * into v_old from expenses where id = p_expense_id;
  update expenses set deleted_at = now(), deleted_by = auth.uid(), delete_reason = p_reason
    where id = p_expense_id;
  perform write_audit_log('EXPENSE_DELETE', 'expenses', 'expenses', p_expense_id,
    to_jsonb(v_old), null, p_reason);
end;
$$;

-- ----------------------------------------------------------------------------
-- shift close: compute expected cash & variance
-- ----------------------------------------------------------------------------
create or replace function close_shift(p_shift_id uuid, p_actual_cash numeric)
returns shifts language plpgsql security definer as $$
declare
  v_shift shifts;
  v_cash_sales numeric;
  v_expected numeric;
begin
  select * into v_shift from shifts where id = p_shift_id;

  select coalesce(sum(amount),0) into v_cash_sales
    from payments p join orders o on o.id = p.order_id
    where o.shift_id = p_shift_id and p.method = 'CASH' and p.status = 'PAID';

  v_expected := v_shift.opening_cash + v_cash_sales;

  update shifts set
    status = 'CLOSED',
    closing_cash = p_actual_cash,
    expected_cash = v_expected,
    variance = p_actual_cash - v_expected,
    closed_at = now()
    where id = p_shift_id
    returning * into v_shift;

  return v_shift;
end;
$$;
