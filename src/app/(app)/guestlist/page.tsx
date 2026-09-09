import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GuestlistClient } from '@/components/guestlist/GuestlistClient';

export default async function GuestlistPage() {
  await requireModule('guestlist');
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

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
