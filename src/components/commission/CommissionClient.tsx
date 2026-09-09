'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/StatCard';

const PAYOUT_METHODS = ['CASH', 'GCASH', 'CARD', 'OTHER'] as const;
type PayoutMethod = (typeof PAYOUT_METHODS)[number];

function pesos(n: number) {
  return '₱' + Number(n).toLocaleString('en-PH');
}

export function CommissionClient({
  rooms, rules, promoters, records,
}: { rooms: any[]; rules: any[]; promoters: any[]; records: any[] }) {
  const supabase = createClient();
  const [tab, setTab] = useState<'settings' | 'records' | 'adjust'>('settings');
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<Record<string, { entrance_fee: string; entrance_commission: string; consumption_pct: string; effective_from: string }>>({});

  // records is server-fetched; mirror it in state so a payout can update rows
  // in place without a full page refetch.
  const [recordList, setRecordList] = useState(records);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('CASH');
  const [payoutReference, setPayoutReference] = useState('');
  const [payingOut, setPayingOut] = useState(false);

  const selectedRecords = useMemo(
    () => recordList.filter((r) => selectedIds.has(r.id)),
    [recordList, selectedIds]
  );
  const selectedPromoterId = selectedRecords[0]?.promoter_id ?? null;
  const selectedTotal = selectedRecords.reduce((s, r) => s + Number(r.commission_amount), 0);

  function toggleSelect(r: any) {
    if (r.status !== 'APPROVED') return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(r.id)) {
        next.delete(r.id);
        return next;
      }
      // keep a payout batch to a single promoter — starting a selection with
      // a different promoter's record replaces the current selection instead
      // of mixing promoters (the RPC rejects mixed-promoter batches anyway).
      if (selectedPromoterId && r.promoter_id !== selectedPromoterId) {
        toast('Switched promoter — payouts are one promoter at a time.', { icon: '↺' });
        return new Set([r.id]);
      }
      next.add(r.id);
      return next;
    });
  }

  async function payOutSelected() {
    if (selectedIds.size === 0) return;
    setPayingOut(true);
    const ids = Array.from(selectedIds);
    const { data, error } = await supabase.rpc('mark_commission_paid', {
      p_record_ids: ids,
      p_method: payoutMethod,
      p_reference: payoutReference.trim() || null,
    });
    setPayingOut(false);
    if (error) return toast.error(error.message);
    const updatedById = new Map<string, any>((data ?? []).map((r: any) => [r.id, r]));
    setRecordList((prev) => prev.map((r) => {
      const updated = updatedById.get(r.id);
      return updated ? { ...r, ...updated } : r;
    }));
    setSelectedIds(new Set());
    setPayoutReference('');
    toast.success(`Paid out ${pesos(selectedTotal)} to ${ids.length} record(s)`);
  }

  const activeRules = rooms.map((r) => rules.find((ru) => ru.room_id === r.id && !ru.effective_until));

  function getForm(roomId: string) {
    const active = rules.find((r) => r.room_id === roomId && !r.effective_until);
    return (
      ruleForm[roomId] ?? {
        entrance_fee: String(active?.entrance_fee ?? 0),
        entrance_commission: String(active?.entrance_commission_per_head ?? 0),
        consumption_pct: String(active?.consumption_commission_pct ?? 0),
        effective_from: '',
      }
    );
  }

  async function saveRule(roomId: string) {
    const f = getForm(roomId);
    setSavingRoomId(roomId);
    const effectiveFrom = f.effective_from ? new Date(f.effective_from).toISOString() : new Date().toISOString();
    const { error } = await supabase.rpc('close_and_replace_commission_rule', {
      p_room_id: roomId,
      p_entrance_fee: Number(f.entrance_fee),
      p_entrance_commission: Number(f.entrance_commission),
      p_consumption_pct: Number(f.consumption_pct),
      p_effective_from: effectiveFrom,
    });
    setSavingRoomId(null);
    if (error) return toast.error(error.message);
    toast.success('Commission rule updated. Historical transactions are unaffected.');
  }

  // manual adjustment form
  const [adj, setAdj] = useState({ promoter_id: promoters[0]?.id ?? '', original_amount: '', new_amount: '', reason: '' });
  async function submitAdjustment() {
    if (!adj.reason.trim()) return toast.error('A reason is required for manual adjustments.');
    const { error } = await supabase.from('commission_adjustments').insert({
      promoter_id: adj.promoter_id,
      original_amount: Number(adj.original_amount),
      new_amount: Number(adj.new_amount),
      reason: adj.reason,
    });
    if (error) return toast.error(error.message);
    toast.success('Adjustment recorded and logged to audit trail.');
    setAdj({ ...adj, original_amount: '', new_amount: '', reason: '' });
  }

  return (
    <div className="pb-10">
      <PageHeader title="Commission Management" description="Rules are versioned — past transactions never change." />
      <div className="px-4 pt-4 flex gap-2">
        {(['settings', 'records', 'adjust'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${tab === t ? 'bg-fuchsia-600' : 'bg-neutral-900 text-neutral-400'}`}>
            {t === 'adjust' ? 'Manual Adjustment' : t}
          </button>
        ))}
      </div>

      {tab === 'settings' && (
        <div className="p-4 grid gap-4 lg:grid-cols-2">
          {rooms.map((room) => {
            const active = rules.find((r) => r.room_id === room.id && !r.effective_until);
            const f = getForm(room.id);
            return (
              <div key={room.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{room.name}</h3>
                  {active && <span className="text-xs text-neutral-500">Active since {new Date(active.effective_from).toLocaleDateString()}</span>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Entrance fee (₱)">
                    <input type="number" value={f.entrance_fee} onChange={(e) => setRuleForm({ ...ruleForm, [room.id]: { ...f, entrance_fee: e.target.value } })} className="input" />
                  </Field>
                  <Field label="Entrance commission / head (₱)">
                    <input type="number" value={f.entrance_commission} onChange={(e) => setRuleForm({ ...ruleForm, [room.id]: { ...f, entrance_commission: e.target.value } })} className="input" />
                  </Field>
                  <Field label="Consumption commission (%)">
                    <input type="number" step="0.1" value={f.consumption_pct} onChange={(e) => setRuleForm({ ...ruleForm, [room.id]: { ...f, consumption_pct: e.target.value } })} className="input" />
                  </Field>
                  <Field label="Effective from">
                    <input type="datetime-local" value={f.effective_from} onChange={(e) => setRuleForm({ ...ruleForm, [room.id]: { ...f, effective_from: e.target.value } })} className="input" />
                  </Field>
                </div>
                <button
                  onClick={() => saveRule(room.id)}
                  disabled={savingRoomId === room.id}
                  className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 rounded-lg py-2 text-sm font-medium"
                >
                  {savingRoomId === room.id ? 'Saving…' : 'Save new rule (keeps history)'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'records' && (
        <div className="p-4 space-y-2 pb-24">
          {recordList.map((r) => {
            const promoter = promoters.find((p) => p.id === r.promoter_id);
            const payable = r.status === 'APPROVED';
            const selected = selectedIds.has(r.id);
            return (
              <div
                key={r.id}
                onClick={() => toggleSelect(r)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm ${
                  selected ? 'border-fuchsia-600 bg-fuchsia-950/30' : 'border-neutral-800 bg-neutral-900'
                } ${payable ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {payable && (
                    <input type="checkbox" checked={selected} onChange={() => toggleSelect(r)} onClick={(e) => e.stopPropagation()} className="accent-fuchsia-600" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium">{promoter?.display_name ?? '—'}</div>
                    <div className="text-xs text-neutral-500">
                      {r.component} · {r.business_date} · {r.status}
                      {r.status === 'PAID' && r.paid_at && ` · paid ${new Date(r.paid_at).toLocaleDateString()} via ${r.payout_method}`}
                    </div>
                  </div>
                </div>
                <div className={r.status === 'VOIDED' ? 'line-through text-neutral-600' : 'font-semibold shrink-0'}>{pesos(r.commission_amount)}</div>
              </div>
            );
          })}
          {recordList.length === 0 && <div className="text-center text-neutral-600 text-sm py-10">No commission records yet.</div>}

          {selectedIds.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 lg:left-64 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur p-3 flex flex-wrap items-center gap-2">
              <div className="text-sm mr-auto">
                <span className="font-semibold">{selectedIds.size}</span> record(s) ·{' '}
                <span className="font-semibold">{pesos(selectedTotal)}</span> to{' '}
                {promoters.find((p) => p.id === selectedPromoterId)?.display_name ?? '—'}
              </div>
              <div className="flex gap-1.5">
                {PAYOUT_METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setPayoutMethod(m)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium border ${payoutMethod === m ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-neutral-800 text-neutral-400'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <input
                placeholder="Reference # (optional)"
                value={payoutReference}
                onChange={(e) => setPayoutReference(e.target.value)}
                className="input w-40"
              />
              <button
                onClick={payOutSelected}
                disabled={payingOut}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-semibold"
              >
                {payingOut ? 'Paying out…' : `Mark paid — ${pesos(selectedTotal)}`}
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-neutral-500 hover:text-neutral-300 px-2">
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'adjust' && (
        <div className="p-4 max-w-md">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
            <Field label="Promoter">
              <select value={adj.promoter_id} onChange={(e) => setAdj({ ...adj, promoter_id: e.target.value })} className="input">
                {promoters.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Original amount (₱)"><input type="number" value={adj.original_amount} onChange={(e) => setAdj({ ...adj, original_amount: e.target.value })} className="input" /></Field>
              <Field label="New amount (₱)"><input type="number" value={adj.new_amount} onChange={(e) => setAdj({ ...adj, new_amount: e.target.value })} className="input" /></Field>
            </div>
            <Field label="Reason (required)"><textarea value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} className="input" rows={2} /></Field>
            <button onClick={submitAdjustment} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg py-2 text-sm font-medium">Save adjustment</button>
            <p className="text-xs text-neutral-500">Promoters cannot edit their own commission. Every adjustment is written to the audit log.</p>
          </div>
        </div>
      )}

      <style>{`.input { width:100%; background:#0a0a0a; border:1px solid #262626; border-radius:0.5rem; padding:0.5rem 0.75rem; font-size:0.875rem; }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
