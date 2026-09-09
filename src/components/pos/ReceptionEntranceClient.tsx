'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/StatCard';
import { CheckCircle2, DoorOpen } from 'lucide-react';

const PAY_METHODS = ['CASH', 'GCASH', 'CARD', 'OTHER'] as const;
type PayMethod = (typeof PAY_METHODS)[number];

const TABLE_STATUS_STYLE: Record<string, string> = {
  AVAILABLE: 'text-neutral-400',
  RESERVED: 'text-sky-400',
  OCCUPIED: 'text-emerald-400',
  BILLING: 'text-amber-400',
  CLEANING: 'text-neutral-500',
};

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
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>('CASH');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('reception-guestlists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guestlists' }, (payload) => {
        setRows((prev) => {
          if (payload.eventType === 'INSERT' && (payload.new as any).status === 'ARRIVED') return [payload.new as any, ...prev];
          if (payload.eventType === 'UPDATE') {
            if ((payload.new as any).status !== 'ARRIVED') return prev.filter((r) => r.id !== (payload.new as any).id);
            return prev.map((r) => (r.id === (payload.new as any).id ? (payload.new as any) : r));
          }
          if (payload.eventType === 'DELETE') return prev.filter((r) => r.id !== (payload.old as any).id);
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

  function paidCountFor(guestlistId: string) {
    return guests.filter((g) => g.guestlist_id === guestlistId && g.paid_entrance).length;
  }

  const roomRows = rows.filter((g) => g.room_id === roomId);

  async function chargeEntrance(g: any) {
    const room = rooms.find((r) => r.id === g.room_id);
    const total = Number(room?.entrance_fee ?? 0) * g.pax;
    if (total <= 0) {
      toast.error('This room has no entrance fee set.');
      return;
    }
    setBusyId(g.id);
    try {
      const { data: existing } = await supabase.from('guestlist_guests').select('*').eq('guestlist_id', g.id);
      const have = existing?.length ?? 0;
      if (have < g.pax) {
        const toInsert = Array.from({ length: g.pax - have }, (_, i) => ({ guestlist_id: g.id, guest_name: `Guest ${have + i + 1}` }));
        const { data: inserted, error: insertErr } = await supabase.from('guestlist_guests').insert(toInsert).select();
        if (insertErr) throw insertErr;
        setGuests((prev) => [...prev, ...(inserted ?? [])]);
      }

      const { data: updated, error: updateErr } = await supabase
        .from('guestlist_guests')
        .update({ paid_entrance: true, entrance_paid_at: new Date().toISOString() })
        .eq('guestlist_id', g.id)
        .eq('paid_entrance', false)
        .select();
      if (updateErr) throw updateErr;
      setGuests((prev) => prev.map((gg) => (updated?.some((u: any) => u.id === gg.id) ? { ...gg, paid_entrance: true } : gg)));

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

      toast.success(`Entrance collected — ₱${total.toLocaleString()} (${payMethod})`);
      setChargingId(null);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to charge entrance');
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
      <PageHeader title="Entrance" description="Tonight's arrivals — collect entrance fee and assign a table" />

      <div className="p-4 flex gap-2">
        {rooms.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoomId(r.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${roomId === r.id ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-neutral-800 text-neutral-400'}`}
          >
            {r.name} <span className="opacity-70">· ₱{Number(r.entrance_fee ?? 0).toLocaleString()}</span>
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
          const total = Number(room?.entrance_fee ?? 0) * g.pax;
          const paid = paidCountFor(g.id);
          const fullyPaid = paid >= g.pax && g.pax > 0;
          const table = localTables.find((t) => t.id === g.table_id);
          const busy = busyId === g.id;

          return (
            <div key={g.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{g.group_name}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {g.pax} pax · ETA {new Date(g.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ₱{total.toLocaleString()}
                  </div>
                </div>
                {fullyPaid ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 shrink-0">
                    <CheckCircle2 size={14} /> Entrance paid
                  </span>
                ) : (
                  <button
                    onClick={() => setChargingId(chargingId === g.id ? null : g.id)}
                    disabled={busy}
                    className="shrink-0 text-xs bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 px-3 py-1.5 rounded-md font-medium"
                  >
                    Charge entrance
                  </button>
                )}
              </div>

              {chargingId === g.id && !fullyPaid && (
                <div className="mt-3 pt-3 border-t border-neutral-800 space-y-2">
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
                    onClick={() => chargeEntrance(g)}
                    disabled={busy}
                    className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2 text-sm font-semibold"
                  >
                    {busy ? 'Processing…' : `Confirm — ₱${total.toLocaleString()} via ${payMethod}`}
                  </button>
                </div>
              )}

              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-neutral-500">Table:</span>
                {!fullyPaid ? (
                  <span className="text-neutral-600 italic">Bayran una ang entrance before ma-assign og table</span>
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
          );
        })}
      </div>
    </div>
  );
}
