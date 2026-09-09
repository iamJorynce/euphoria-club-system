# Club POS — Live Band + Nightclub POS & Management System

A production-oriented POS, guestlist, promoter-commission, inventory, and
reporting system for a nightlife venue with two rooms (Live Band / Nightclub),
built with Next.js, TypeScript, Tailwind, and Supabase (Postgres + Auth + RLS
+ Realtime). PWA-installable, mobile-first for promoters.

## What's implemented

| Module | Status |
|---|---|
| Database schema (20+ tables, UUID PKs, audit columns) | ✅ complete |
| Row Level Security for every table | ✅ complete |
| Commission engine (versioned rules, auto entrance + consumption credit, manual adjustments, audit log) | ✅ complete |
| Inventory auto-deduction / restock / purchase receiving | ✅ complete |
| Auth, role-based routing, PWA manifest/service worker | ✅ complete |
| Dashboard (live charts, low-stock alerts) | ✅ complete |
| POS — persistent per-table tabs, cart, entrance charge, modifiers/add-ons, void items, cancel order, transfer table, merge bills, split bill, authorized promoter reassignment, checkout | ✅ complete |
| Receptionist role — door screen: view tonight's arrivals, collect the entrance fee (no product cart, no shift), assign a table | ✅ complete |
| Receipt printing (print-formatted, no commission shown to guest) | ✅ complete |
| Shift open + close with cash variance | ✅ complete |
| Tables (visual status board) | ✅ complete |
| Guestlist (staff verification + promoter self-service, realtime, duplicate detection) | ✅ complete |
| Promoter mobile dashboard (Tonight / Guestlist / Commission / History) | ✅ complete |
| Promoter management (admin/manager roster + tonight's performance) | ✅ complete |
| Inventory (products, stock adjustments) | ✅ complete |
| Purchasing (PO creation, receiving → auto stock-in) | ✅ complete |
| Expenses (add/filter/search, soft-delete with reason + audit log) | ✅ complete |
| Reports (sales, promoter, inventory, expenses, profitability, date filters) | ✅ complete |
| Users & Permissions (create logins via admin API, role editor, promoter linking) | ✅ complete |
| Settings (tables, product categories, suppliers, product add-ons/modifiers) | ✅ complete |
| Audit Logs (viewer + login/logout trail) | ✅ complete |

`npm run build` passes cleanly (TypeScript strict mode, all 21 routes).

## Not yet wired up

Only the item the spec explicitly said to *not* build in this phase remains:

- **Hotel module** — intentionally stubbed only (`hotel_guests`, `hotel_bookings`
  tables, no UI), per the spec's "prepare architecture, don't build it" instruction.

Everything else from the original spec — including split bill, merge bills,
transfer table, promoter reassignment with authorization, modifiers/add-ons,
receipt printing, and shift close — is implemented.

### A note on the POS's "open tab" model

Migration `0005_pos_extensions.sql` changes how orders work: selecting an
occupied table now loads (or lazily creates) a **persistent open order** for
that table, which items get added to over the course of the night — rather
than the earlier single-shot "build a cart, pay immediately" flow. This is
what makes split bill, merge bills, and table transfer meaningfully possible,
and it matches the spec's own language about tables having a "current order."
Walk-up sales (no table selected) still use a simple one-shot cart, since
there's no table to hang a running tab off of.

## Getting started

### 1. Create a Supabase project
Create a project at supabase.com, then grab your Project URL, anon key, and
service role key from **Project Settings → API**.

### 2. Configure environment variables
```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY
```

### 3. Run the database migrations
In the Supabase SQL Editor (or via the Supabase CLI), run the files in
`supabase/migrations/` **in order**:

```
0001_schema.sql
0002_functions.sql
0003_rls.sql
0004_auth_bootstrap.sql
0005_pos_extensions.sql
0006_business_date_fix.sql
0007_receptionist_role.sql
0008_receptionist_access.sql
```

Or with the CLI:
```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

### 4. Create your first admin user
There's no self-signup by design — accounts are admin-provisioned. So:

1. In the Supabase dashboard, go to **Authentication → Users → Add user**,
   create yourself with an email/password.
2. In the SQL Editor, promote yourself:
   ```sql
   update profiles set role = 'ADMIN' where id = '<your-auth-user-id>';
   ```
3. From then on, use the in-app **Users** module to create everyone else
   (it calls `/api/users/create`, which uses the service role key server-side).

### 5. (Optional) Load demo data
Run `supabase/seed.sql` in the SQL editor for sample rooms, tables, products,
and default commission rules matching the spec's defaults (₱100 nightclub
entrance, ₱10 entrance commission, 10% consumption commission).

### 6. Regenerate types (recommended before real use)
`src/lib/types/database.ts` is hand-written to unblock development. Once your
schema is live, regenerate it properly:
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/lib/types/database.ts
```
(then re-add the named exports this app imports, e.g. `Profile`, `Order`, etc.,
or refactor call sites to use `Database['public']['Tables']['profiles']['Row']`.)

### 7. Run locally
```bash
npm install
npm run dev
```

### 8. Deploy
Push to GitHub, import into Vercel, set the same three env vars in the Vercel
project settings, deploy. No other config needed — this is a standard Next.js
App Router project.

## Architecture notes

- **RLS is the real security boundary.** Every table has row level security
  policies (`supabase/migrations/0003_rls.sql`). The `src/lib/auth/roles.ts`
  module and `requireModule()` server helper are a UX convenience for
  routing/nav — they must never be treated as the security layer, and the
  policies do not depend on them.
- **Commission math lives in Postgres**, not the app, via
  `get_active_commission_rule()`, `credit_entrance_commission()`, and
  `credit_consumption_commission()` triggers (`0002_functions.sql`). This
  guarantees correct historical rates regardless of which client/version
  calculated a sale, and guarantees commission can never be created by a
  client bypassing business rules — only real, verified DB state changes
  (`guestlist_guests.paid_entrance = true`, `orders.status = 'PAID'`) can
  trigger it.
- **Inventory deduction is a trigger**, not application code
  (`order_item_deduct_inventory()`), so it fires no matter which surface
  creates an order line — POS today, a future kiosk or API integration
  tomorrow.
- **Promoter attribution follows the guest group, not the table** — `orders.promoter_id`
  and `orders.guestlist_id` are set at order-creation time in the POS (from the
  arrived guestlist tied to the selected table), matching the spec's rule that
  attribution isn't lost if guests move rooms or tables.
- **Receptionist's entrance charge is its own closed-out order, not the table's tab.**
  `ReceptionEntranceClient` inserts an order with `status: 'PAID'` directly
  (room + guestlist + entrance_total only, no `table_id`, no order_items) and
  a matching payment, instead of opening a normal `OPEN` order the way POS
  does. Two reasons: (1) skipping the `OPEN → PAID` transition means the
  `credit_consumption_commission` trigger (which only fires `after update of
  status`) never fires for it, so the entrance amount isn't double-credited
  as a consumption commission on top of the entrance commission that
  `guestlist_guests.paid_entrance` already triggers; (2) leaving `table_id`
  null keeps this transaction separate from whatever tab the cashier opens
  at the guest's table later, so the guest's eventual bar bill isn't paid
  twice. Table assignment itself is purely `guestlists.table_id` +
  `club_tables.status` — no financial record — so a receptionist can (re)seat
  a group without touching billing at all.
- **Commission rules are append-only/versioned.** `close_and_replace_commission_rule()`
  closes the currently-open rule (`effective_until = now`) and inserts a new
  one rather than mutating history, so past commission calculations are
  reproducible forever.

## Test scenario (from the spec) — how to verify it end-to-end

1. Sign in as Admin → **Users**: create Mark as a `PROMOTER`, then in
   **Promoters** add his promoter record and link it to his login.
2. **Commission** → Nightclub: set entrance fee ₱100, entrance commission
   ₱10, consumption 10%, save.
3. Sign in as Mark → **Add Guest**: "Juan Dela Cruz", 6 pax, Nightclub, ETA 10:30 PM.
4. Sign in as Manager/Cashier → **Guestlist**: see it appear in real time, tap ✓ to mark ARRIVED.
5. **POS**: select Nightclub → select the table Juan's group is on (attribution
   auto-fills from the arrived guestlist) → tap **Charge entrance** (₱600 for 6 pax) →
   this credits ₱60 entrance commission automatically.
6. Add ₱3,000 of products to the cart → **Complete Sale** → inventory
   deducts automatically, order is marked PAID, ₱300 consumption commission
   (10%) is credited automatically.
7. **Reports → Promoter**: see Mark's ₱360 total for tonight.
8. **Expenses**: add a ₱5,000 expense → **Reports → Profitability** updates.
9. **Commission → Settings**: change Nightclub consumption to 7.5% with a
   future effective date/time → the earlier ₱300 record is untouched (verify
   in **Commission → Records**); only sales after that timestamp use 7.5%.
10. **Audit Logs**: confirm the commission rule change is recorded.
