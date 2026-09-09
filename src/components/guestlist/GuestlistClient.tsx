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
  initialGuestlists, initialGuestlistGuests, rooms, tables, promoters,
}: { initialGuestlists: any[]; initialGuestlistGuests: any[]; rooms: any[]; tables: any[]; promoters: any[] }) {
  const supabase = createClient();
  const [rows, setRows] = useState(initialGuestlists);
  const [namesByGroup, setNamesByGroup] = useState(initialGuestlistGuests);
  const [showForm, setShowForm] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);

  const [form, setForm] = useState({
    promoter_id: promoters[0]?.id ?? '',
    room_id: rooms[0]?.id ?? '',
    group_name: '',
    eta: '',
    table_id: '',
    notes: '',
  });
  // names for the reservation currently being built in the form above
  const [names, setNames] = useState<string[]>(['']);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guestlist_guests' }, (payload) => {
        setNamesByGroup((prev) => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new as any];
          if (payload.eventType === 'UPDATE')
            return prev.map((n) => (n.id === (payload.new as any).id ? (payload.new as any) : n));
          if (payload.eventType === 'DELETE') return prev.filter((n) => n.id !== (payload.old as any).id);
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

  function updateName(i: number, value: string) {
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  }
  function addNameField() {
    setNames((prev) => [...prev, '']);
  }
  function removeNameField(i: number) {
    setNames((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function submitReservation() {
    const cleanNames = names.map((n) => n.trim()).filter(Boolean);
    if (!form.group_name || !form.eta || !form.promoter_id) return toast.error('Fill in required fields');
    if (cleanNames.length === 0) return toast.error('Add at least one guest name.');

    const { data, error } = await supabase
      .from('guestlists')
      .insert({
        promoter_id: form.promoter_id,
        room_id: form.room_id,
        group_name: form.group_name,
        pax: cleanNames.length,
        eta: new Date(form.eta).toISOString(),
        table_id: form.table_id || null,
        notes: form.notes || null,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);

    const { data: insertedNames, error: namesErr } = await supabase
      .from('guestlist_guests')
      .insert(cleanNames.map((guest_name) => ({ guestlist_id: data.id, guest_name })))
      .select();
    if (namesErr) toast.error(`Reservation saved, but names failed: ${namesErr.message}`);
    else setNamesByGroup((prev) => [...prev, ...(insertedNames ?? [])]);

    toast.success('Reservation added');
    setShowForm(false);
    setForm({ ...form, group_name: '', notes: '' });
    setNames(['']);
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
          <input type="datetime-local" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />

          <div className="space-y-2">
            <span className="block text-xs text-neutral-500">Guest names — one per pax, so reception can verify each at the door</span>
            {names.map((n, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  placeholder={`Guest ${i + 1} full name`}
                  value={n}
                  onChange={(e) => updateName(i, e.target.value)}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm"
                />
                {names.length > 1 && (
                  <button onClick={() => removeNameField(i)} className="px-2 rounded-lg border border-neutral-800 text-neutral-500 hover:text-rose-400">
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={addNameField} className="flex items-center gap-1.5 text-xs text-fuchsia-400 font-medium">
              <Plus size={14} /> Add another guest
            </button>
          </div>

          <select value={form.table_id} onChange={(e) => setForm({ ...form, table_id: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm">
            <option value="">No table preference</option>
            {tables.filter((t) => t.room_id === form.room_id).map((t) => <option key={t.id} value={t.id}>{t.table_number}</option>)}
          </select>
          <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" rows={2} />
          <button onClick={submitReservation} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg py-2.5 font-medium text-sm">Save reservation</button>
        </div>
      )}

      <div className="px-4 space-y-4 mt-2">
        {rows.length === 0 && <div className="text-center text-neutral-600 text-sm py-10">No guestlist entries yet tonight.</div>}
        {promoters
          .map((promoter) => ({ promoter, promoterRows: rows.filter((g) => g.promoter_id === promoter.id) }))
          .filter(({ promoterRows }) => promoterRows.length > 0)
          .map(({ promoter, promoterRows }) => (
            <div key={promoter.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-sm font-semibold text-fuchsia-400">{promoter.display_name}</span>
                <span className="text-[10px] text-neutral-500">{promoterRows.length} reservation{promoterRows.length > 1 ? 's' : ''} · {promoterRows.reduce((sum, g) => sum + g.pax, 0)} pax</span>
              </div>
              <div className="space-y-2">
                {promoterRows.map((g) => (
                  <GuestlistRow key={g.id} g={g} rooms={rooms} tables={tables} namesByGroup={namesByGroup} onStatusChange={updateStatus} />
                ))}
              </div>
            </div>
          ))}
        {/* reservations whose promoter is no longer active/found still show up so nothing silently disappears */}
        {(() => {
          const orphanRows = rows.filter((g) => !promoters.some((p) => p.id === g.promoter_id));
          if (orphanRows.length === 0) return null;
          return (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-sm font-semibold text-neutral-400">Unknown / inactive promoter</span>
                <span className="text-[10px] text-neutral-500">{orphanRows.length} reservation{orphanRows.length > 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                {orphanRows.map((g) => (
                  <GuestlistRow key={g.id} g={g} rooms={rooms} tables={tables} namesByGroup={namesByGroup} onStatusChange={updateStatus} />
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function GuestlistRow({
  g, rooms, tables, namesByGroup, onStatusChange,
}: { g: any; rooms: any[]; tables: any[]; namesByGroup: any[]; onStatusChange: (id: string, status: string, reason?: string) => void }) {
  const room = rooms.find((r) => r.id === g.room_id);
  const table = tables.find((t) => t.id === g.table_id);
  const groupNames = namesByGroup.filter((n) => n.guestlist_id === g.id);
  const arrivedCount = groupNames.filter((n) => n.paid_entrance).length;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{g.group_name}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLE[g.status]}`}>{g.status}</span>
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {room?.name} · {g.pax} pax · ETA {new Date(g.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {table ? ` · Table ${table.table_number}` : ''}
            {groupNames.length > 0 && ` · ${arrivedCount}/${groupNames.length} checked in`}
          </div>
        </div>
        {g.status === 'RESERVED' && (
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => onStatusChange(g.id, 'NO_SHOW')} className="p-2 rounded-lg bg-rose-600/20 text-rose-400"><X size={16} /></button>
          </div>
        )}
      </div>
      {groupNames.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {groupNames.map((n) => (
            <span
              key={n.id}
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${
                n.paid_entrance ? 'border-emerald-900 bg-emerald-950/30 text-emerald-400' : 'border-neutral-800 text-neutral-400'
              }`}
            >
              {n.paid_entrance && <Check size={11} />} {n.guest_name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
