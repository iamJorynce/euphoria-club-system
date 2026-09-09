import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAccess, type MODULE_ACCESS } from '@/lib/auth/roles';
import type { Profile } from '@/lib/types/database';

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data as Profile | null;
}

/**
 * Server Component / route guard. Redirects to /login if not authenticated,
 * and to /dashboard (or /promoter) with a denial if the role lacks access.
 * This is a UX convenience — the real enforcement is Postgres RLS.
 */
export async function requireModule(moduleKey: keyof typeof MODULE_ACCESS): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canAccess(profile.role, moduleKey)) {
    redirect('/unauthorized');
  }
  return profile;
}
