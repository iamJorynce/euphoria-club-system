import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ReportsClient } from '@/components/reports/ReportsClient';
import { getBusinessDate } from '@/lib/business-date';

export default async function ReportsPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireModule('reports');
  const supabase = await createClient();
  const params = await searchParams;

  const to = params.to ?? getBusinessDate();
  const fromDefault = new Date();
  fromDefault.setDate(fromDefault.getDate() - 6);
  const from = params.from ?? getBusinessDate(fromDefault);

  const fromIso = new Date(from + 'T00:00:00').toISOString();
  const toIso = new Date(to + 'T23:59:59').toISOString();

  const [
    { data: orders },
    { data: orderItems },
    { data: products },
    { data: rooms },
    { data: promoters },
    { data: commissionRecords },
    { data: expenses },
    { data: expenseCategories },
    { data: inventoryTxns },
  ] = await Promise.all([
    supabase.from('orders').select('*').eq('status', 'PAID').gte('paid_at', fromIso).lte('paid_at', toIso),
    supabase.from('order_items').select('*').eq('status', 'ACTIVE'),
    supabase.from('products').select('*'),
    supabase.from('rooms').select('*'),
    supabase.from('promoters').select('*'),
    supabase.from('commission_records').select('*').gte('business_date', from).lte('business_date', to).neq('status', 'VOIDED'),
    supabase.from('expenses').select('*').is('deleted_at', null).gte('expense_date', from).lte('expense_date', to),
    supabase.from('expense_categories').select('*'),
    supabase.from('inventory_transactions').select('*').gte('created_at', fromIso).lte('created_at', toIso),
  ]);

  return (
    <ReportsClient
      from={from}
      to={to}
      orders={orders ?? []}
      orderItems={orderItems ?? []}
      products={products ?? []}
      rooms={rooms ?? []}
      promoters={promoters ?? []}
      commissionRecords={commissionRecords ?? []}
      expenses={expenses ?? []}
      expenseCategories={expenseCategories ?? []}
      inventoryTxns={inventoryTxns ?? []}
    />
  );
}
