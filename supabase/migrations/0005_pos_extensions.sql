-- ============================================================================
-- Migration 0005: POS extensions — open tabs, void/cancel, transfer, merge, split,
-- authorized promoter reassignment. Enables the POS to keep a persistent
-- "current order" per table (added to over the night) rather than a single-shot
-- cart, which is what split bill / merge bills / transfer table actually need.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fix recalc trigger: when an order_item's order_id changes (merge/split),
-- both the source and destination order totals must be recalculated.
-- ----------------------------------------------------------------------------
create or replace function order_items_recalc_trigger()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform recalc_order_totals(old.order_id);
    perform recalc_order_totals(new.order_id);
  else
    perform recalc_order_totals(coalesce(new.order_id, old.order_id));
  end if;
  return coalesce(new, old);
end;
$$;

-- ----------------------------------------------------------------------------
-- Void a single order item with a required reason (cashier/manager/admin).
-- Inventory restoration + audit logging already happens via
-- order_item_status_change() trigger from migration 0002.
-- ----------------------------------------------------------------------------
create or replace function void_order_item(p_item_id uuid, p_reason text)
returns void language plpgsql security definer as $$
begin
  if not (current_user_role() in ('ADMIN','MANAGER','CASHIER')) then
    raise exception 'Not authorized to void items';
  end if;
  update order_items
    set status = 'VOIDED', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
    where id = p_item_id and status = 'ACTIVE';
end;
$$;

-- ----------------------------------------------------------------------------
-- Cancel an entire OPEN order (before payment): voids all active items
-- (restoring inventory via the existing trigger), marks the order CANCELLED,
-- and frees the table. Requires a reason; writes an audit log.
-- ----------------------------------------------------------------------------
create or replace function cancel_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer as $$
declare
  v_order orders;
begin
  if not (current_user_role() in ('ADMIN','MANAGER','CASHIER')) then
    raise exception 'Not authorized to cancel orders';
  end if;

  select * into v_order from orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;
  if v_order.status not in ('OPEN','BILLING') then
    raise exception 'Only open orders can be cancelled';
  end if;

  update order_items set status = 'VOIDED', voided_at = now(), voided_by = auth.uid(),
    void_reason = coalesce(p_reason, 'Order cancelled')
    where order_id = p_order_id and status = 'ACTIVE';

  update orders set status = 'CANCELLED', cancelled_at = now(), cancel_reason = p_reason
    where id = p_order_id;

  if v_order.table_id is not null then
    update club_tables set status = 'AVAILABLE' where id = v_order.table_id;
  end if;

  perform write_audit_log('ORDER_CANCELLED', 'pos', 'orders', p_order_id,
    to_jsonb(v_order), jsonb_build_object('status','CANCELLED'), p_reason);
end;
$$;

