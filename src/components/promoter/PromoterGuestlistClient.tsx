'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

const STATUS_STYLE: Record<string, string> = {
  RESERVED: 'bg-sky-950/40 text-sky-400 border-sky-900',
  ARRIVED: 'bg-emerald-950/40 text-emerald-400 border-emerald-900',
  NO_SHOW: 'bg-rose-950/40 text-rose-400 border-rose-900',
  RELEASED: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  WALK_IN: 'bg-amber-950/40 text-amber-400 border-amber-900',
};

export function PromoterGuestlistClient({
  promoterId, rooms, tables, initialGuests,
}: { promoterId: string; rooms: any[]; tables: any[]; initialGuests: any[] }) {
  const supabase = createClient();
  const [guests, setGuests] = useState(initialGuests);
  const [form, setForm] = useState({ room_id: rooms[0]?.id ?? '', group_name: '', pax: 2, eta: '', table_id: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();
  const isPastCutoff = now.getHours() >= 23;

  async function submit() {
    if (!promoterId) return toast.error('No promoter profile linked to your account.');
    if (!form.group_name || !form.eta) return toast.error('Guest name and ETA are required.');
    setSubmitting(true);
    const { data, error } = await supabase
      .from('guestlists')
      .insert({
        promoter_id: promoterId,
        room_id: form.room_id,
        group_name: form.group_name,
        pax: form.pax,
        eta: new Date(form.eta).toISOString(),
        table_id: form.table_id || null,
        notes: form.notes || null,
      })
      .select()
      .single();
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setGuests((prev) => [data, ...prev]);
    setForm({ ...form, group_name: '', notes: '' });
    toast.success(data.is_walk_in ? 'Saved as walk-in (after 11PM cutoff)' : 'Guest added');
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold">Add Guest / Group</h1>

      {isPastCutoff && (
        <div className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900 rounded-lg p-2.5">
          It's past 11:00 PM — new entries will be recorded as walk-ins and won't earn commission.
        </div>
      )}

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
        <select value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm">
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <input placeholder="Guest / group name" value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm" />
        <div className="grid grid-cols-2 gap-3">
          <input type="number" min={1} placeholder="Pax" value={form.pax} onChange={(e) => setForm({ ...form, pax: Number(e.target.value) })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm" />
          <input type="datetime-local" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm" />
        </div>
        <select value={form.table_id} onChange={(e) => setForm({ ...form, table_id: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm">
          <option value="">No table preference</option>
          {tables.filter((t) => t.room_id === form.room_id).map((t) => <option key={t.id} value={t.id}>{t.table_number}</option>)}
        </select>
        <textarea placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm" />
        <button onClick={submit} disabled={submitting} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 rounded-lg py-2.5 font-medium text-sm">
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div>
        <div className="text-xs font-medium text-neutral-500 mb-2">MY GUESTLIST</div>
        <div className="space-y-2">
          {guests.map((g) => (
            <div key={g.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{g.group_name}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLE[g.status]}`}>{g.status}</span>
              </div>
              <div className="text-xs text-neutral-500 mt-1">{g.pax} pax · ETA {new Date(g.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          ))}
          {guests.length === 0 && <div className="text-center text-neutral-600 text-sm py-8">No guests yet.</div>}
        </div>
      </div>
    </div>
  );
}
