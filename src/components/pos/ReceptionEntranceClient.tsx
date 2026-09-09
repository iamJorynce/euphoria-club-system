'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/StatCard';
import { CheckCircle2, DoorOpen, ChevronDown, ChevronUp, UserPlus } from 'lucide-react';

const PAY_METHODS = ['CASH', 'GCASH', 'CARD', 'OTHER'] as const;
type PayMethod = (typeof PAY_METHODS)[number];

const TABLE_STATUS_STYLE: Record<string, string> = {
  AVAILABLE: 'text-neutral-400',
  RESERVED: 'text-sky-400',
  OCCUPIED: 'text-emerald-400',
  BILLING: 'text-amber-400',
  CLEANING: 'text-neutral-500',
};

function pesos(n: number) {
  return '₱' + Number(n).toLocaleString();
}

export function ReceptionEntranceClient({
  rooms, tables, guestlists, guestlistGuests, receptionistId,
}: {
  rooms: any[]; tables: any[]; guestlists: any[]; guestlistGuests: any[];
  receptionistId: string;
}) {
  const supabase = createClient();
  const [roomId, setRoomId] = useState<string>(rooms[0]?.id ?? '');
  const [rows, setRows] = useState(guestlists);
  const [guests, setGuests] = useState(guestlistGuests);
  const [localTables, setLocalTables] = useState(tables);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [payMethod, setPayMethod] = useState<PayMethod>('CASH');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [walkUpName, setWalkUpName] = useState('');

  useEffect(() => {
    const channel = supabase
      .channel('reception-guestlists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guestlists' }, (payload) => {
        setRows((prev) => {
          const isRelevant = (r: any) => r.status === 'RESERVED' || r.status === 'ARRIVED';
          if (payload.eventType === 'INSERT') return isRelevant(payload.new) ? [payload.new as any, ...prev] : prev;
          if (payload.eventType === 'UPDATE') {
            if (!isRelevant(payload.new)) return prev.filter((r) => r.id !== (payload.new as any).id);
            return prev.some((r) => r.id === (payload.new as any).id)
              ? prev.map((r) => (r.id === (payload.new as any).id ? (payload.new as any) : r))
              : [...prev, payload.new as any];
          }
          if (payload.eventType === 'DELETE') return prev.filter((r) => r.id !== (payload.old as any).id);
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guestlist_guests' }, (payload) => {
        setGuests((prev) => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new as any];
          if (payload.eventType === 'UPDATE') return prev.map((g) => (g.id === (payload.new as any).id ? (payload.new as any) : g));
          if (payload.eventType === 'DELETE') return prev.filter((g) => g.id !== (payload.old as any).id);
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'club_tables' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setLocalTables((prev) => prev.map((t) => (t.id === (payload.new as any).id ? (payload.new as any) : t)));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  const roomRows = rows.filter((g) => g.room_id === roomId);

  function namesFor(guestlistId: string) {
    return guests.filter((g) => g.guestlist_id === guestlistId);
  }

  function toggleExpand(g: any) {
    if (expandedId === g.id) {
      setExpandedId(null);
      setSelectedGuestIds(new Set());
    } else {
      setExpandedId(g.id);
      setSelectedGuestIds(new Set());
    }
  }

  function toggleGuestSelect(guestId: string) {
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  }

  async function chargeSelected(g: any) {
    const room = rooms.find((r) => r.id === g.room_id);
    const feePerHead = Number(room?.entrance_fee ?? 0);
    const selectedIds = Array.from(selectedGuestIds);
    if (selectedIds.length === 0) return;
    if (feePerHead <= 0) {
      toast.error('This room has no entrance fee set.');
      return;
    }
    const total = feePerHead * selectedIds.length;
    setBusyId(g.id);
    try {
      const { data: updated, error: updateErr } = await supabase
        .from('guestlist_guests')
        .update({ paid_entrance: true, entrance_paid_at: new Date().toISOString() })
        .in('id', selectedIds)
        .select();
      if (updateErr) throw updateErr;
      setGuests((prev) => prev.map((gg) => (updated?.some((u: any) => u.id === gg.id) ? { ...gg, paid_entrance: true, entrance_paid_at: new Date().toISOString() } : gg)));

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          room_id: g.room_id,
          guestlist_id: g.id,
          promoter_id: g.promoter_id,
          cashier_id: receptionistId,
          status: 'PAID',
          subtotal: 0,
          discount_total: 0,
          entrance_total: total,
          grand_total: total,
          paid_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (orderErr || !order) throw orderErr ?? new Error('Failed to record entrance order');

      const { error: payErr } = await supabase
        .from('payments')
        .insert({ order_id: order.id, method: payMethod, amount: total, status: 'PAID', received_by: receptionistId });
      if (payErr) throw payErr;

      // first check-in flips the group to ARRIVED server-side (trigger); mirror
      // it locally too so the UI doesn't wait for the realtime round-trip.
      setRows((prev) => prev.map((r) => (r.id === g.id && r.status === 'RESERVED' ? { ...r, status: 'ARRIVED', arrived_at: new Date().toISOString() } : r)));

      toast.success(`Entrance collected — ${pesos(total)} (${payMethod}) for ${selectedIds.length} guest(s)`);
      setSelectedGuestIds(new Set());
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to charge entrance');
    } finally {
      setBusyId(null);
    }
  }

  async function addWalkUpGuest(g: any) {
    const guest_name = walkUpName.trim();
    if (!guest_name) return;
    setBusyId(g.id);
    try {
      const { data, error } = await supabase.from('guestlist_guests').insert({ guestlist_id: g.id, guest_name }).select().single();
      if (error) throw error;
      setGuests((prev) => [...prev, data]);
      setWalkUpName('');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to add guest');
    } finally {
      setBusyId(null);
    }
  }

  async function assignTable(g: any, tableId: string) {
    setBusyId(g.id);
    try {
      const prevTableId = g.table_id;
      const { error } = await supabase.from('guestlists').update({ table_id: tableId || null }).eq('id', g.id);
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === g.id ? { ...r, table_id: tableId || null } : r)));

      if (tableId) {
        await supabase.from('club_tables').update({ status: 'OCCUPIED' }).eq('id', tableId);
        setLocalTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, status: 'OCCUPIED' } : t)));
      }
      if (prevTableId && prevTableId !== tableId) {
        await supabase.from('club_tables').update({ status: 'AVAILABLE' }).eq('id', prevTableId);
        setLocalTables((prev) => prev.map((t) => (t.id === prevTableId ? { ...t, status: 'AVAILABLE' } : t)));
      }
      toast.success(tableId ? 'Table assigned' : 'Table unassigned');
      setAssigningId(null);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to assign table');
    } finally {
      setBusyId(null);
    }
  }

  const availableTablesForRoom = useMemo(
    () => localTables.filter((t) => t.room_id === roomId && (t.status === 'AVAILABLE' || t.status === 'RESERVED')),
    [localTables, roomId]
  );

  return (
    <div className="pb-10">
      <PageHeader title="Entrance" description="Tonight's guestlist — check guests in one at a time and collect entrance" />

      <div className="p-4 flex gap-2">
        {rooms.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoomId(r.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${roomId === r.id ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-neutral-800 text-neutral-400'}`}
          >
            {r.name} <span className="opacity-70">· ₱{Number(r.entrance_fee ?? 0).toLocaleString()}/head</span>
          </button>
        ))}
      </div>

      <div className="px-4 space-y-2">
        {roomRows.length === 0 && (
          <div className="flex flex-col items-center text-center text-neutral-600 text-sm py-12 gap-2">
            <DoorOpen size={28} className="opacity-40" />
            No arrivals waiting in this room yet.
          </div>
        )}

        {roomRows.map((g) => {
          const room = rooms.find((r) => r.id === g.room_id);
          const feePerHead = Number(room?.entrance_fee ?? 0);
          const groupNames = namesFor(g.id);
          const checkedInCount = groupNames.filter((n) => n.paid_entrance).length;
          const anyCheckedIn = checkedInCount > 0;
          const table = localTables.find((t) => t.id === g.table_id);
          const busy = busyId === g.id;
          const expanded = expandedId === g.id;
          const selectedCount = expanded ? selectedGuestIds.size : 0;
          const selectedTotal = feePerHead * selectedCount;

          return (
            <div key={g.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-center justify-between gap-3 cursor-pointer" onClick={() => toggleExpand(g)}>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{g.group_name}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {groupNames.length} pax · ETA {new Date(g.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ₱{feePerHead.toLocaleString()}/head
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {groupNames.length > 0 && (
                    <span className={`flex items-center gap-1 text-xs font-medium ${checkedInCount === groupNames.length ? 'text-emerald-400' : 'text-neutral-400'}`}>
                      {checkedInCount === groupNames.length && <CheckCircle2 size={14} />}
                      {checkedInCount}/{groupNames.length} in
                    </span>
                  )}
                  {expanded ? <ChevronUp size={16} className="text-neutral-500" /> : <ChevronDown size={16} className="text-neutral-500" />}
                </div>
              </div>

              {expanded && (
                <div className="mt-3 pt-3 border-t border-neutral-800 space-y-3" onClick={(e) => e.stopPropagation()}>
                  {groupNames.length === 0 && (
                    <div className="text-xs text-neutral-600 italic">No names submitted for this group yet.</div>
                  )}

                  <div className="space-y-1.5">
                    {groupNames.map((n) => (
                      <label
                        key={n.id}
                        className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm ${
                          n.paid_entrance ? 'border-emerald-900 bg-emerald-950/20 text-emerald-400' : 'border-neutral-800 cursor-pointer'
                        }`}
                      >
                        {n.paid_entrance ? (
                          <CheckCircle2 size={16} className="shrink-0" />
                        ) : (
                          <input
                            type="checkbox"
                            checked={selectedGuestIds.has(n.id)}
                            onChange={() => toggleGuestSelect(n.id)}
                            className="accent-fuchsia-600"
                          />
                        )}
                        <span className={n.paid_entrance ? '' : 'text-neutral-200'}>{n.guest_name}</span>
                        {n.paid_entrance && <span className="ml-auto text-[10px] opacity-70">Verified & paid</span>}
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-1.5">
                    <input
                      placeholder="Add a walk-up name…"
                      value={walkUpName}
                      onChange={(e) => setWalkUpName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addWalkUpGuest(g); }}
                      className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-2.5 py-1.5 text-xs"
                    />
                    <button onClick={() => addWalkUpGuest(g)} disabled={busy} className="flex items-center gap-1 px-2.5 rounded-md bg-neutral-800 text-xs font-medium disabled:opacity-50">
                      <UserPlus size={13} /> Add
                    </button>
                  </div>

                  {selectedCount > 0 && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-4 gap-1.5">
                        {PAY_METHODS.map((m) => (
                          <button
                            key={m}
                            onClick={() => setPayMethod(m)}
                            className={`py-1.5 rounded-md text-xs font-medium border ${payMethod === m ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-neutral-800 text-neutral-400'}`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => chargeSelected(g)}
                        disabled={busy}
                        className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2 text-sm font-semibold"
                      >
                        {busy ? 'Processing…' : `Check in ${selectedCount} — ${pesos(selectedTotal)} via ${payMethod}`}
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs pt-1">
                    <span className="text-neutral-500">Table:</span>
                    {!anyCheckedIn ? (
                      <span className="text-neutral-600 italic">Kinahanglan naa nay na-check in una ma-assign og table</span>
                    ) : assigningId === g.id ? (
                      <select
                        autoFocus
                        defaultValue={g.table_id ?? ''}
                        onChange={(e) => assignTable(g, e.target.value)}
                        onBlur={() => setAssigningId(null)}
                        disabled={busy}
                        className="bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs"
                      >
                        <option value="">Unassigned</option>
                        {table && !availableTablesForRoom.some((t) => t.id === table.id) && (
                          <option value={table.id}>{table.table_number} (current)</option>
                        )}
                        {availableTablesForRoom.map((t) => (
                          <option key={t.id} value={t.id}>{t.table_number} · {t.capacity} pax</option>
                        ))}
                      </select>
                    ) : (
                      <button onClick={() => setAssigningId(g.id)} className={`font-medium hover:underline ${table ? TABLE_STATUS_STYLE[table.status] : 'text-neutral-500'}`}>
                        {table ? `${table.table_number}` : 'Assign a table…'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
