'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Users, Wallet, History, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const TABS = [
  { href: '/promoter', label: 'Tonight', icon: Home },
  { href: '/promoter/guestlist', label: 'Guestlist', icon: Users },
  { href: '/promoter/commission', label: 'Commission', icon: Wallet },
  { href: '/promoter/history', label: 'History', icon: History },
];

export function PromoterNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.rpc('write_audit_log', {
      p_action: 'LOGOUT', p_module: 'auth', p_table: null, p_record_id: null, p_old: null, p_new: null, p_reason: null,
    }).then(undefined, () => {});
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 h-14 border-b border-neutral-800 sticky top-0 bg-neutral-950 z-30">
        <span className="font-semibold text-fuchsia-400">Club POS</span>
        <button onClick={handleLogout} className="p-2 text-neutral-400" aria-label="Sign out">
          <LogOut size={20} />
        </button>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-800 bg-neutral-950 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium ${
                active ? 'text-fuchsia-400' : 'text-neutral-500'
              }`}
            >
              <Icon size={20} />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
