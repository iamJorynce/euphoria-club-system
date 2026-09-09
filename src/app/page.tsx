import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/session';
import { homeRouteForRole } from '@/lib/auth/roles';

export default async function RootPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  redirect(homeRouteForRole(profile.role));
}
