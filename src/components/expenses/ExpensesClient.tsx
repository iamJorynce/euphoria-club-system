'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/StatCard';
import { Plus, Trash2, Search } from 'lucide-react';

export function ExpensesClient({ expenses, categories }: { expenses: any[]; categories: any[] }) {
  const supabase = createClient();
  const [list, setList] = useState(expenses);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const [form, setForm] = useState({
    category_id: categories[0]?.id ?? '', description: '', amount: '', expense_date: new Date().toISOString().slice(0, 10),
    payment_method: 'CASH', reference_number: '', notes: '',
  });

  async function addExpense() {
    if (!form.description.trim() || !Number(form.amount)) return toast.error('Description and amount are required');
    const { data, error } = await supabase.from('expenses').insert({ ...form, amount: Number(form.amount) }).select().single();
    if (error) return toast.error(error.message);
    setList((prev) => [data, ...prev]);
    setShowForm(false);
    setForm({ ...form, description: '', amount: '', reference_number: '', notes: '' });
    toast.success('Expense recorded');
  }

  async function confirmDelete() {
    if (!deleteTarget || !deleteReason.trim()) return toast.error('A reason is required to delete an expense');
    const { error } = await supabase.rpc('soft_delete_expense', { p_expense_id: deleteTarget, p_reason: deleteReason });
    if (error) return toast.error(error.message);
    setList((prev) => prev.filter((e) => e.id !== deleteTarget));
    setDeleteTarget(null);
    setDeleteReason('');
    toast.success('Expense deleted and logged to audit trail');
  }

  const filtered = useMemo(() => {
    return list.filter((e) => {
      if (categoryFilter !== 'all' && e.category_id !== categoryFilter) return false;
      if (search && !e.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [list, categoryFilter, search]);

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="pb-10">
      <PageHeader
        title="Expenses"
        description={`Total shown: ₱${total.toLocaleString()}`}
        actions={
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-sm font-medium px-3 py-2 rounded-lg">
            <Plus size={16} /> Add expense
          </button>
        }
      />

      {showForm && (
        <div className="m-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3 max-w-lg">
          <div className="grid grid-cols-2 gap-3">
            <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
            <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm">
              {['CASH', 'GCASH', 'CARD', 'OTHER'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <input placeholder="Reference # (optional)" value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm" />
          <button onClick={addExpense} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg py-2 text-sm font-medium">Save expense</button>
        </div>
      )}

      <div className="px-4 flex gap-2 mt-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
          <input placeholder="Search description…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-8 pr-3 py-2 text-sm" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm">
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="px-4 space-y-2 mt-3">
        {filtered.map((e) => {
          const cat = categories.find((c) => c.id === e.category_id);
          return (
            <div key={e.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{e.description}</div>
                <div className="text-xs text-neutral-500">{cat?.name} · {e.expense_date} · {e.payment_method}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm text-rose-400">₱{Number(e.amount).toLocaleString()}</span>
                <button onClick={() => setDeleteTarget(e.id)} className="text-neutral-600 hover:text-rose-400"><Trash2 size={15} /></button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center text-neutral-600 text-sm py-10">No expenses found.</div>}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Delete this expense?</h3>
            <p className="text-xs text-neutral-500 mb-3">This requires a reason and will be recorded in the audit log.</p>
            <textarea value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="Reason for deletion" rows={2} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-3" />
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-lg bg-neutral-800 text-sm">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2 rounded-lg bg-rose-600 text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