-- ----------------------------------------------------------------------------
-- Transfer an open order to a different table (rule: table ownership is not
-- commission attribution, so this never touches promoter_id/guestlist_id).
-- ----------------------------------------------------------------------------
create or replace function transfer_order_table(p_order_id uuid, p_new_table_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_order orders;
  v_old_table_id uuid;
begin
  if not (current_user_role() in ('ADMIN','MANAGER','CASHIER')) then
    raise exception 'Not authorized to transfer tables';
  end if;

  select * into v_order from orders where id = p_order_id;
  if v_order.id is null then raise exception 'Order not found'; end if;
  v_old_table_id := v_order.table_id;

  update orders set table_id = p_new_table_id where id = p_order_id;

  if v_old_table_id is not null then
    update club_tables set status = 'AVAILABLE' where id = v_old_table_id;
  end if;
  update club_tables set status = 'OCCUPIED' where id = p_new_table_id;

  -- keep the guestlist's table reference in sync so the floor plan / guestlist
  -- view still points at the right table for this group
  if v_order.guestlist_id is not null then
    update guestlists set table_id = p_new_table_id where id = v_order.guestlist_id;
  end if;

  perform write_audit_log('TABLE_TRANSFER', 'pos', 'orders', p_order_id,
    jsonb_build_object('table_id', v_old_table_id), jsonb_build_object('table_id', p_new_table_id), p_reason);
end;
$$;

-- ----------------------------------------------------------------------------
-- Merge one open order into another (e.g. two tables joining into one bill).
-- Moves all active items from source -> target, cancels the (now-empty) source,
-- and frees the source's table.
-- ----------------------------------------------------------------------------
create or replace function merge_orders(p_source_order_id uuid, p_target_order_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_source orders;
begin
  if not (current_user_role() in ('ADMIN','MANAGER','CASHIER')) then
    raise exception 'Not authorized to merge bills';
  end if;
  if p_source_order_id = p_target_order_id then
    raise exception 'Cannot merge an order into itself';
  end if;

  select * into v_source from orders where id = p_source_order_id;
  if v_source.id is null then raise exception 'Source order not found'; end if;

  update order_items set order_id = p_target_order_id
    where order_id = p_source_order_id and status = 'ACTIVE';

  update orders set status = 'CANCELLED', cancelled_at = now(),
    cancel_reason = coalesce(p_reason, 'Merged into another bill'),
    merged_into_order_id = p_target_order_id
    where id = p_source_order_id;

  if v_source.table_id is not null then
    update club_tables set status = 'AVAILABLE' where id = v_source.table_id;
  end if;

  perform write_audit_log('ORDER_MERGE', 'pos', 'orders', p_source_order_id,
    jsonb_build_object('order_id', p_source_order_id), jsonb_build_object('merged_into', p_target_order_id), p_reason);
end;
$$;

-- ----------------------------------------------------------------------------
-- Split selected items off an open order into a brand-new order (same room/
-- table/guestlist/promoter attribution), so each can be paid separately.
-- ----------------------------------------------------------------------------
create or replace function split_order_items(p_source_order_id uuid, p_item_ids uuid[], p_reason text default null)
returns uuid language plpgsql security definer as $$
declare
  v_source orders;
  v_new_order_id uuid;
begin
  if not (current_user_role() in ('ADMIN','MANAGER','CASHIER')) then
    raise exception 'Not authorized to split bills';
  end if;

  select * into v_source from orders where id = p_source_order_id;
  if v_source.id is null then raise exception 'Source order not found'; end if;

  insert into orders (room_id, table_id, guestlist_id, promoter_id, cashier_id, shift_id, status)
  values (v_source.room_id, v_source.table_id, v_source.guestlist_id, v_source.promoter_id,
          v_source.cashier_id, v_source.shift_id, 'OPEN')
  returning id into v_new_order_id;

  update order_items set order_id = v_new_order_id
    where id = any(p_item_ids) and order_id = p_source_order_id and status = 'ACTIVE';

  perform write_audit_log('ORDER_SPLIT', 'pos', 'orders', p_source_order_id,
    jsonb_build_object('order_id', p_source_order_id), jsonb_build_object('new_order_id', v_new_order_id), p_reason);

  return v_new_order_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Reassign promoter attribution on an order — explicitly restricted to
-- ADMIN/MANAGER ("reassign promoter only with proper authorization"), and
-- always requires a reason + writes an audit log.
-- ----------------------------------------------------------------------------
create or replace function reassign_order_promoter(p_order_id uuid, p_new_promoter_id uuid, p_reason text)
returns void language plpgsql security definer as $$
declare
  v_order orders;
begin
  if not is_admin_or_manager() then
    raise exception 'Only admins/managers can reassign promoter attribution';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to reassign promoter attribution';
  end if;

  select * into v_order from orders where id = p_order_id;
  if v_order.id is null then raise exception 'Order not found'; end if;

  update orders set promoter_id = p_new_promoter_id where id = p_order_id;

  perform write_audit_log('PROMOTER_REASSIGNMENT', 'pos', 'orders', p_order_id,
    jsonb_build_object('promoter_id', v_order.promoter_id),
    jsonb_build_object('promoter_id', p_new_promoter_id), p_reason);
end;
$$;

-- ----------------------------------------------------------------------------
-- Explicit execute grants (Supabase usually grants these by default to the
-- `authenticated` role automatically, but making it explicit avoids surprises).
-- Each function still does its own role check internally (see above) — this
-- grant only lets logged-in users CALL the function; it does not bypass the
-- ADMIN/MANAGER/CASHIER checks written into each function body.
-- ----------------------------------------------------------------------------
grant execute on function void_order_item(uuid, text) to authenticated;
grant execute on function cancel_order(uuid, text) to authenticated;
grant execute on function transfer_order_table(uuid, uuid, text) to authenticated;
grant execute on function merge_orders(uuid, uuid, text) to authenticated;
grant execute on function split_order_items(uuid, uuid[], text) to authenticated;
grant execute on function reassign_order_promoter(uuid, uuid, text) to authenticated;
