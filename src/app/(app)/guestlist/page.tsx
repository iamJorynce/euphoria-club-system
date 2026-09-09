import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GuestlistClient } from '@/components/guestlist/GuestlistClient';
import { getBusinessDate } from '@/lib/business-date';

export default async function GuestlistPage() {
  await requireModule('guestlist');
  const supabase = await createClient();
  const today = getBusinessDate();

  const [{ data: guestlists }, { data: rooms }, { data: tables }, { data: promoters }] = await Promise.all([
    supabase.from('guestlists').select('*').eq('business_date', today).order('eta'),
    supabase.from('rooms').select('*'),
    supabase.from('club_tables').select('*'),
    supabase.from('promoters').select('*').eq('is_active', true),
  ]);

  const guestlistIds = (guestlists ?? []).map((g) => g.id);
  const { data: guestlistGuests } = guestlistIds.length
    ? await supabase.from('guestlist_guests').select('*').in('guestlist_id', guestlistIds)
    : { data: [] as any[] };

  return (
    <GuestlistClient
      initialGuestlists={guestlists ?? []}
      initialGuestlistGuests={guestlistGuests ?? []}
      rooms={rooms ?? []}
      tables={tables ?? []}
      promoters={promoters ?? []}
    />
  );
}
