'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/StatCard';
import { Plus } from 'lucide-react';

function pesos(n: number) {
  return '₱' + n.toLocaleString('en-PH');
}

export function PromotersClient({ promoters, guestsToday, commissionToday }: { promoters: any[]; guestsToday: any[]; commissionToday: any[] }) {
  const supabase = createClient();
  const [list, setList] = useState(promoters);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ display_name: '', phone: '', notes: '' });

  async function addPromoter() {
    if (!form.display_name.trim()) return toast.error('Name required');
    const { data, error } = await supabase.from('promoters').insert(form).select().single();
    if (error) return toast.error(error.message);
    setList((p) => [...p, data].sort((a, b) => a.display_name.localeCompare(b.display_name)));
    setForm({ display_name: '', phone: '', notes: '' });
    setShowForm(false);
    toast.success('Promoter added. Link a login from Users once they have an account.');
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Promoter Management"
        description="Tonight's performance & roster"
        actions={
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-sm font-medium px-3 py-2 rounded-lg">
            <Plus size={16} /> Add
          </button>
        }
      />
      {showForm && (
        <div className="m-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3 max-w-md">
          <input placeholder="Full name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" rows={2} />
          <button onClick={addPromoter} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg py-2 text-sm font-medium">Save</button>
        </div>
      )}
      <div className="px-4 space-y-2 mt-2">
        {list.map((p) => {
          const guests = guestsToday.filter((g) => g.promoter_id === p.id);
          const arrived = guests.filter((g) => g.status === 'ARRIVED').length;
          const commission = commissionToday.filter((c) => c.promoter_id === p.id).reduce((s, c) => s + Number(c.commission_amount), 0);
          return (
            <div key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{p.display_name}</div>
                <div className="text-xs text-neutral-500">{p.phone ?? 'No phone on file'} {!p.is_active && '· inactive'}</div>
              </div>
              <div className="text-right text-sm">
                <div className="text-neutral-400 text-xs">{guests.length} guests · {arrived} arrived</div>
                <div className="font-semibold text-fuchsia-400">{pesos(commission)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
