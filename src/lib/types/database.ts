// Hand-maintained types matching supabase/migrations/*.sql.
// In a real deployment, regenerate with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/types/database.ts
// This hand-written version keeps the app compiling before that step is run.

export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'PROMOTER' | 'RECEPTIONIST';
export type RoomType = 'LIVE_BAND' | 'NIGHTCLUB';
export type TableStatus = 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'BILLING' | 'CLEANING';
export type GuestStatus = 'RESERVED' | 'ARRIVED' | 'NO_SHOW' | 'RELEASED' | 'WALK_IN';
export type OrderStatus = 'OPEN' | 'BILLING' | 'PAID' | 'CANCELLED' | 'VOIDED';
export type OrderItemStatus = 'ACTIVE' | 'VOIDED' | 'COMPLIMENTARY' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'GCASH' | 'CARD' | 'OTHER';
export type PaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'REFUNDED' | 'FAILED';
export type CommissionComponent = 'ENTRANCE' | 'CONSUMPTION';
export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'VOIDED';
export type ShiftStatus = 'OPEN' | 'CLOSED';

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Promoter {
  id: string;
  profile_id: string | null;
  display_name: string;
  phone: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface Room {
  id: string;
  type: RoomType;
  name: string;
  entrance_fee: number;
  is_active: boolean;
}

export interface ClubTable {
  id: string;
  room_id: string;
  table_number: string;
  capacity: number;
  status: TableStatus;
}

export interface Guestlist {
  id: string;
  promoter_id: string;
  room_id: string;
  group_name: string;
  pax: number;
  eta: string;
  table_id: string | null;
  notes: string | null;
  status: GuestStatus;
  is_walk_in: boolean;
  arrived_at: string | null;
  business_date: string;
  created_at: string;
}

export interface Product {
  id: string;
  sku: string | null;
  name: string;
  category_id: string | null;
  unit: string;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  minimum_stock: number;
  supplier_id: string | null;
  is_active: boolean;
}

export interface ProductPublic {
  id: string;
  sku: string | null;
  name: string;
  category_id: string | null;
  unit: string;
  selling_price: number;
  is_active: boolean;
}

export interface Order {
  id: string;
  order_number: string;
  room_id: string;
  table_id: string | null;
  guestlist_id: string | null;
  promoter_id: string | null;
  cashier_id: string | null;
  shift_id: string | null;
  status: OrderStatus;
  subtotal: number;
  discount_total: number;
  entrance_total: number;
  grand_total: number;
  opened_at: string;
  paid_at: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  status: OrderItemStatus;
  notes: string | null;
}

export interface Payment {
  id: string;
  order_id: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  reference_number: string | null;
}

export interface Expense {
  id: string;
  category_id: string;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: PaymentMethod;
  deleted_at: string | null;
}

export interface CommissionRule {
  id: string;
  room_id: string;
  entrance_fee: number;
  entrance_commission_per_head: number;
  consumption_commission_pct: number;
  effective_from: string;
  effective_until: string | null;
}

export interface CommissionRecord {
  id: string;
  promoter_id: string;
  guestlist_id: string | null;
  order_id: string | null;
  component: CommissionComponent;
  base_amount: number;
  rate: number;
  commission_amount: number;
  status: CommissionStatus;
  business_date: string;
  created_at: string;
}

export interface CommissionAdjustment {
  id: string;
  promoter_id: string;
  commission_record_id: string | null;
  original_amount: number;
  new_amount: number;
  adjustment_amount: number;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  module: string;
  record_table: string | null;
  record_id: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  created_at: string;
}

export interface Shift {
  id: string;
  cashier_id: string;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  variance: number | null;
  status: ShiftStatus;
  opened_at: string;
  closed_at: string | null;
}

// Placeholder — satisfies createBrowserClient<Database> generic without full codegen.
// Safe because we always import row types above directly rather than through
// Database['public']['Tables'][...] indexing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
