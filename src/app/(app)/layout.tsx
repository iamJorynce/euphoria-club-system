import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/session';
import { AppNav } from '@/components/layout/AppNav';
import { PromoterNav } from '@/components/layout/PromoterNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.is_active) redirect('/login?deactivated=1');

  if (profile.role === 'PROMOTER') {
    return (
      <div className="min-h-screen flex flex-col">
        <PromoterNav />
        <main className="flex-1 pb-20 max-w-lg mx-auto w-full">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <AppNav role={profile.role} fullName={profile.full_name} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
