import type { UserRole } from '@/lib/types/database';

// Central map of which roles can see which modules. Used to drive the nav and
// to gate pages server-side. This is a UX/routing convenience layer only —
// the database RLS policies (supabase/migrations/0003_rls.sql) are the real
// enforcement boundary and must never be trusted to match this file blindly.
export const MODULE_ACCESS: Record<string, UserRole[]> = {
  dashboard: ['ADMIN', 'MANAGER'],
  pos: ['ADMIN', 'MANAGER', 'CASHIER', 'RECEPTIONIST'],
  tables: ['ADMIN', 'MANAGER', 'CASHIER', 'RECEPTIONIST'],
  guestlist: ['ADMIN', 'MANAGER', 'CASHIER', 'RECEPTIONIST'],
  promoters: ['ADMIN', 'MANAGER'],
  commission: ['ADMIN', 'MANAGER'],
  inventory: ['ADMIN', 'MANAGER', 'INVENTORY_STAFF'],
  purchasing: ['ADMIN', 'MANAGER', 'INVENTORY_STAFF'],
  expenses: ['ADMIN', 'MANAGER'],
  reports: ['ADMIN', 'MANAGER'],
  users: ['ADMIN'],
  settings: ['ADMIN', 'MANAGER'],
  'audit-logs': ['ADMIN'],
  promoter: ['PROMOTER'],
};

export function canAccess(role: UserRole | undefined, module: keyof typeof MODULE_ACCESS): boolean {
  if (!role) return false;
  return MODULE_ACCESS[module]?.includes(role) ?? false;
}

export function homeRouteForRole(role: UserRole): string {
  if (role === 'PROMOTER') return '/promoter';
  if (role === 'INVENTORY_STAFF') return '/inventory';
  if (role === 'CASHIER') return '/pos';
  if (role === 'RECEPTIONIST') return '/guestlist';
  return '/dashboard';
}
