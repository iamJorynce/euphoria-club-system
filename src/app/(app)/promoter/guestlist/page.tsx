import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PromoterGuestlistClient } from '@/components/promoter/PromoterGuestlistClient';

export default async function PromoterGuestlistPage() {
  const profile = await requireModule('promoter');
  const supabase = await createClient();

  const { data: promoter } = await supabase.from('promoters').select('*').eq('profile_id', profile.id).single();
  const [{ data: rooms }, { data: tables }, { data: guests }] = await Promise.all([
    supabase.from('rooms').select('*'),
    supabase.from('club_tables').select('*'),
    promoter
      ? supabase.from('guestlists').select('*').eq('promoter_id', promoter.id).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  return (
    <PromoterGuestlistClient
      promoterId={promoter?.id ?? ''}
      rooms={rooms ?? []}
      tables={tables ?? []}
      initialGuests={guests ?? []}
    />
  );
}
