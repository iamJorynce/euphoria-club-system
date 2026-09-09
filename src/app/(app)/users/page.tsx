import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { UsersClient } from '@/components/users/UsersClient';

export default async function UsersPage() {
  await requireModule('users');
  const supabase = await createClient();

  const [{ data: profiles }, { data: promoters }] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('promoters').select('*'),
  ]);

  return <UsersClient profiles={profiles ?? []} promoters={promoters ?? []} />;
}
