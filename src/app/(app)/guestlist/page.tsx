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

  return (
    <GuestlistClient
      initialGuestlists={guestlists ?? []}
      rooms={rooms ?? []}
      tables={tables ?? []}
      promoters={promoters ?? []}
    />
  );
}
