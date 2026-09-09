'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/StatCard';
import { Plus } from 'lucide-react';

export function SettingsClient({
  rooms, tables, categories, expenseCategories, suppliers, products, productModifiers,
}: { rooms: any[]; tables: any[]; categories: any[]; expenseCategories: any[]; suppliers: any[]; products: any[]; productModifiers: any[] }) {
  const supabase = createClient();
  const [tab, setTab] = useState<'tables' | 'categories' | 'suppliers' | 'addons'>('tables');
  const [tableList, setTableList] = useState(tables);
  const [categoryList, setCategoryList] = useState(categories);
  const [supplierList, setSupplierList] = useState(suppliers);
  const [modifierList, setModifierList] = useState(productModifiers);

  const [newTable, setNewTable] = useState({ room_id: rooms[0]?.id ?? '', table_number: '', capacity: '4' });
  const [newCategory, setNewCategory] = useState('');
  const [newSupplier, setNewSupplier] = useState({ name: '', contact_person: '', phone: '' });
  const [addonProductId, setAddonProductId] = useState(products[0]?.id ?? '');
  const [newAddon, setNewAddon] = useState({ name: '', extra_price: '0' });

  async function addTable() {
    if (!newTable.table_number.trim()) return toast.error('Table number required');
    const { data, error } = await supabase.from('club_tables').insert({ ...newTable, capacity: Number(newTable.capacity) }).select().single();
    if (error) return toast.error(error.message);
    setTableList((p) => [...p, data]);
    setNewTable({ ...newTable, table_number: '' });
    toast.success('Table added');
  }

  async function addCategory() {
    if (!newCategory.trim()) return toast.error('Name required');
    const { data, error } = await supabase.from('product_categories').insert({ name: newCategory }).select().single();
    if (error) return toast.error(error.message);
    setCategoryList((p) => [...p, data]);
    setNewCategory('');
    toast.success('Category added');
  }

  async function addSupplier() {
    if (!newSupplier.name.trim()) return toast.error('Name required');
    const { data, error } = await supabase.from('suppliers').insert(newSupplier).select().single();
    if (error) return toast.error(error.message);
    setSupplierList((p) => [...p, data]);
    setNewSupplier({ name: '', contact_person: '', phone: '' });
    toast.success('Supplier added');
  }

  async function addAddon() {
    if (!addonProductId || !newAddon.name.trim()) return toast.error('Product and add-on name required');
    const { data, error } = await supabase.from('product_modifiers').insert({ product_id: addonProductId, name: newAddon.name, extra_price: Number(newAddon.extra_price) || 0 }).select().single();
    if (error) return toast.error(error.message);
    setModifierList((p) => [...p, data]);
    setNewAddon({ name: '', extra_price: '0' });
    toast.success('Add-on created');
  }

  async function removeAddon(id: string) {
    const { error } = await supabase.from('product_modifiers').delete().eq('id', id);
    if (error) return toast.error(error.message);
    setModifierList((p) => p.filter((m) => m.id !== id));
  }

  return (
    <div className="pb-10">
      <PageHeader title="Settings" description="Operational configuration" />
      <div className="px-4 pt-4 flex gap-2">
        {(['tables', 'categories', 'suppliers', 'addons'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${tab === t ? 'bg-fuchsia-600' : 'bg-neutral-900 text-neutral-400'}`}>
            {t === 'addons' ? 'Add-ons' : t}
          </button>
        ))}
      </div>

      {tab === 'tables' && (
        <div className="p-4 space-y-4 max-w-lg">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <select value={newTable.room_id} onChange={(e) => setNewTable({ ...newTable, room_id: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-xs">
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <input placeholder="Table #" value={newTable.table_number} onChange={(e) => setNewTable({ ...newTable, table_number: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-xs" />
              <input type="number" placeholder="Capacity" value={newTable.capacity} onChange={(e) => setNewTable({ ...newTable, capacity: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-xs" />
            </div>
            <button onClick={addTable} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5"><Plus size={14} /> Add table</button>
          </div>
          <div className="space-y-1.5">
            {tableList.map((t) => {
              const room = rooms.find((r) => r.id === t.room_id);
              return (
                <div key={t.id} className="flex justify-between text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                  <span>{t.table_number} · {room?.name}</span><span className="text-neutral-500">{t.capacity} pax</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="p-4 space-y-4 max-w-lg">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 flex gap-2">
            <input placeholder="New product category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
            <button onClick={addCategory} className="bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg px-4 text-sm font-medium">Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {categoryList.map((c) => (
              <span key={c.id} className="text-xs bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1.5">{c.name}</span>
            ))}
          </div>
          <div className="text-xs text-neutral-500 mt-4">Expense categories: {expenseCategories.map((c: any) => c.name).join(', ')}</div>
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="p-4 space-y-4 max-w-lg">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-2">
            <input placeholder="Supplier name" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Contact person" value={newSupplier.contact_person} onChange={(e) => setNewSupplier({ ...newSupplier, contact_person: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Phone" value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
            </div>
            <button onClick={addSupplier} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg py-2 text-sm font-medium">Add supplier</button>
          </div>
          <div className="space-y-1.5">
            {supplierList.map((s) => (
              <div key={s.id} className="text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">{s.name} {s.phone && `· ${s.phone}`}</div>
            ))}
          </div>
        </div>
      )}

      {tab === 'addons' && (
        <div className="p-4 space-y-4 max-w-lg">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-2">
            <select value={addonProductId} onChange={(e) => setAddonProductId(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm">
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Add-on name (e.g. Extra ice)" value={newAddon.name} onChange={(e) => setNewAddon({ ...newAddon, name: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
              <input type="number" placeholder="Extra price (0 = free)" value={newAddon.extra_price} onChange={(e) => setNewAddon({ ...newAddon, extra_price: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
            </div>
            <button onClick={addAddon} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg py-2 text-sm font-medium">Add add-on</button>
          </div>
          <div className="space-y-1.5">
            {products.map((p) => {
              const mods = modifierList.filter((m) => m.product_id === p.id);
              if (mods.length === 0) return null;
              return (
                <div key={p.id} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                  <div className="text-xs font-medium text-neutral-400 mb-1.5">{p.name}</div>
                  <div className="space-y-1">
                    {mods.map((m) => (
                      <div key={m.id} className="flex justify-between items-center text-sm">
                        <span>{m.name} {m.extra_price > 0 && <span className="text-neutral-500">+₱{m.extra_price}</span>}</span>
                        <button onClick={() => removeAddon(m.id)} className="text-xs text-rose-400">Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {modifierList.length === 0 && <div className="text-center text-neutral-600 text-sm py-6">No add-ons created yet.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
