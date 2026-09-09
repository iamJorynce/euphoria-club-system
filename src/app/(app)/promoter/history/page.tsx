import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const STATUS_STYLE: Record<string, string> = {
  RESERVED: 'bg-sky-950/40 text-sky-400 border-sky-900',
  ARRIVED: 'bg-emerald-950/40 text-emerald-400 border-emerald-900',
  NO_SHOW: 'bg-rose-950/40 text-rose-400 border-rose-900',
  RELEASED: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  WALK_IN: 'bg-amber-950/40 text-amber-400 border-amber-900',
};

export default async function PromoterHistoryPage() {
  const profile = await requireModule('promoter');
  const supabase = await createClient();
  const { data: promoter } = await supabase.from('promoters').select('*').eq('profile_id', profile.id).single();

  const { data: guests } = promoter
    ? await supabase.from('guestlists').select('*').eq('promoter_id', promoter.id).order('business_date', { ascending: false }).limit(100)
    : { data: [] as any[] };

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-bold">Guest History</h1>
      {(guests ?? []).map((g: any) => (
        <div key={g.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{g.group_name}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLE[g.status]}`}>{g.status}</span>
          </div>
          <div className="text-xs text-neutral-500 mt-1">{g.business_date} · {g.pax} pax</div>
        </div>
      ))}
      {(guests ?? []).length === 0 && <div className="text-center text-neutral-600 text-sm py-10">No history yet.</div>}
    </div>
  );
}
