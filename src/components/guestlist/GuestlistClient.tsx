'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/StatCard';
import { AlertTriangle, Check, X, Plus } from 'lucide-react';
import { getBusinessDate } from '@/lib/business-date';

const STATUS_STYLE: Record<string, string> = {
  RESERVED: 'bg-sky-950/40 text-sky-400 border-sky-900',
  ARRIVED: 'bg-emerald-950/40 text-emerald-400 border-emerald-900',
  NO_SHOW: 'bg-rose-950/40 text-rose-400 border-rose-900',
  RELEASED: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  WALK_IN: 'bg-amber-950/40 text-amber-400 border-amber-900',
};

export function GuestlistClient({
  initialGuestlists, rooms, tables, promoters,
}: { initialGuestlists: any[]; rooms: any[]; tables: any[]; promoters: any[] }) {
  const supabase = createClient();
  const [rows, setRows] = useState(initialGuestlists);
  const [showForm, setShowForm] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);

  const [form, setForm] = useState({
    promoter_id: promoters[0]?.id ?? '',
    room_id: rooms[0]?.id ?? '',
    group_name: '',
    pax: 2,
    eta: '',
    table_id: '',
    notes: '',
  });

  useEffect(() => {
    const channel = supabase
      .channel('guestlists-staff')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guestlists' }, (payload) => {
        setRows((prev) => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new as any];
          if (payload.eventType === 'UPDATE')
            return prev.map((r) => (r.id === (payload.new as any).id ? (payload.new as any) : r));
          if (payload.eventType === 'DELETE') return prev.filter((r) => r.id !== (payload.old as any).id);
          return prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  async function checkDuplicates(name: string) {
    if (!name.trim()) return setDuplicates([]);
    const today = getBusinessDate();
    const { data } = await supabase.rpc('check_duplicate_guest', {
      p_group_name: name, p_business_date: today, p_exclude_id: null,
    });
    setDuplicates(data ?? []);
  }

  async function submitReservation() {
    if (!form.group_name || !form.eta || !form.promoter_id) return toast.error('Fill in required fields');
    const { error } = await supabase.from('guestlists').insert({
      promoter_id: form.promoter_id,
      room_id: form.room_id,
      group_name: form.group_name,
      pax: form.pax,
      eta: new Date(form.eta).toISOString(),
      table_id: form.table_id || null,
      notes: form.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success('Reservation added');
    setShowForm(false);
    setForm({ ...form, group_name: '', notes: '' });
  }

  async function updateStatus(id: string, status: string, reason?: string) {
    const patch: any = { status };
    if (status === 'RELEASED') patch.release_reason = reason ?? 'Table needed for another customer';
    const { error } = await supabase.from('guestlists').update(patch).eq('id', id);
    if (error) toast.error(error.message);
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Guestlist"
        description="Tonight's promoter reservations"
        actions={
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-sm font-medium px-3 py-2 rounded-lg">
            <Plus size={16} /> Add
          </button>
        }
      />

      {showForm && (
        <div className="m-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select value={form.promoter_id} onChange={(e) => setForm({ ...form, promoter_id: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm">
              {promoters.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
            <select value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm">
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <input
            placeholder="Guest / group name"
            value={form.group_name}
            onChange={(e) => { setForm({ ...form, group_name: e.target.value }); checkDuplicates(e.target.value); }}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm"
          />
          {duplicates.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-950/20 border border-amber-900 rounded-lg p-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Possible duplicate: this name is already registered tonight by another promoter. Verify before saving.</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <input type="number" min={1} placeholder="Pax" value={form.pax} onChange={(e) => setForm({ ...form, pax: Number(e.target.value) })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
            <input type="datetime-local" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm col-span-2" />
          </div>
          <select value={form.table_id} onChange={(e) => setForm({ ...form, table_id: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm">
            <option value="">No table preference</option>
            {tables.filter((t) => t.room_id === form.room_id).map((t) => <option key={t.id} value={t.id}>{t.table_number}</option>)}
          </select>
          <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" rows={2} />
          <button onClick={submitReservation} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg py-2.5 font-medium text-sm">Save reservation</button>
        </div>
      )}

      <div className="px-4 space-y-2 mt-2">
        {rows.length === 0 && <div className="text-center text-neutral-600 text-sm py-10">No guestlist entries yet tonight.</div>}
        {rows.map((g) => {
          const room = rooms.find((r) => r.id === g.room_id);
          const table = tables.find((t) => t.id === g.table_id);
          const promoter = promoters.find((p) => p.id === g.promoter_id);
          return (
            <div key={g.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{g.group_name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLE[g.status]}`}>{g.status}</span>
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {promoter?.display_name ?? '—'} · {room?.name} · {g.pax} pax · ETA {new Date(g.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {table ? ` · Table ${table.table_number}` : ''}
                </div>
              </div>
              {g.status === 'RESERVED' && (
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => updateStatus(g.id, 'ARRIVED')} className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400"><Check size={16} /></button>
                  <button onClick={() => updateStatus(g.id, 'NO_SHOW')} className="p-2 rounded-lg bg-rose-600/20 text-rose-400"><X size={16} /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
