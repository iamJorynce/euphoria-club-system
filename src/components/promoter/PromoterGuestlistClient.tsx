'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';

const STATUS_STYLE: Record<string, string> = {
  RESERVED: 'bg-sky-950/40 text-sky-400 border-sky-900',
  ARRIVED: 'bg-emerald-950/40 text-emerald-400 border-emerald-900',
  NO_SHOW: 'bg-rose-950/40 text-rose-400 border-rose-900',
  RELEASED: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  WALK_IN: 'bg-amber-950/40 text-amber-400 border-amber-900',
};

export function PromoterGuestlistClient({
  promoterId, rooms, tables, initialGuests, initialGuestlistGuests,
}: { promoterId: string; rooms: any[]; tables: any[]; initialGuests: any[]; initialGuestlistGuests: any[] }) {
  const supabase = createClient();
  const [guests, setGuests] = useState(initialGuests);
  const [namesByGroup, setNamesByGroup] = useState(initialGuestlistGuests);
  const [form, setForm] = useState({ room_id: rooms[0]?.id ?? '', eta: '', table_id: '', notes: '' });
  // names being typed for the NEW reservation, before it's saved
  const [names, setNames] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newNameDraft, setNewNameDraft] = useState('');

  // Uses Asia/Manila explicitly — the promoter's phone may be set to a
  // different timezone, but the actual 11 PM cutoff is enforced server-side
  // (apply_guestlist_cutoff trigger) against Asia/Manila regardless. This is
  // just a heads-up matching that same clock, not the real enforcement.
  const manilaHour = Number(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false })
  );
  const isPastCutoff = manilaHour >= 23;

  function updateName(i: number, value: string) {
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  }
  function addNameField() {
    setNames((prev) => [...prev, '']);
  }
  function removeNameField(i: number) {
    setNames((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function submit() {
    if (!promoterId) return toast.error('No promoter profile linked to your account.');
    const cleanNames = names.map((n) => n.trim()).filter(Boolean);
    if (!form.eta) return toast.error('ETA is required.');
    if (cleanNames.length === 0) return toast.error('Add at least one guest name so reception can verify them at the door.');

    // No separate "group name" field — the first guest listed is the one the
    // reservation (and the table, if one is picked) is shown under.
    const primaryGuestName = cleanNames[0];

    setSubmitting(true);
    const { data, error } = await supabase
      .from('guestlists')
      .insert({
        promoter_id: promoterId,
        room_id: form.room_id,
        group_name: primaryGuestName,
        pax: cleanNames.length,
        eta: new Date(form.eta).toISOString(),
        table_id: form.table_id || null,
        notes: form.notes || null,
      })
      .select()
      .single();

    if (error) {
      setSubmitting(false);
      return toast.error(error.message);
    }

    const { data: insertedNames, error: namesErr } = await supabase
      .from('guestlist_guests')
      .insert(cleanNames.map((guest_name) => ({ guestlist_id: data.id, guest_name })))
      .select();
    setSubmitting(false);

    if (namesErr) {
      // the group reservation itself was saved fine — just the names failed;
      // let the promoter know so they can add names via the list below.
      toast.error(`Reservation saved, but names failed to save: ${namesErr.message}`);
    } else {
      setNamesByGroup((prev) => [...prev, ...(insertedNames ?? [])]);
      toast.success(data.is_walk_in ? 'Saved as walk-in (after 11PM cutoff)' : 'Guest list added');
    }

    setGuests((prev) => [data, ...prev]);
    setForm({ ...form, notes: '' });
    setNames(['']);
  }

  async function addNameToExisting(guestlistId: string) {
    const guest_name = newNameDraft.trim();
    if (!guest_name) return;
    const { data, error } = await supabase.from('guestlist_guests').insert({ guestlist_id: guestlistId, guest_name }).select().single();
    if (error) return toast.error(error.message);
    setNamesByGroup((prev) => [...prev, data]);
    setGuests((prev) => prev.map((g) => (g.id === guestlistId ? { ...g, pax: g.pax + 1 } : g)));
    setNewNameDraft('');

    // if this group had 0 names before (e.g. the reservation name guest was
    // removed earlier), this newly added name becomes the reservation name
    const wasEmpty = namesByGroup.filter((n) => n.guestlist_id === guestlistId).length === 0;
    if (wasEmpty) await renameGroup(guestlistId, guest_name);
  }

  async function removeName(guestlistId: string, guestGuestId: string) {
    const { error } = await supabase.from('guestlist_guests').delete().eq('id', guestGuestId);
    if (error) return toast.error(error.message);

    const remaining = namesByGroup.filter((n) => n.guestlist_id === guestlistId && n.id !== guestGuestId);
    setNamesByGroup((prev) => prev.filter((n) => n.id !== guestGuestId));
    setGuests((prev) => prev.map((g) => (g.id === guestlistId ? { ...g, pax: Math.max(0, g.pax - 1) } : g)));

    // if the removed guest was the one the reservation was named after,
    // hand the reservation name off to whoever is now first on the list
    const removedGuest = namesByGroup.find((n) => n.id === guestGuestId);
    const group = guests.find((g) => g.id === guestlistId);
    if (removedGuest && group && removedGuest.guest_name === group.group_name) {
      await renameGroup(guestlistId, remaining[0]?.guest_name ?? '(no name)');
    }
  }

  async function renameGroup(guestlistId: string, newGroupName: string) {
    const { error } = await supabase.from('guestlists').update({ group_name: newGroupName }).eq('id', guestlistId);
    if (error) return toast.error(`Couldn't update the reservation name: ${error.message}`);
    setGuests((prev) => prev.map((g) => (g.id === guestlistId ? { ...g, group_name: newGroupName } : g)));
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold">Add Guest List</h1>

      {isPastCutoff && (
        <div className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900 rounded-lg p-2.5">
          It's past 11:00 PM — new entries will be recorded as walk-ins and won't earn commission.
        </div>
      )}

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
        <select value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm">
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <input type="datetime-local" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm" />

        <div className="space-y-2">
          <span className="block text-xs text-neutral-500">Guest names — one per pax, so reception can verify each at the door. The first name is used as the reservation name (shown on the table if you pick one below).</span>
          {names.map((n, i) => (
            <div key={i} className="flex gap-1.5">
              <input
                placeholder={i === 0 ? 'Guest 1 full name (reservation name)' : `Guest ${i + 1} full name`}
                value={n}
                onChange={(e) => updateName(i, e.target.value)}
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm"
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
          {guests.map((g) => {
            const groupNames = namesByGroup.filter((n) => n.guestlist_id === g.id);
            const arrivedCount = groupNames.filter((n) => n.paid_entrance).length;
            const editable = g.status === 'RESERVED';
            return (
              <div key={g.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{g.group_name}{g.pax > 1 ? ` +${g.pax - 1}` : ''}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLE[g.status]}`}>{g.status}</span>
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {g.pax} pax · ETA {new Date(g.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {g.status === 'ARRIVED' && ` · ${arrivedCount}/${groupNames.length} checked in`}
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
                        {n.guest_name}
                        {editable && (
                          <button onClick={() => removeName(g.id, n.id)} className="text-neutral-600 hover:text-rose-400">
                            <X size={11} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {editable && (
                  <div className="mt-2 flex gap-1.5">
                    <input
                      placeholder="Add a name to this list…"
                      value={editingId === g.id ? newNameDraft : ''}
                      onFocus={() => setEditingId(g.id)}
                      onChange={(e) => setNewNameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addNameToExisting(g.id); }}
                      className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                    <button onClick={() => addNameToExisting(g.id)} className="px-2.5 rounded-lg bg-neutral-800 text-xs font-medium">Add</button>
                  </div>
                )}
              </div>
            );
          })}
          {guests.length === 0 && <div className="text-center text-neutral-600 text-sm py-8">No guests yet.</div>}
        </div>
      </div>
    </div>
  );
}
