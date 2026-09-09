'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/StatCard';
import { Plus, Link2 } from 'lucide-react';

const ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PROMOTER'] as const;

export function UsersClient({ profiles, promoters }: { profiles: any[]; promoters: any[] }) {
  const supabase = createClient();
  const [list, setList] = useState(profiles);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'CASHIER' });

  async function createUser() {
    if (!form.full_name || !form.email || !form.password) return toast.error('All fields are required');
    setCreating(true);
    const res = await fetch('/api/users/create', { method: 'POST', body: JSON.stringify(form) });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) return toast.error(json.error ?? 'Failed to create user');
    toast.success('User created');
    setShowForm(false);
    setForm({ full_name: '', email: '', password: '', role: 'CASHIER' });
    // reload profile list
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    setList(data ?? []);
  }

  async function updateRole(id: string, role: string) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (error) return toast.error(error.message);
    setList((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)));
    toast.success('Role updated');
  }

  async function toggleActive(id: string, isActive: boolean) {
    const { error } = await supabase.from('profiles').update({ is_active: !isActive }).eq('id', id);
    if (error) return toast.error(error.message);
    setList((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: !isActive } : p)));
  }

  async function linkPromoter(profileId: string, promoterId: string) {
    if (!promoterId) return;
    const { error } = await supabase.from('promoters').update({ profile_id: profileId }).eq('id', promoterId);
    if (error) return toast.error(error.message);
    toast.success('Linked promoter profile to this login');
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Users & Permissions"
        description="Manage accounts and role-based access"
        actions={
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-sm font-medium px-3 py-2 rounded-lg">
            <Plus size={16} /> New user
          </button>
        }
      />

      {showForm && (
        <div className="m-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3 max-w-md">
          <input placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Temporary password" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={createUser} disabled={creating} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 rounded-lg py-2 text-sm font-medium">
            {creating ? 'Creating…' : 'Create user'}
          </button>
          <p className="text-xs text-neutral-500">If this role is PROMOTER, add a Promoter record in the Promoters module and link it below, or the profile alone is enough — a promoter row auto-links on next visit if names match.</p>
        </div>
      )}

      <div className="px-4 space-y-2 mt-2">
        {list.map((p) => {
          const linkedPromoter = promoters.find((pr) => pr.profile_id === p.id);
          return (
            <div key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{p.full_name}</div>
                  <div className="text-xs text-neutral-500">{p.is_active ? 'Active' : 'Deactivated'}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select value={p.role} onChange={(e) => updateRole(p.id, e.target.value)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button onClick={() => toggleActive(p.id, p.is_active)} className={`text-xs px-2 py-1.5 rounded-lg font-medium ${p.is_active ? 'bg-rose-950/40 text-rose-400' : 'bg-emerald-950/40 text-emerald-400'}`}>
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
              {p.role === 'PROMOTER' && !linkedPromoter && (
                <div className="mt-2 flex items-center gap-2">
                  <Link2 size={13} className="text-neutral-600" />
                  <select onChange={(e) => linkPromoter(p.id, e.target.value)} defaultValue="" className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-xs flex-1">
                    <option value="" disabled>Link to promoter record…</option>
                    {promoters.filter((pr) => !pr.profile_id).map((pr) => <option key={pr.id} value={pr.id}>{pr.display_name}</option>)}
                  </select>
                </div>
              )}
              {linkedPromoter && p.role === 'PROMOTER' && (
                <div className="mt-2 text-xs text-emerald-400">Linked to promoter: {linkedPromoter.display_name}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
