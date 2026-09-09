import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

function pesos(n: number) {
  return '₱' + n.toLocaleString('en-PH');
}

export default async function PromoterCommissionPage() {
  const profile = await requireModule('promoter');
  const supabase = await createClient();
  const { data: promoter } = await supabase.from('promoters').select('*').eq('profile_id', profile.id).single();

  const { data: records } = promoter
    ? await supabase
        .from('commission_records')
        .select('*')
        .eq('promoter_id', promoter.id)
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: [] as any[] };

  const total = (records ?? []).filter((r: any) => r.status !== 'VOIDED').reduce((s: number, r: any) => s + Number(r.commission_amount), 0);

  const byDate: Record<string, any[]> = {};
  for (const r of records ?? []) {
    byDate[r.business_date] = byDate[r.business_date] || [];
    byDate[r.business_date].push(r);
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold">My Commission</h1>
      <div className="rounded-xl border border-fuchsia-900/40 bg-fuchsia-950/10 p-4 text-center">
        <div className="text-xs text-neutral-500 mb-1">All-time total</div>
        <div className="text-3xl font-bold text-fuchsia-400">{pesos(total)}</div>
      </div>

      <div className="space-y-4">
        {Object.entries(byDate).map(([date, items]) => (
          <div key={date}>
            <div className="text-xs font-medium text-neutral-500 mb-2">{new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
            <div className="space-y-1.5">
              {items.map((r) => (
                <div key={r.id} className="flex justify-between items-center rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm">
                  <span className={r.status === 'VOIDED' ? 'text-neutral-600 line-through' : 'text-neutral-300'}>
                    {r.component === 'ENTRANCE' ? 'Entrance commission' : 'Consumption commission'}
                  </span>
                  <span className={r.status === 'VOIDED' ? 'text-neutral-600 line-through' : 'font-medium'}>{pesos(Number(r.commission_amount))}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {(records ?? []).length === 0 && <div className="text-center text-neutral-600 text-sm py-10">No commission records yet.</div>}
      </div>
    </div>
  );
}
