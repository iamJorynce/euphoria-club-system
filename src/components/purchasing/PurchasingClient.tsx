'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/StatCard';
import { Plus, PackageCheck, Trash2 } from 'lucide-react';

type Line = { product_id: string; quantity: string; unit_cost: string };

export function PurchasingClient({ purchases, products, suppliers }: { purchases: any[]; products: any[]; suppliers: any[] }) {
  const supabase = createClient();
  const [list, setList] = useState(purchases);
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ product_id: products[0]?.id ?? '', quantity: '', unit_cost: '' }]);
  const [saving, setSaving] = useState(false);

  function addLine() {
    setLines((l) => [...l, { product_id: products[0]?.id ?? '', quantity: '', unit_cost: '' }]);
  }
  function removeLine(i: number) {
    setLines((l) => l.filter((_, idx) => idx !== i));
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((l) => l.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  }

  const totalCost = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);

  async function submitPurchase() {
    const validLines = lines.filter((l) => l.product_id && Number(l.quantity) > 0 && Number(l.unit_cost) >= 0);
    if (validLines.length === 0) return toast.error('Add at least one valid line item');
    setSaving(true);
    const { data: purchase, error: pErr } = await supabase
      .from('purchases')
      .insert({ supplier_id: supplierId || null, invoice_reference: invoiceRef || null, notes: notes || null, total_cost: totalCost })
      .select()
      .single();
    if (pErr || !purchase) {
      setSaving(false);
      return toast.error(pErr?.message ?? 'Failed to create purchase');
    }
    const { error: iErr } = await supabase.from('purchase_items').insert(
      validLines.map((l) => ({
        purchase_id: purchase.id,
        product_id: l.product_id,
        quantity: Number(l.quantity),
        unit_cost: Number(l.unit_cost),
      }))
    );
    setSaving(false);
    if (iErr) return toast.error(iErr.message);
    setList((prev) => [{ ...purchase, purchase_items: validLines }, ...prev]);
    setShowForm(false);
    setLines([{ product_id: products[0]?.id ?? '', quantity: '', unit_cost: '' }]);
    setInvoiceRef('');
    setNotes('');
    toast.success('Purchase order created. Mark items received to add to inventory.');
  }

  async function receiveItem(itemId: string, purchaseId: string) {
    const { error } = await supabase.from('purchase_items').update({ received: true }).eq('id', itemId);
    if (error) return toast.error(error.message);
    setList((prev) =>
      prev.map((p) =>
        p.id === purchaseId
          ? { ...p, purchase_items: p.purchase_items.map((it: any) => (it.id === itemId ? { ...it, received: true } : it)) }
          : p
      )
    );
    toast.success('Received — inventory updated');
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Purchasing"
        description="Purchase orders — receiving auto-increases inventory"
        actions={
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-sm font-medium px-3 py-2 rounded-lg">
            <Plus size={16} /> New purchase
          </button>
        }
      />

      {showForm && (
        <div className="m-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3 max-w-2xl">
          <div className="grid grid-cols-2 gap-3">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm">
              <option value="">No supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input placeholder="Invoice / reference #" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2">
                <select value={l.product_id} onChange={(e) => updateLine(i, { product_id: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-xs">
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" placeholder="Qty" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-xs" />
                <input type="number" placeholder="Unit cost" value={l.unit_cost} onChange={(e) => updateLine(i, { unit_cost: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-xs" />
                <button onClick={() => removeLine(i)} className="text-rose-400"><Trash2 size={16} /></button>
              </div>
            ))}
            <button onClick={addLine} className="text-xs text-fuchsia-400 font-medium">+ Add line</button>
          </div>
          <textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-400">Total: <strong className="text-neutral-100">₱{totalCost.toLocaleString()}</strong></span>
            <button onClick={submitPurchase} disabled={saving} className="bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium">
              {saving ? 'Saving…' : 'Create purchase order'}
            </button>
          </div>
        </div>
      )}

      <div className="px-4 space-y-3 mt-2">
        {list.map((p) => {
          const supplier = suppliers.find((s) => s.id === p.supplier_id);
          return (
            <div key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <div className="text-sm font-medium">{supplier?.name ?? 'No supplier'} {p.invoice_reference && `· ${p.invoice_reference}`}</div>
                  <div className="text-xs text-neutral-500">{new Date(p.created_at).toLocaleDateString()} · {p.payment_status}</div>
                </div>
                <div className="font-semibold text-sm">₱{Number(p.total_cost).toLocaleString()}</div>
              </div>
              <div className="space-y-1">
                {(p.purchase_items ?? []).map((it: any) => {
                  const prod = products.find((pr) => pr.id === it.product_id);
                  return (
                    <div key={it.id} className="flex items-center justify-between text-xs bg-neutral-950 rounded-md px-2 py-1.5">
                      <span>{prod?.name ?? '—'} × {it.quantity} @ ₱{it.unit_cost}</span>
                      {it.received ? (
                        <span className="text-emerald-400 flex items-center gap-1"><PackageCheck size={13} /> Received</span>
                      ) : (
                        <button onClick={() => receiveItem(it.id, p.id)} className="text-fuchsia-400 font-medium">Mark received</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div className="text-center text-neutral-600 text-sm py-10">No purchases yet.</div>}
      </div>
    </div>
  );
}
