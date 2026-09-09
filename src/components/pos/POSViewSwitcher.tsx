'use client';

import { useState } from 'react';
import { ShoppingCart, DoorOpen } from 'lucide-react';
import { POSClient } from './POSClient';
import { ReceptionEntranceClient } from './ReceptionEntranceClient';

// ADMIN/MANAGER get both screens under the same /pos route: the full cashier
// POS (cart, shifts, product orders) and the receptionist-style Entrance
// screen (per-guest check-in + entrance charge). RECEPTIONIST and CASHIER
// still only ever see their one screen directly (see pos/page.tsx) — this
// switcher only renders for roles that are allowed both.
export function POSViewSwitcher({ posProps, entranceProps }: { posProps: any; entranceProps: any }) {
  const [view, setView] = useState<'pos' | 'entrance'>('pos');

  return (
    <div>
      <div className="flex gap-2 p-4 pb-0">
        <button
          onClick={() => setView('pos')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border ${
            view === 'pos' ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-neutral-800 text-neutral-400'
          }`}
        >
          <ShoppingCart size={15} /> Full POS
        </button>
        <button
          onClick={() => setView('entrance')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border ${
            view === 'entrance' ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-neutral-800 text-neutral-400'
          }`}
        >
          <DoorOpen size={15} /> Entrance
        </button>
      </div>

      {view === 'pos' ? <POSClient {...posProps} /> : <ReceptionEntranceClient {...entranceProps} />}
    </div>
  );
}
