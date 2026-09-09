import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatCard } from '@/components/ui/StatCard';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { getBusinessDate, getBusinessDateRange } from '@/lib/business-date';

function pesos(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default async function DashboardPage() {
  await requireModule('dashboard');
  const supabase = await createClient();

  // "Today" here means the current business night (06:00 Asia/Manila to
  // 05:59:59 the next day), not the UTC/server calendar day — see
  // src/lib/business-date.ts for why.
  const todayDate = getBusinessDate();
  const { start: businessDayStart } = getBusinessDateRange();
  const todayIso = businessDayStart.toISOString();

  const [
    { data: rooms },
    { data: paidOrders },
    { data: guestsToday },
    { data: expensesToday },
    { data: commissionToday },
    { data: lowStock },
    { data: openTables },
    { data: pendingReservations },
  ] = await Promise.all([
    supabase.from('rooms').select('*'),
    supabase.from('orders').select('*').eq('status', 'PAID').gte('paid_at', todayIso),
    supabase.from('guestlists').select('*').eq('business_date', todayDate),
    supabase.from('expenses').select('*').eq('expense_date', todayDate).is('deleted_at', null),
    supabase.from('commission_records').select('*').eq('business_date', todayDate).neq('status', 'VOIDED'),
    supabase.from('products').select('*').eq('is_active', true),
    supabase.from('club_tables').select('*').in('status', ['OCCUPIED', 'BILLING']),
    supabase.from('guestlists').select('*').eq('status', 'RESERVED').eq('business_date', todayDate),
  ]);

  const nightclubRoom = rooms?.find((r: any) => r.type === 'NIGHTCLUB');
  const liveBandRoom = rooms?.find((r: any) => r.type === 'LIVE_BAND');

  const totalSales = (paidOrders ?? []).reduce((s: number, o: any) => s + Number(o.grand_total), 0);
  const nightclubSales = (paidOrders ?? [])
    .filter((o: any) => o.room_id === nightclubRoom?.id)
    .reduce((s: number, o: any) => s + Number(o.grand_total), 0);
  const liveBandSales = (paidOrders ?? [])
    .filter((o: any) => o.room_id === liveBandRoom?.id)
    .reduce((s: number, o: any) => s + Number(o.grand_total), 0);
  const entranceRevenue = (paidOrders ?? []).reduce((s: number, o: any) => s + Number(o.entrance_total), 0);

  const promoterGuests = (guestsToday ?? []).filter((g: any) => !g.is_walk_in).length;
  const totalExpensesToday = (expensesToday ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const totalCommissionToday = (commissionToday ?? []).reduce((s: number, c: any) => s + Number(c.commission_amount), 0);
  const lowStockItems = (lowStock ?? []).filter((p: any) => Number(p.current_stock) <= Number(p.minimum_stock));

  const grossContribution = totalSales - totalCommissionToday - totalExpensesToday;

  return (
    <div className="pb-10">
      <PageHeader title="Dashboard" description="Tonight at a glance" />

      <div className="p-4 lg:p-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Today's Total Sales" value={pesos(totalSales)} />
        <StatCard label="Live Band Sales" value={pesos(liveBandSales)} />
        <StatCard label="Nightclub Sales" value={pesos(nightclubSales)} />
        <StatCard label="Entrance Revenue" value={pesos(entranceRevenue)} />
        <StatCard label="Promoter Guests Tonight" value={String(promoterGuests)} />
        <StatCard label="Promoter Commissions" value={pesos(totalCommissionToday)} accent="warn" />
        <StatCard label="Today's Expenses" value={pesos(totalExpensesToday)} accent="bad" />
        <StatCard
          label="Est. Gross Contribution"
          value={pesos(grossContribution)}
          accent={grossContribution >= 0 ? 'good' : 'bad'}
        />
        <StatCard label="Open Tables" value={String(openTables?.length ?? 0)} />
        <StatCard label="Pending Reservations" value={String(pendingReservations?.length ?? 0)} />
        <StatCard
          label="Low Stock Alerts"
          value={String(lowStockItems.length)}
          accent={lowStockItems.length > 0 ? 'bad' : 'good'}
        />
      </div>

      <DashboardCharts paidOrders={paidOrders ?? []} rooms={rooms ?? []} />

      {lowStockItems.length > 0 && (
        <div className="px-4 lg:px-6 mt-2">
          <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-4">
            <div className="text-sm font-semibold text-rose-400 mb-2">Low stock alerts</div>
            <ul className="text-sm text-neutral-300 space-y-1">
              {lowStockItems.slice(0, 8).map((p: any) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-neutral-500">{p.current_stock} {p.unit} left (min {p.minimum_stock})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
