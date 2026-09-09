-- ============================================================================
-- CLUB + LIVE BAND POS & MANAGEMENT SYSTEM
-- Migration 0001: Core schema, enums, tables
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================

create type user_role as enum ('ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PROMOTER');

create type room_type as enum ('LIVE_BAND', 'NIGHTCLUB');

create type table_status as enum ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'BILLING', 'CLEANING');

create type guest_status as enum ('RESERVED', 'ARRIVED', 'NO_SHOW', 'RELEASED', 'WALK_IN');

create type order_status as enum ('OPEN', 'BILLING', 'PAID', 'CANCELLED', 'VOIDED');

create type order_item_status as enum ('ACTIVE', 'VOIDED', 'COMPLIMENTARY', 'REFUNDED');

create type payment_method as enum ('CASH', 'GCASH', 'CARD', 'OTHER');

create type payment_status as enum ('PENDING', 'PAID', 'PARTIAL', 'REFUNDED', 'FAILED');

create type inventory_txn_type as enum ('STOCK_IN', 'STOCK_OUT', 'SALE_DEDUCTION', 'WASTAGE', 'DAMAGED', 'ADJUSTMENT', 'STOCK_COUNT', 'PURCHASE_RECEIVE');

create type commission_component as enum ('ENTRANCE', 'CONSUMPTION');

create type commission_status as enum ('PENDING', 'APPROVED', 'PAID', 'VOIDED');

create type shift_status as enum ('OPEN', 'CLOSED');

-- ============================================================================
-- USERS / PROFILES / ROLES
-- ============================================================================

-- profiles extends auth.users (Supabase auth). One row per authenticated user.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role user_role not null default 'PROMOTER',
  is_active boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);

comment on table profiles is 'One row per user; extends auth.users with app-level role & metadata.';

-- promoters: extra profile data specific to promoter role (kept separate from profiles
-- so promoter-specific fields do not clutter the general user table, and so a promoter
-- record can exist even before/without full auth signup e.g. for legacy/manual entry).
create table promoters (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid unique references profiles(id) on delete set null,
  display_name text not null,
  phone text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);

-- fine-grained permission overrides (optional; role covers most cases, this allows
-- per-user exceptions without creating new roles)
create table permissions (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,          -- e.g. 'commission.settings.edit'
  description text
);

create table user_permissions (
  user_id uuid references profiles(id) on delete cascade,
  permission_id uuid references permissions(id) on delete cascade,
  granted boolean not null default true,
  primary key (user_id, permission_id)
);

-- ============================================================================
-- PRODUCTS / INVENTORY
-- ============================================================================

create table product_categories (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,          -- Liquor, Beer, Softdrinks, Mixers, Food, Water, Ice, Supplies, Other
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default uuid_generate_v4(),
  sku text unique,
  name text not null,
  category_id uuid references product_categories(id),
  unit text not null default 'pc',       -- bottle, pc, can, order, etc.
  cost_price numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null default 0,
  current_stock numeric(12,2) not null default 0,
  minimum_stock numeric(12,2) not null default 0,
  supplier_id uuid references suppliers(id),
  is_active boolean not null default true,
  is_complimentary_eligible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);

create index idx_products_category on products(category_id);
create index idx_products_active on products(is_active);

-- modifiers / add-ons for products (e.g. "extra ice", "no sugar")
create table product_modifiers (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  name text not null,
  extra_price numeric(12,2) not null default 0,
  is_active boolean not null default true
);

create table inventory_transactions (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id),
  txn_type inventory_txn_type not null,
  quantity numeric(12,2) not null,        -- positive = increases stock, negative = decreases
  unit_cost numeric(12,2),
  reference_type text,                    -- 'order_item' | 'purchase_item' | 'manual'
  reference_id uuid,
  reason text,
  stock_before numeric(12,2) not null,
  stock_after numeric(12,2) not null,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index idx_inv_txn_product on inventory_transactions(product_id);
create index idx_inv_txn_created on inventory_transactions(created_at);

-- ============================================================================
-- PURCHASING
-- ============================================================================

create table purchases (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid references suppliers(id),
  invoice_reference text,
  purchase_date date not null default current_date,
  payment_status payment_status not null default 'PENDING',
  notes text,
  total_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);

create table purchase_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(12,2) not null,
  unit_cost numeric(12,2) not null,
  total_cost numeric(12,2) generated always as (quantity * unit_cost) stored,
  received boolean not null default false,
  received_at timestamptz
);

create index idx_purchase_items_purchase on purchase_items(purchase_id);

-- ============================================================================
-- ROOMS / TABLES
-- ============================================================================

