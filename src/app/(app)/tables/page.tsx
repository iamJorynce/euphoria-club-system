import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { TablesClient } from '@/components/tables/TablesClient';
import { getBusinessDate } from '@/lib/business-date';

export default async function TablesPage() {
  await requireModule('tables');
  const supabase = await createClient();
  const today = getBusinessDate();

  const [{ data: rooms }, { data: tables }, { data: guestlists }] = await Promise.all([
    supabase.from('rooms').select('*'),
    supabase.from('club_tables').select('*').eq('is_active', true),
    supabase.from('guestlists').select('*').eq('business_date', today).in('status', ['RESERVED', 'ARRIVED']),
  ]);

  return <TablesClient rooms={rooms ?? []} tables={tables ?? []} guestlists={guestlists ?? []} />;
}
