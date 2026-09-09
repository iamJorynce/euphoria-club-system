import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { CommissionClient } from '@/components/commission/CommissionClient';

export default async function CommissionPage() {
  await requireModule('commission');
  const supabase = await createClient();

  const [{ data: rooms }, { data: rules }, { data: promoters }, { data: records }] = await Promise.all([
    supabase.from('rooms').select('*'),
    supabase.from('commission_rules').select('*').order('effective_from', { ascending: false }),
    supabase.from('promoters').select('*'),
    supabase.from('commission_records').select('*').order('created_at', { ascending: false }).limit(100),
  ]);

  return (
    <CommissionClient
      rooms={rooms ?? []}
      rules={rules ?? []}
      promoters={promoters ?? []}
      records={records ?? []}
    />
  );
}