create table rooms (
  id uuid primary key default uuid_generate_v4(),
  type room_type unique not null,
  name text not null,
  entrance_fee numeric(12,2) not null default 0,   -- current entrance fee (informational; authoritative price is commission_rules)
  is_active boolean not null default true
);

create table club_tables (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id),
  table_number text not null,
  capacity int not null default 4,
  status table_status not null default 'AVAILABLE',
  pos_x numeric,                          -- for visual layout
  pos_y numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id, table_number)
);

create index idx_tables_room on club_tables(room_id);
create index idx_tables_status on club_tables(status);

-- ============================================================================
-- GUESTLIST (promoter guest registration)
-- ============================================================================

-- One row per guest/group submission by a promoter for a given night.
create table guestlists (
  id uuid primary key default uuid_generate_v4(),
  promoter_id uuid not null references promoters(id),
  room_id uuid not null references rooms(id),
  group_name text not null,
  pax int not null check (pax > 0),
  eta timestamptz not null,
  table_id uuid references club_tables(id),
  notes text,
  status guest_status not null default 'RESERVED',
  is_walk_in boolean not null default false,       -- true if created after cutoff / unregistered
  arrived_at timestamptz,
  released_at timestamptz,
  released_by uuid references profiles(id),
  release_reason text,
  business_date date not null default current_date, -- the "night" this belongs to, for cutoff/attribution logic
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);

create index idx_guestlists_promoter on guestlists(promoter_id);
create index idx_guestlists_business_date on guestlists(business_date);
create index idx_guestlists_status on guestlists(status);

-- normalized name for duplicate detection (lower/trim), used by a trigger/function
create index idx_guestlists_group_name_norm on guestlists (lower(trim(group_name)), business_date);

-- individual guests within a group (optional granularity; group-level is often enough,
-- but this supports headcount-accurate entrance commission per guest)
create table guestlist_guests (
  id uuid primary key default uuid_generate_v4(),
  guestlist_id uuid not null references guestlists(id) on delete cascade,
  guest_name text,
  paid_entrance boolean not null default false,
  entrance_paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_guestlist_guests_guestlist on guestlist_guests(guestlist_id);

-- ============================================================================
-- SHIFTS
-- ============================================================================

create table shifts (
  id uuid primary key default uuid_generate_v4(),
  cashier_id uuid not null references profiles(id),
  opening_cash numeric(12,2) not null default 0,
  closing_cash numeric(12,2),
  expected_cash numeric(12,2),
  variance numeric(12,2),
  status shift_status not null default 'OPEN',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  manager_approved_by uuid references profiles(id),
  manager_approval_note text,
  created_at timestamptz not null default now()
);

create index idx_shifts_cashier on shifts(cashier_id);
create index idx_shifts_status on shifts(status);

-- ============================================================================
-- ORDERS / PAYMENTS
-- ============================================================================

create table orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text unique not null default ('ORD-' || to_char(now(),'YYYYMMDD') || '-' || substr(uuid_generate_v4()::text,1,6)),
  room_id uuid not null references rooms(id),
  table_id uuid references club_tables(id),
  guestlist_id uuid references guestlists(id),         -- links order to the guest group for attribution
  promoter_id uuid references promoters(id),            -- denormalized snapshot of attribution at order time
  cashier_id uuid references profiles(id),
  shift_id uuid references shifts(id),
  status order_status not null default 'OPEN',
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  entrance_total numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  notes text,
  opened_at timestamptz not null default now(),
  billed_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  merged_into_order_id uuid references orders(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);

create index idx_orders_room on orders(room_id);
create index idx_orders_table on orders(table_id);
create index idx_orders_promoter on orders(promoter_id);
create index idx_orders_status on orders(status);
create index idx_orders_paid_at on orders(paid_at);

create table order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(12,2) not null default 1,
  unit_cost numeric(12,2) not null default 0,        -- snapshot of product cost at time of sale
  unit_price numeric(12,2) not null default 0,       -- snapshot of product selling price at time of sale
  modifiers jsonb not null default '[]',
  discount_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) generated always as (quantity * unit_price - discount_amount) stored,
  status order_item_status not null default 'ACTIVE',
  notes text,
  voided_at timestamptz,
  voided_by uuid references profiles(id),
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index idx_order_items_order on order_items(order_id);
create index idx_order_items_product on order_items(product_id);
create index idx_order_items_status on order_items(status);

create table payments (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id),
  method payment_method not null,
  amount numeric(12,2) not null,
  status payment_status not null default 'PAID',
  reference_number text,
  received_by uuid references profiles(id),
  refunded_amount numeric(12,2) not null default 0,
  refunded_at timestamptz,
  refund_reason text,
  created_at timestamptz not null default now()
);

