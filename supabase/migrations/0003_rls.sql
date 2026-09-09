-- ============================================================================
-- Migration 0003: Row Level Security
-- Backend/DB is the source of truth for authorization — never rely on frontend hiding.
-- ============================================================================

alter table profiles enable row level security;
alter table promoters enable row level security;
alter table permissions enable row level security;
alter table user_permissions enable row level security;
alter table product_categories enable row level security;
alter table suppliers enable row level security;
alter table products enable row level security;
alter table product_modifiers enable row level security;
alter table inventory_transactions enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table rooms enable row level security;
alter table club_tables enable row level security;
alter table guestlists enable row level security;
alter table guestlist_guests enable row level security;
alter table shifts enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table commission_rules enable row level security;
alter table commission_records enable row level security;
alter table commission_adjustments enable row level security;
alter table audit_logs enable row level security;
alter table hotel_guests enable row level security;
alter table hotel_bookings enable row level security;

-- ----------------------------------------------------------------------------
-- PROFILES: everyone can read their own; staff (cashier+) can read all names for
-- assignment dropdowns; only admin can write roles.
-- ----------------------------------------------------------------------------
create policy profiles_select_self on profiles for select
  using (id = auth.uid() or is_staff());

create policy profiles_update_self on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles p where p.id = auth.uid()));
  -- users can edit their own non-role fields; role changes only via admin policy below

create policy profiles_admin_all on profiles for all
  using (current_user_role() = 'ADMIN')
  with check (current_user_role() = 'ADMIN');

-- ----------------------------------------------------------------------------
-- PROMOTERS: staff can see all (needed for assignment); promoter can see/update self.
-- ----------------------------------------------------------------------------
create policy promoters_select_staff on promoters for select
  using (is_staff() or profile_id = auth.uid());

create policy promoters_write_admin_manager on promoters for insert
  with check (is_admin_or_manager());

create policy promoters_update_admin_manager on promoters for update
  using (is_admin_or_manager() or profile_id = auth.uid())
  with check (is_admin_or_manager() or profile_id = auth.uid());

create policy promoters_delete_admin on promoters for delete
  using (current_user_role() = 'ADMIN');

-- ----------------------------------------------------------------------------
-- PERMISSIONS / USER_PERMISSIONS: admin only
-- ----------------------------------------------------------------------------
create policy permissions_admin_all on permissions for all
  using (current_user_role() = 'ADMIN') with check (current_user_role() = 'ADMIN');

create policy user_permissions_admin_all on user_permissions for all
  using (current_user_role() = 'ADMIN') with check (current_user_role() = 'ADMIN');

