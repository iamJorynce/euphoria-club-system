'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/StatCard';

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'border-neutral-800 bg-neutral-900 text-neutral-400',
  RESERVED: 'border-sky-800 bg-sky-950/30 text-sky-400',
  OCCUPIED: 'border-emerald-800 bg-emerald-950/30 text-emerald-400',
  BILLING: 'border-amber-800 bg-amber-950/30 text-amber-400',
  CLEANING: 'border-neutral-700 bg-neutral-800 text-neutral-500',
};

const NEXT_STATUS: Record<string, string> = {
  AVAILABLE: 'RESERVED',
  RESERVED: 'OCCUPIED',
  OCCUPIED: 'BILLING',
  BILLING: 'CLEANING',
  CLEANING: 'AVAILABLE',
};

export function TablesClient({ rooms, tables, guestlists }: { rooms: any[]; tables: any[]; guestlists: any[] }) {
  const supabase = createClient();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? '');
  const [localTables, setLocalTables] = useState(tables);

  async function cycleStatus(t: any) {
    const next = NEXT_STATUS[t.status];
    const { error } = await supabase.from('club_tables').update({ status: next }).eq('id', t.id);
    if (error) return toast.error(error.message);
    setLocalTables((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
  }

  const roomTables = localTables.filter((t) => t.room_id === roomId);

  return (
    <div className="pb-10">
      <PageHeader title="Tables" description="Tap a table to cycle its status" />
      <div className="p-4 flex gap-2">
        {rooms.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoomId(r.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${roomId === r.id ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-neutral-800 text-neutral-400'}`}
          >
            {r.name}
          </button>
        ))}
      </div>
      <div className="px-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {roomTables.map((t) => {
          const reservation = guestlists.find((g) => g.table_id === t.id);
          return (
            <button
              key={t.id}
              onClick={() => cycleStatus(t)}
              className={`rounded-xl border p-4 text-center ${STATUS_COLOR[t.status]}`}
            >
              <div className="font-bold text-lg">{t.table_number}</div>
              <div className="text-xs opacity-80">{t.capacity} pax</div>
              <div className="text-[10px] font-semibold mt-1.5">{t.status}</div>
              {reservation && <div className="text-[10px] mt-1 truncate opacity-80">{reservation.group_name}</div>}
            </button>
          );
        })}
      </div>
      <div className="px-4 mt-6 flex gap-3 flex-wrap text-xs text-neutral-500">
        {Object.entries(STATUS_COLOR).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-full border ${v}`} /> {k}
          </div>
        ))}
      </div>
    </div>
  );
}