create index idx_payments_order on payments(order_id);

-- ============================================================================
-- EXPENSES
-- ============================================================================

create table expense_categories (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,
  is_active boolean not null default true
);

create table expenses (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references expense_categories(id),
  description text not null,
  amount numeric(12,2) not null,
  expense_date date not null default current_date,
  payment_method payment_method not null default 'CASH',
  paid_by uuid references profiles(id),
  reference_number text,
  receipt_url text,
  notes text,
  deleted_at timestamptz,
  deleted_by uuid references profiles(id),
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);

create index idx_expenses_date on expenses(expense_date);
create index idx_expenses_category on expenses(category_id);

-- ============================================================================
-- COMMISSION SYSTEM
-- ============================================================================

-- Versioned commission rules per room. Never edit in place for historical
-- transactions; instead close out the old rule (effective_until) and insert a new one.
create table commission_rules (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id),
  entrance_fee numeric(12,2) not null default 0,
  entrance_commission_per_head numeric(12,2) not null default 0,
  consumption_commission_pct numeric(5,2) not null default 0,   -- e.g. 10.00 = 10%
  effective_from timestamptz not null default now(),
  effective_until timestamptz,                                    -- null = still active
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_commission_rules_room on commission_rules(room_id);
create index idx_commission_rules_effective on commission_rules(room_id, effective_from, effective_until);

-- prevent overlapping active rules per room
create unique index uq_commission_rules_open_per_room
  on commission_rules(room_id) where (effective_until is null);

-- Individual commission records generated automatically from verified activity.
-- One row per (order, promoter, component) — e.g. entrance vs consumption tracked separately
-- so each can be voided/audited independently.
create table commission_records (
  id uuid primary key default uuid_generate_v4(),
  promoter_id uuid not null references promoters(id),
  guestlist_id uuid references guestlists(id),
  order_id uuid references orders(id),
  commission_rule_id uuid references commission_rules(id),
  component commission_component not null,
  base_amount numeric(12,2) not null default 0,     -- e.g. paid bill amount or verified head count
  rate numeric(12,2) not null default 0,             -- the rate/percentage/per-head amount actually applied
  commission_amount numeric(12,2) not null default 0,
  status commission_status not null default 'PENDING',
  business_date date not null default current_date,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references profiles(id),
  void_reason text
);

create index idx_commission_records_promoter on commission_records(promoter_id);
create index idx_commission_records_business_date on commission_records(business_date);
create index idx_commission_records_order on commission_records(order_id);

-- Manual adjustments layered on top of (or independent of) system-generated records.
create table commission_adjustments (
  id uuid primary key default uuid_generate_v4(),
  promoter_id uuid not null references promoters(id),
  commission_record_id uuid references commission_records(id),
  original_amount numeric(12,2) not null,
  new_amount numeric(12,2) not null,
  adjustment_amount numeric(12,2) generated always as (new_amount - original_amount) stored,
  reason text not null,
  business_date date not null default current_date,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_commission_adj_promoter on commission_adjustments(promoter_id);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id),
  action text not null,             -- e.g. 'LOGIN', 'COMMISSION_RULE_UPDATE', 'EXPENSE_DELETE'
  module text not null,             -- e.g. 'commission', 'inventory', 'expenses', 'auth'
  record_table text,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_user on audit_logs(user_id);
create index idx_audit_logs_module on audit_logs(module);
create index idx_audit_logs_created on audit_logs(created_at);

-- ============================================================================
-- FUTURE HOTEL INTEGRATION (placeholder tables, not wired into core POS yet)
-- ============================================================================

create table hotel_guests (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  phone text,
  email text,
  linked_promoter_id uuid references promoters(id),   -- club-to-hotel referral attribution
  linked_guestlist_id uuid references guestlists(id),  -- hotel-to-club referral link
  notes text,
  created_at timestamptz not null default now()
);

create table hotel_bookings (
  id uuid primary key default uuid_generate_v4(),
  hotel_guest_id uuid references hotel_guests(id),
  room_number text,
  check_in date,
  check_out date,
  package_type text,        -- e.g. 'PARTY_STAY'
  linked_order_id uuid references orders(id),
  status text default 'PENDING',
  created_at timestamptz not null default now()
);

comment on table hotel_guests is 'Phase 2 (future): not part of core POS RLS/business logic yet.';
comment on table hotel_bookings is 'Phase 2 (future): not part of core POS RLS/business logic yet.';