-- ----------------------------------------------------------------------------
-- PRODUCTS / CATEGORIES / SUPPLIERS / MODIFIERS
-- Readable by all authenticated staff (POS needs product list, promoters do NOT
-- need cost visibility though — cost_price is protected via a view, see below).
-- Writable by admin, manager, inventory_staff.
-- ----------------------------------------------------------------------------
create policy product_categories_select on product_categories for select using (is_staff());
create policy product_categories_write on product_categories for all
  using (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'))
  with check (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'));

create policy suppliers_select on suppliers for select using (is_staff());
create policy suppliers_write on suppliers for all
  using (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'))
  with check (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'));

create policy products_select on products for select using (is_staff());
create policy products_write on products for all
  using (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'))
  with check (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'));

create policy product_modifiers_select on product_modifiers for select using (is_staff());
create policy product_modifiers_write on product_modifiers for all
  using (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'))
  with check (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'));

-- promoters must NOT see inventory cost -> use this view in the app for promoter-facing screens
create view products_public as
  select id, sku, name, category_id, unit, selling_price, is_active
  from products;

-- ----------------------------------------------------------------------------
-- INVENTORY TRANSACTIONS: admin, manager, inventory_staff only (contains cost data)
-- ----------------------------------------------------------------------------
create policy inventory_txn_select on inventory_transactions for select
  using (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'));
create policy inventory_txn_insert on inventory_transactions for insert
  with check (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'));

-- ----------------------------------------------------------------------------
-- PURCHASING: admin, manager, inventory_staff only
-- ----------------------------------------------------------------------------
create policy purchases_all on purchases for all
  using (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'))
  with check (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'));

create policy purchase_items_all on purchase_items for all
  using (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'))
  with check (current_user_role() in ('ADMIN','MANAGER','INVENTORY_STAFF'));

-- ----------------------------------------------------------------------------
-- ROOMS / TABLES: readable by all staff + promoters (need room/table names for
-- guestlist submission); writable by admin/manager/cashier(status only via RPC)
-- ----------------------------------------------------------------------------
create policy rooms_select_all on rooms for select using (auth.uid() is not null);
create policy rooms_write_admin_manager on rooms for all
  using (is_admin_or_manager()) with check (is_admin_or_manager());

create policy tables_select_all on club_tables for select using (auth.uid() is not null);
create policy tables_write_staff on club_tables for all
  using (current_user_role() in ('ADMIN','MANAGER','CASHIER'))
  with check (current_user_role() in ('ADMIN','MANAGER','CASHIER'));

-- ----------------------------------------------------------------------------
-- GUESTLISTS: the core privacy-sensitive table.
-- Promoters: full CRUD on their OWN rows only.
-- Staff (cashier+): read all (needed to verify arrivals at the door), write status.
-- ----------------------------------------------------------------------------
create policy guestlists_select_own_or_staff on guestlists for select
  using (is_staff() or promoter_id = current_promoter_id());

create policy guestlists_insert_own_or_staff on guestlists for insert
  with check (is_staff() or promoter_id = current_promoter_id());

create policy guestlists_update_own_or_staff on guestlists for update
  using (is_staff() or promoter_id = current_promoter_id())
  with check (
    is_staff()
    or (promoter_id = current_promoter_id() and status in ('RESERVED')) -- promoters can only edit while still pending
  );

create policy guestlists_delete_admin_manager on guestlists for delete
  using (is_admin_or_manager());

create policy guestlist_guests_select on guestlist_guests for select
  using (
    is_staff()
    or exists (select 1 from guestlists g where g.id = guestlist_guests.guestlist_id and g.promoter_id = current_promoter_id())
  );

create policy guestlist_guests_write_staff on guestlist_guests for all
  using (is_staff())
  with check (is_staff());

-- ----------------------------------------------------------------------------
-- SHIFTS: cashier sees/opens own; admin/manager see all
-- ----------------------------------------------------------------------------
create policy shifts_select on shifts for select
  using (is_admin_or_manager() or cashier_id = auth.uid());
create policy shifts_insert on shifts for insert
  with check (current_user_role() in ('ADMIN','MANAGER','CASHIER') and cashier_id = auth.uid());
create policy shifts_update on shifts for update
  using (is_admin_or_manager() or cashier_id = auth.uid())
  with check (is_admin_or_manager() or cashier_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ORDERS / ORDER_ITEMS / PAYMENTS: staff (POS roles) full access.
-- Promoters can SELECT only orders linked to their own guestlist (their own sales,
-- for their dashboard) but never see cost data (order_items has unit_cost — restrict
-- promoter-facing queries to a view without cost).
-- ----------------------------------------------------------------------------
create policy orders_select on orders for select
  using (
    current_user_role() in ('ADMIN','MANAGER','CASHIER')
    or promoter_id = current_promoter_id()
  );

create policy orders_write_staff on orders for insert
  with check (current_user_role() in ('ADMIN','MANAGER','CASHIER'));

create policy orders_update_staff on orders for update
  using (current_user_role() in ('ADMIN','MANAGER','CASHIER'))
  with check (current_user_role() in ('ADMIN','MANAGER','CASHIER'));

create policy order_items_select on order_items for select
  using (
    current_user_role() in ('ADMIN','MANAGER','CASHIER')
    or exists (select 1 from orders o where o.id = order_items.order_id and o.promoter_id = current_promoter_id())
  );

create policy order_items_write_staff on order_items for all
  using (current_user_role() in ('ADMIN','MANAGER','CASHIER'))
  with check (current_user_role() in ('ADMIN','MANAGER','CASHIER'));

-- promoter-safe view: no cost, no internal notes
create view order_items_public as
  select id, order_id, product_id, quantity, unit_price, line_total, status, created_at
  from order_items;

create policy payments_select on payments for select
  using (current_user_role() in ('ADMIN','MANAGER','CASHIER'));
create policy payments_write on payments for all
  using (current_user_role() in ('ADMIN','MANAGER','CASHIER'))
  with check (current_user_role() in ('ADMIN','MANAGER','CASHIER'));

-- ----------------------------------------------------------------------------
-- EXPENSES: admin/manager only. Promoters/cashier/inventory staff: no access.
-- ----------------------------------------------------------------------------
create policy expense_categories_select on expense_categories for select using (is_admin_or_manager());
create policy expense_categories_write on expense_categories for all
  using (is_admin_or_manager()) with check (is_admin_or_manager());

create policy expenses_select on expenses for select using (is_admin_or_manager());
create policy expenses_insert on expenses for insert with check (is_admin_or_manager());
create policy expenses_update on expenses for update using (is_admin_or_manager()) with check (is_admin_or_manager());
-- no direct delete policy: deletion must go through soft_delete_expense() (security definer)

-- ----------------------------------------------------------------------------
-- COMMISSION: settings (rules) = admin/manager only.
-- Records: promoter sees only their OWN; admin/manager see all.
-- ----------------------------------------------------------------------------
create policy commission_rules_select on commission_rules for select using (is_admin_or_manager());
create policy commission_rules_write on commission_rules for all
  using (is_admin_or_manager()) with check (is_admin_or_manager());
  -- Note: app should call close_and_replace_commission_rule() rather than raw insert/update
  -- to preserve history; this policy still allows it since function runs as invoker's grant.

create policy commission_records_select on commission_records for select
  using (is_admin_or_manager() or promoter_id = current_promoter_id());
create policy commission_records_write_admin_manager on commission_records for all
  using (is_admin_or_manager()) with check (is_admin_or_manager());
  -- normal creation happens via security-definer triggers; this covers manual admin edits

create policy commission_adjustments_select on commission_adjustments for select
  using (is_admin_or_manager() or promoter_id = current_promoter_id());
create policy commission_adjustments_insert on commission_adjustments for insert
  with check (is_admin_or_manager());
-- no update/delete: adjustments are append-only for audit integrity

-- ----------------------------------------------------------------------------
-- AUDIT LOGS: admin only (managers may optionally be granted read-only)
-- ----------------------------------------------------------------------------
create policy audit_logs_select_admin on audit_logs for select using (current_user_role() = 'ADMIN');
-- inserts happen only via write_audit_log() security-definer function

-- ----------------------------------------------------------------------------
-- HOTEL (future) — admin/manager only for now
-- ----------------------------------------------------------------------------
create policy hotel_guests_all on hotel_guests for all
  using (is_admin_or_manager()) with check (is_admin_or_manager());
create policy hotel_bookings_all on hotel_bookings for all
  using (is_admin_or_manager()) with check (is_admin_or_manager());
