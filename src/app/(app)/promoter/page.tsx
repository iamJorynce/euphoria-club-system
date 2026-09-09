import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus } from 'lucide-react';

function pesos(n: number) {
  return '₱' + n.toLocaleString('en-PH');
}

export default async function PromoterTonightPage() {
  const profile = await requireModule('promoter');
  const supabase = await createClient();

  const { data: promoter } = await supabase.from('promoters').select('*').eq('profile_id', profile.id).single();
  if (!promoter) {
    return <div className="p-6 text-center text-neutral-500 text-sm">No promoter profile linked to your account yet. Contact an admin.</div>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: guests }, { data: rooms }, { data: commission }] = await Promise.all([
    supabase.from('guestlists').select('*').eq('promoter_id', promoter.id).eq('business_date', today),
    supabase.from('rooms').select('*'),
    supabase.from('commission_records').select('*').eq('promoter_id', promoter.id).eq('business_date', today).neq('status', 'VOIDED'),
  ]);

  const nightclub = rooms?.find((r: any) => r.type === 'NIGHTCLUB');
  const liveBand = rooms?.find((r: any) => r.type === 'LIVE_BAND');

  const arrived = (guests ?? []).filter((g: any) => g.status === 'ARRIVED').length;
  const nightclubGuests = (guests ?? []).filter((g: any) => g.room_id === nightclub?.id).length;
  const liveBandGuests = (guests ?? []).filter((g: any) => g.room_id === liveBand?.id).length;
  const entranceCommission = (commission ?? []).filter((c: any) => c.component === 'ENTRANCE').reduce((s: number, c: any) => s + Number(c.commission_amount), 0);
  const consumptionCommission = (commission ?? []).filter((c: any) => c.component === 'CONSUMPTION').reduce((s: number, c: any) => s + Number(c.commission_amount), 0);
  const totalCommission = entranceCommission + consumptionCommission;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-lg font-bold">Tonight</h1>
        <p className="text-sm text-neutral-500">Hi {promoter.display_name.split(' ')[0]}, here's tonight's snapshot.</p>
      </div>

      <Link href="/promoter/guestlist" className="flex items-center justify-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 rounded-xl py-3.5 font-semibold text-sm">
        <Plus size={18} /> Add Guest / Group
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="My Guests" value={String(guests?.length ?? 0)} />
        <MiniStat label="Arrived" value={String(arrived)} accent="good" />
        <MiniStat label="Nightclub" value={String(nightclubGuests)} />
        <MiniStat label="Live Band" value={String(liveBandGuests)} />
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="text-xs text-neutral-500 mb-3 font-medium">TONIGHT'S COMMISSION</div>
        <div className="flex justify-between text-sm py-1"><span className="text-neutral-400">Entrance commission</span><span>{pesos(entranceCommission)}</span></div>
        <div className="flex justify-between text-sm py-1"><span className="text-neutral-400">Consumption commission</span><span>{pesos(consumptionCommission)}</span></div>
        <div className="flex justify-between font-bold text-base pt-2 mt-1 border-t border-neutral-800"><span>Total</span><span className="text-fuchsia-400">{pesos(totalCommission)}</span></div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: 'good' }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3.5">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${accent === 'good' ? 'text-emerald-400' : 'text-neutral-100'}`}>{value}</div>
    </div>
  );
}
