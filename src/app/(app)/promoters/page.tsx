import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PromotersClient } from '@/components/promoter/PromotersClient';

export default async function PromotersPage() {
  await requireModule('promoters');
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: promoters }, { data: guestsToday }, { data: commissionToday }] = await Promise.all([
    supabase.from('promoters').select('*').order('display_name'),
    supabase.from('guestlists').select('*').eq('business_date', today),
    supabase.from('commission_records').select('*').eq('business_date', today).neq('status', 'VOIDED'),
  ]);

  return <PromotersClient promoters={promoters ?? []} guestsToday={guestsToday ?? []} commissionToday={commissionToday ?? []} />;
}
