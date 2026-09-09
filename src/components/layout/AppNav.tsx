'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Grid3x3, Users, UserCog, Percent,
  Boxes, Truck, Receipt, BarChart3, ShieldCheck, Settings, ScrollText, LogOut, Menu, X,
} from 'lucide-react';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MODULE_ACCESS } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/types/database';

const NAV_ITEMS: { href: string; label: string; icon: any; module: keyof typeof MODULE_ACCESS }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { href: '/pos', label: 'POS', icon: ShoppingCart, module: 'pos' },
  { href: '/tables', label: 'Tables', icon: Grid3x3, module: 'tables' },
  { href: '/guestlist', label: 'Guestlist', icon: Users, module: 'guestlist' },
  { href: '/promoters', label: 'Promoters', icon: UserCog, module: 'promoters' },
  { href: '/commission', label: 'Commission', icon: Percent, module: 'commission' },
  { href: '/inventory', label: 'Inventory', icon: Boxes, module: 'inventory' },
  { href: '/purchasing', label: 'Purchasing', icon: Truck, module: 'purchasing' },
  { href: '/expenses', label: 'Expenses', icon: Receipt, module: 'expenses' },
  { href: '/reports', label: 'Reports', icon: BarChart3, module: 'reports' },
  { href: '/users', label: 'Users', icon: ShieldCheck, module: 'users' },
  { href: '/settings', label: 'Settings', icon: Settings, module: 'settings' },
  { href: '/audit-logs', label: 'Audit Logs', icon: ScrollText, module: 'audit-logs' },
];

export function AppNav({ role, fullName }: { role: UserRole; fullName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const items = NAV_ITEMS.filter((i) => MODULE_ACCESS[i.module]?.includes(role));

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
      {/* mobile top bar */}
      <div className="lg:hidden flex items-center justify-between px-4 h-14 border-b border-neutral-800 bg-neutral-950 sticky top-0 z-30">
        <span className="font-semibold tracking-tight text-fuchsia-400">Club POS</span>
        <button onClick={() => setOpen(!open)} className="p-2 -mr-2" aria-label="Menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-neutral-800 bg-neutral-950 h-screen sticky top-0">
        <div className="px-5 h-16 flex items-center border-b border-neutral-800">
          <span className="font-bold text-lg tracking-tight text-fuchsia-400">Club POS</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-fuchsia-500/10 text-fuchsia-400' : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900'
                }`}
              >
                <Icon size={18} /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-neutral-800 p-3">
          <div className="px-2 mb-2 text-xs text-neutral-500">
            <div className="text-neutral-200 font-medium truncate">{fullName}</div>
            <div>{role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)}>
          <div
            className="absolute top-0 left-0 h-full w-72 bg-neutral-950 border-r border-neutral-800 p-3 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-3 mb-2 border-b border-neutral-800">
              <div className="text-neutral-200 font-medium">{fullName}</div>
              <div className="text-xs text-neutral-500">{role}</div>
            </div>
            <nav className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${
                      active ? 'bg-fuchsia-500/10 text-fuchsia-400' : 'text-neutral-400'
                    }`}
                  >
                    <Icon size={18} /> {item.label}
                  </Link>
                );
              })}
            </nav>
            <button
              onClick={handleLogout}
              className="w-full mt-3 flex items-center gap-2 px-3 py-3 rounded-lg text-sm text-neutral-400 border-t border-neutral-800"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
