-- ============================================================================
-- Seed data (demo/testing only — run against a dev/staging project)
-- Run AFTER creating your first admin user via Supabase Auth, then update
-- that user's role to ADMIN manually, e.g.:
--   update profiles set role = 'ADMIN' where id = '<your-auth-user-id>';
-- ============================================================================

-- Rooms
insert into rooms (type, name, entrance_fee) values
  ('LIVE_BAND', 'Live Band Room', 0),
  ('NIGHTCLUB', 'Nightclub Room', 100)
on conflict (type) do nothing;

-- Tables
insert into club_tables (room_id, table_number, capacity)
select id, t.num, t.cap from rooms r
cross join (values ('T1',4),('T2',4),('T3',6),('T4',6),('T5',8),('T6',8),('T7',10),('T8',10)) as t(num,cap)
where r.type = 'NIGHTCLUB'
on conflict do nothing;

insert into club_tables (room_id, table_number, capacity)
select id, t.num, t.cap from rooms r
cross join (values ('LB1',4),('LB2',6),('LB3',8)) as t(num,cap)
where r.type = 'LIVE_BAND'
on conflict do nothing;

-- Product categories
insert into product_categories (name) values
  ('Liquor'),('Beer'),('Softdrinks'),('Mixers'),('Food'),('Water'),('Ice'),('Supplies'),('Other')
on conflict (name) do nothing;

-- Expense categories
insert into expense_categories (name) values
  ('Rent'),('Electricity'),('Water'),('Internet'),('Band Fee'),('DJ Fee'),('Performer Fee'),
  ('Staff Salary'),('Supplies'),('Inventory Purchases'),('Repairs'),('Marketing'),
  ('Facebook Ads'),('Transportation'),('Cleaning'),('Security'),('Other')
on conflict (name) do nothing;

-- Sample products
insert into products (sku, name, category_id, unit, cost_price, selling_price, current_stock, minimum_stock)
select 'TAN-001', 'Tanduay Rhum 750ml', id, 'bottle', 150, 300, 50, 10 from product_categories where name='Liquor'
on conflict (sku) do nothing;

insert into products (sku, name, category_id, unit, cost_price, selling_price, current_stock, minimum_stock)
select 'SMB-001', 'San Miguel Beer', id, 'bottle', 45, 90, 200, 48 from product_categories where name='Beer'
on conflict (sku) do nothing;

insert into products (sku, name, category_id, unit, cost_price, selling_price, current_stock, minimum_stock)
select 'CK-001', 'Coke 1L', id, 'bottle', 35, 70, 100, 24 from product_categories where name='Softdrinks'
on conflict (sku) do nothing;

insert into products (sku, name, category_id, unit, cost_price, selling_price, current_stock, minimum_stock)
select 'PLT-001', 'Bar Chips', id, 'order', 40, 120, 60, 15 from product_categories where name='Food'
on conflict (sku) do nothing;

-- Initial commission rules (per spec defaults)
select close_and_replace_commission_rule(
  (select id from rooms where type='NIGHTCLUB'), 100, 10, 10, now()
);
select close_and_replace_commission_rule(
  (select id from rooms where type='LIVE_BAND'), 0, 0, 10, now()
);
