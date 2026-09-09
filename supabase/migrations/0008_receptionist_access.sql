-- ============================================================================
-- Migration 0008: RECEPTIONIST access
-- Receptionist = door staff. Needs everything is_staff() already grants
-- (read guestlists/rooms/tables/products, write guestlists & guestlist_guests
-- to check guests in), plus the ability to update table status, and to
-- create+pay an entrance-only order (orders/payments), matching the "collect
-- entrance fee, assign table" scope. It does NOT get order_items access or
-- the table-order management RPCs (transfer/merge/split/cancel/reassign) —
-- those stay cashier+ only, since receptionist never runs a product cart.
-- ============================================================================

-- is_staff() backs profiles/promoters/products/guestlist read+write policies.
create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(current_user_role() in ('ADMIN','MANAGER','CASHIER','INVENTORY_STAFF','RECEPTIONIST'), false);
$$;

-- Tables: receptionist assigns/seats guests, so needs to update table status.
drop policy if exists tables_write_staff on club_tables;
create policy tables_write_staff on club_tables for all
  using (current_user_role() in ('ADMIN','MANAGER','CASHIER','RECEPTIONIST'))
  with check (current_user_role() in ('ADMIN','MANAGER','CASHIER','RECEPTIONIST'));

-- Orders: receptionist creates+pays entrance-only orders (no line items, no
-- transfer/merge/split — those RPCs still check for 'ADMIN','MANAGER','CASHIER'
-- explicitly in 0005_pos_extensions.sql and are intentionally left untouched).
drop policy if exists orders_select on orders;
create policy orders_select on orders for select
  using (
    current_user_role() in ('ADMIN','MANAGER','CASHIER','RECEPTIONIST')
    or promoter_id = current_promoter_id()
  );

drop policy if exists orders_write_staff on orders;
create policy orders_write_staff on orders for insert
  with check (current_user_role() in ('ADMIN','MANAGER','CASHIER','RECEPTIONIST'));

drop policy if exists orders_update_staff on orders;
create policy orders_update_staff on orders for update
  using (current_user_role() in ('ADMIN','MANAGER','CASHIER','RECEPTIONIST'))
  with check (current_user_role() in ('ADMIN','MANAGER','CASHIER','RECEPTIONIST'));

-- Payments: receptionist records the entrance payment it just took.
drop policy if exists payments_select on payments;
create policy payments_select on payments for select
  using (current_user_role() in ('ADMIN','MANAGER','CASHIER','RECEPTIONIST'));

drop policy if exists payments_write on payments;
create policy payments_write on payments for all
  using (current_user_role() in ('ADMIN','MANAGER','CASHIER','RECEPTIONIST'))
  with check (current_user_role() in ('ADMIN','MANAGER','CASHIER','RECEPTIONIST'));
