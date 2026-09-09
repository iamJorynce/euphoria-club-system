'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/StatCard';
import { Plus, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

export function InventoryClient({ products, categories, suppliers }: { products: any[]; categories: any[]; suppliers: any[] }) {
  const supabase = createClient();
  const [list, setList] = useState(products);
  const [showForm, setShowForm] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'STOCK_IN' | 'WASTAGE' | 'DAMAGED' | 'ADJUSTMENT'>('STOCK_IN');

  const [form, setForm] = useState({
    name: '', sku: '', category_id: categories[0]?.id ?? '', unit: 'bottle',
    cost_price: '', selling_price: '', current_stock: '0', minimum_stock: '0',
  });

  async function addProduct() {
    if (!form.name.trim()) return toast.error('Name required');
    const { data, error } = await supabase.from('products').insert({
      ...form,
      sku: form.sku || null,
      cost_price: Number(form.cost_price) || 0,
      selling_price: Number(form.selling_price) || 0,
      current_stock: Number(form.current_stock) || 0,
      minimum_stock: Number(form.minimum_stock) || 0,
    }).select().single();
    if (error) return toast.error(error.message);
    setList((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
    setShowForm(false);
    toast.success('Product added');
  }

  async function submitAdjustment(productId: string) {
    const qty = Number(adjustQty);
    if (!qty) return toast.error('Enter a quantity');
    const delta = adjustType === 'STOCK_IN' ? qty : -Math.abs(qty);
    const { error } = await supabase.rpc('adjust_stock', {
      p_product_id: productId, p_delta: delta, p_txn_type: adjustType,
      p_reference_type: 'manual', p_reference_id: null, p_unit_cost: null, p_reason: `Manual ${adjustType}`,
    });
    if (error) return toast.error(error.message);
    setList((prev) => prev.map((p) => (p.id === productId ? { ...p, current_stock: Number(p.current_stock) + delta } : p)));
    setAdjustingId(null);
    setAdjustQty('');
    toast.success('Stock updated');
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Inventory"
        description="Stock levels & manual adjustments"
        actions={
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-sm font-medium px-3 py-2 rounded-lg">
            <Plus size={16} /> Add product
          </button>
        }
      />

      {showForm && (
        <div className="m-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3 max-w-lg">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Product name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="Unit (bottle, pc...)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Cost price" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
            <input type="number" placeholder="Selling price" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Starting stock" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
            <input type="number" placeholder="Minimum stock" value={form.minimum_stock} onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={addProduct} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg py-2 text-sm font-medium">Save product</button>
        </div>
      )}

      <div className="px-4 space-y-2 mt-2">
        {list.map((p) => {
          const low = Number(p.current_stock) <= Number(p.minimum_stock);
          const margin = p.selling_price > 0 ? (((p.selling_price - p.cost_price) / p.selling_price) * 100).toFixed(0) : '—';
          return (
            <div key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-neutral-500">{p.sku ?? '—'} · cost ₱{p.cost_price} · sell ₱{p.selling_price} · margin {margin}%</div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold text-sm ${low ? 'text-rose-400' : 'text-neutral-200'}`}>{p.current_stock} {p.unit}</div>
                  <div className="text-xs text-neutral-600">min {p.minimum_stock}</div>
                </div>
              </div>
              {adjustingId === p.id ? (
                <div className="flex gap-2 mt-3">
                  <select value={adjustType} onChange={(e) => setAdjustType(e.target.value as any)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs">
                    <option value="STOCK_IN">Stock-in</option>
                    <option value="WASTAGE">Wastage</option>
                    <option value="DAMAGED">Damaged</option>
                    <option value="ADJUSTMENT">Count adjustment</option>
                  </select>
                  <input type="number" placeholder="Qty" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} className="w-20 bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs" />
                  <button onClick={() => submitAdjustment(p.id)} className="bg-fuchsia-600 rounded-lg px-3 text-xs font-medium">Apply</button>
                  <button onClick={() => setAdjustingId(null)} className="text-xs text-neutral-500 px-2">Cancel</button>
                </div>
              ) : (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setAdjustingId(p.id); setAdjustType('STOCK_IN'); }} className="flex items-center gap-1 text-xs text-emerald-400"><ArrowUpCircle size={14} /> Stock-in</button>
                  <button onClick={() => { setAdjustingId(p.id); setAdjustType('WASTAGE'); }} className="flex items-center gap-1 text-xs text-rose-400"><ArrowDownCircle size={14} /> Wastage/Damage</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
