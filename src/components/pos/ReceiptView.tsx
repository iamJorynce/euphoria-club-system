'use client';

import { ESTABLISHMENT } from '@/lib/constants';
import { Printer, X } from 'lucide-react';

export type ReceiptData = {
  orderNumber: string;
  paidAt: string;
  roomName: string;
  tableNumber: string | null;
  cashierName: string;
  paymentMethod: string;
  entranceTotal: number;
  discountTotal: number;
  grandTotal: number;
  items: { name: string; quantity: number; unitPrice: number; discount: number }[];
};

// Deliberately does NOT show promoter commission — customers should never see it.
export function ReceiptView({ receipt, onClose }: { receipt: ReceiptData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-sm max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 no-print">
          <span className="text-sm font-semibold">Receipt</span>
          <button onClick={onClose} className="p-1 text-neutral-500 hover:text-neutral-200"><X size={18} /></button>
        </div>

        <div id="receipt-print" className="overflow-y-auto p-5 font-mono text-[13px] text-neutral-900 bg-white rounded-b-xl">
          <div className="text-center mb-3">
            <div className="font-bold text-base">{ESTABLISHMENT.name}</div>
            {ESTABLISHMENT.address && <div className="text-xs">{ESTABLISHMENT.address}</div>}
            {ESTABLISHMENT.phone && <div className="text-xs">{ESTABLISHMENT.phone}</div>}
          </div>
          <div className="border-t border-dashed border-neutral-400 my-2" />
          <div className="text-xs space-y-0.5">
            <Row label="Order #" value={receipt.orderNumber} />
            <Row label="Date/Time" value={new Date(receipt.paidAt).toLocaleString()} />
            <Row label="Room" value={receipt.roomName} />
            {receipt.tableNumber && <Row label="Table" value={receipt.tableNumber} />}
            <Row label="Cashier" value={receipt.cashierName} />
          </div>
          <div className="border-t border-dashed border-neutral-400 my-2" />
          <div className="space-y-1">
            {receipt.items.map((it, i) => (
              <div key={i} className="text-xs">
                <div className="flex justify-between">
                  <span>{it.name}</span>
                  <span>₱{(it.unitPrice * it.quantity - it.discount).toLocaleString()}</span>
                </div>
                <div className="text-neutral-500">{it.quantity} × ₱{it.unitPrice.toLocaleString()}{it.discount > 0 ? ` (−₱${it.discount})` : ''}</div>
              </div>
            ))}
            {receipt.entranceTotal > 0 && (
              <div className="flex justify-between text-xs pt-1">
                <span>Entrance fee</span>
                <span>₱{receipt.entranceTotal.toLocaleString()}</span>
              </div>
            )}
          </div>
          <div className="border-t border-dashed border-neutral-400 my-2" />
          <div className="text-xs space-y-0.5">
            {receipt.discountTotal > 0 && <Row label="Discount" value={`−₱${receipt.discountTotal.toLocaleString()}`} />}
            <div className="flex justify-between font-bold text-sm pt-1">
              <span>TOTAL</span><span>₱{receipt.grandTotal.toLocaleString()}</span>
            </div>
            <Row label="Payment method" value={receipt.paymentMethod} />
          </div>
          <div className="border-t border-dashed border-neutral-400 my-2" />
          <div className="text-center text-xs mt-3">Thank you!</div>
        </div>

        <div className="p-3 border-t border-neutral-800 flex gap-2 no-print">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-neutral-800 text-sm font-medium">Close</button>
          <button
            onClick={() => window.print()}
            className="flex-1 py-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-sm font-medium flex items-center justify-center gap-1.5"
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
