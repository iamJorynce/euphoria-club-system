'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, StatCard } from '@/components/ui/StatCard';

function pesos(n: number) {
  return '₱' + Math.round(n).toLocaleString('en-PH');
}

const RANGE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: 1, single: true },
  { label: 'This week', days: 7 },
  { label: 'This month', days: 30 },
];

export function ReportsClient({
  from, to, orders, orderItems, products, rooms, promoters, commissionRecords, expenses, expenseCategories, inventoryTxns,
}: {
  from: string; to: string; orders: any[]; orderItems: any[]; products: any[]; rooms: any[]; promoters: any[];
  commissionRecords: any[]; expenses: any[]; expenseCategories: any[]; inventoryTxns: any[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'sales' | 'promoter' | 'inventory' | 'expenses' | 'profitability'>('sales');
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function applyRange(days: number, single?: boolean) {
    const toDate = single ? new Date(Date.now() - 86400000) : new Date();
    const fromDate = single ? toDate : new Date(Date.now() - days * 86400000);
    const f = fromDate.toISOString().slice(0, 10);
    const t = toDate.toISOString().slice(0, 10);
    router.push(`/reports?from=${f}&to=${t}`);
  }

  const orderIds = new Set(orders.map((o) => o.id));
  const itemsInRange = orderItems.filter((i) => orderIds.has(i.order_id));

  const totalSales = orders.reduce((s, o) => s + Number(o.grand_total), 0);
  const byRoom = rooms.map((r) => ({ room: r, total: orders.filter((o) => o.room_id === r.id).reduce((s, o) => s + Number(o.grand_total), 0) }));
  const byProduct = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const it of itemsInRange) {
      const p = products.find((pr) => pr.id === it.product_id);
      const key = it.product_id;
      if (!map[key]) map[key] = { name: p?.name ?? 'Unknown', qty: 0, revenue: 0 };
      map[key].qty += Number(it.quantity);
      map[key].revenue += Number(it.line_total);
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [itemsInRange, products]);

  const paymentBreakdown: Record<string, number> = {};
  // payments not directly loaded; approximate via order grand_total grouped is not accurate without payments table,
  // so this section is intentionally omitted from this simplified report (see payments table for full detail).

  const byPromoter = promoters.map((p) => {
    const recs = commissionRecords.filter((c) => c.promoter_id === p.id);
    const entrance = recs.filter((c) => c.component === 'ENTRANCE').reduce((s, c) => s + Number(c.commission_amount), 0);
    const consumption = recs.filter((c) => c.component === 'CONSUMPTION').reduce((s, c) => s + Number(c.commission_amount), 0);
    return { promoter: p, entrance, consumption, total: entrance + consumption };
  }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);

  const cogs = itemsInRange.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_cost), 0);
  const totalCommission = commissionRecords.reduce((s, c) => s + Number(c.commission_amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const grossProfit = totalSales - cogs;
  const estimatedContribution = grossProfit - totalCommission - totalExpenses;

  const lowStock = products.filter((p) => Number(p.current_stock) <= Number(p.minimum_stock) && p.is_active);
  const wastage = inventoryTxns.filter((t) => t.txn_type === 'WASTAGE' || t.txn_type === 'DAMAGED');

  const expenseByCategory = expenseCategories.map((c) => ({
    category: c, total: expenses.filter((e) => e.category_id === c.id).reduce((s, e) => s + Number(e.amount), 0),
  })).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);

  return (
    <div className="pb-10">
      <PageHeader title="Reports" description={`${from} to ${to}`} />

      <div className="px-4 pt-4 flex flex-wrap gap-2">
        {RANGE_PRESETS.map((r) => (
          <button key={r.label} onClick={() => applyRange(r.days, r.single)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-neutral-100">
            {r.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs" />
          <span className="text-neutral-600 text-xs">to</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs" />
          <button onClick={() => router.push(`/reports?from=${customFrom}&to=${customTo}`)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-fuchsia-600">Apply</button>
        </div>
      </div>

      <div className="px-4 pt-3 flex gap-2 overflow-x-auto">
        {(['sales', 'promoter', 'inventory', 'expenses', 'profitability'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize whitespace-nowrap ${tab === t ? 'bg-fuchsia-600' : 'bg-neutral-900 text-neutral-400'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'sales' && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Sales" value={pesos(totalSales)} />
            <StatCard label="Orders" value={String(orders.length)} />
            <StatCard label="Avg. Order Value" value={pesos(orders.length ? totalSales / orders.length : 0)} />
            <StatCard label="Items Sold" value={String(itemsInRange.reduce((s, i) => s + Number(i.quantity), 0))} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-300 mb-2">Sales by room</h3>
            <div className="space-y-1.5">
              {byRoom.map((r) => (
                <div key={r.room.id} className="flex justify-between text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                  <span>{r.room.name}</span><span className="font-medium">{pesos(r.total)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-300 mb-2">Sales by product</h3>
            <div className="space-y-1.5">
              {byProduct.slice(0, 15).map((p) => (
                <div key={p.name} className="flex justify-between text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                  <span>{p.name} <span className="text-neutral-600">×{p.qty}</span></span><span className="font-medium">{pesos(p.revenue)}</span>
                </div>
              ))}
              {byProduct.length === 0 && <div className="text-center text-neutral-600 text-sm py-6">No sales in this range.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'promoter' && (
        <div className="p-4 space-y-2">
          {byPromoter.map((r) => (
            <div key={r.promoter.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 flex justify-between items-center">
              <div>
                <div className="font-medium text-sm">{r.promoter.display_name}</div>
                <div className="text-xs text-neutral-500">Entrance {pesos(r.entrance)} · Consumption {pesos(r.consumption)}</div>
              </div>
              <div className="font-semibold text-fuchsia-400">{pesos(r.total)}</div>
            </div>
          ))}
          {byPromoter.length === 0 && <div className="text-center text-neutral-600 text-sm py-10">No promoter commission in this range.</div>}
        </div>
      )}

      {tab === 'inventory' && (
        <div className="p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-rose-400 mb-2">Low stock ({lowStock.length})</h3>
            <div className="space-y-1.5">
              {lowStock.map((p) => (
                <div key={p.id} className="flex justify-between text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                  <span>{p.name}</span><span className="text-rose-400">{p.current_stock} / min {p.minimum_stock}</span>
                </div>
              ))}
              {lowStock.length === 0 && <div className="text-xs text-neutral-600">All stock levels healthy.</div>}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-300 mb-2">Wastage & damaged ({wastage.length} transactions)</h3>
            <div className="space-y-1.5">
              {wastage.slice(0, 15).map((t) => {
                const p = products.find((pr) => pr.id === t.product_id);
                return (
                  <div key={t.id} className="flex justify-between text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                    <span>{p?.name} · {t.txn_type}</span><span>{Math.abs(t.quantity)} {p?.unit}</span>
                  </div>
                );
              })}
              {wastage.length === 0 && <div className="text-xs text-neutral-600">No wastage/damage recorded.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="p-4 space-y-4">
          <StatCard label="Total Expenses" value={pesos(totalExpenses)} accent="bad" />
          <div>
            <h3 className="text-sm font-semibold text-neutral-300 mb-2">By category</h3>
            <div className="space-y-1.5">
              {expenseByCategory.map((r) => (
                <div key={r.category.id} className="flex justify-between text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                  <span>{r.category.name}</span><span className="font-medium">{pesos(r.total)}</span>
                </div>
              ))}
              {expenseByCategory.length === 0 && <div className="text-center text-neutral-600 text-sm py-6">No expenses in this range.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'profitability' && (
        <div className="p-4 max-w-lg">
          <div className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900 rounded-lg p-2.5 mb-4">
            Estimate only — not a finalized accounting statement. Excludes non-POS revenue/costs.
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800">
            <Row label="Total Sales" value={pesos(totalSales)} />
            <Row label="Less: COGS" value={`(${pesos(cogs)})`} muted />
            <Row label="Gross Profit" value={pesos(grossProfit)} bold />
            <Row label="Less: Promoter Commissions" value={`(${pesos(totalCommission)})`} muted />
            <Row label="Less: Operating Expenses" value={`(${pesos(totalExpenses)})`} muted />
            <Row label="Estimated Contribution" value={pesos(estimatedContribution)} bold accent={estimatedContribution >= 0 ? 'good' : 'bad'} />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, muted, accent }: { label: string; value: string; bold?: boolean; muted?: boolean; accent?: 'good' | 'bad' }) {
  return (
    <div className="flex justify-between px-4 py-3 text-sm">
      <span className={muted ? 'text-neutral-500' : 'text-neutral-300'}>{label}</span>
      <span className={`${bold ? 'font-bold text-base' : 'font-medium'} ${accent === 'good' ? 'text-emerald-400' : accent === 'bad' ? 'text-rose-400' : ''}`}>{value}</span>
    </div>
  );
}
