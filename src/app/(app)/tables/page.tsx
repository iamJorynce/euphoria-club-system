import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { TablesClient } from '@/components/tables/TablesClient';

export default async function TablesPage() {
  await requireModule('tables');
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: rooms }, { data: tables }, { data: guestlists }] = await Promise.all([
    supabase.from('rooms').select('*'),
    supabase.from('club_tables').select('*').eq('is_active', true),
    supabase.from('guestlists').select('*').eq('business_date', today).in('status', ['RESERVED', 'ARRIVED']),
  ]);

  return <TablesClient rooms={rooms ?? []} tables={tables ?? []} guestlists={guestlists ?? []} />;
}
