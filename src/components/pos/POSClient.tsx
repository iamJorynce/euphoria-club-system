'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { Plus, Minus, Trash2, Receipt, DoorOpen, LogOut, ArrowLeftRight, Combine, Split, UserCog, Ban } from 'lucide-react';
import { ReceiptView, type ReceiptData } from '@/components/pos/ReceiptView';
import { getBusinessDate } from '@/lib/business-date';

type ModifierOption = { id: string; name: string; extra_price: number };

type CartLine = {
  key: string;
  dbId?: string; // set when this line is a persisted order_items row (table-backed tab)
  product_id: string;
  name: string;
  unit_price: number; // already includes any selected modifier extra price
  unit_cost: number;
  quantity: number;
  discount_amount: number;
  modifiers: { name: string; extra_price: number }[];
};

export function POSClient({
  rooms, tables, products, categories, promoters, modifiers, cashierId, cashierName, role, openShift,
}: {
  rooms: any[]; tables: any[]; products: any[]; categories: any[]; promoters: any[]; modifiers: ModifierOption[];
  cashierId: string; cashierName: string; role: string; openShift: any | null;
}) {
  const supabase = createClient();
  const [shift, setShift] = useState<any | null>(openShift);
  const [openingCash, setOpeningCash] = useState('5000');

  const [roomId, setRoomId] = useState<string>(rooms[0]?.id ?? '');
  const [tableId, setTableId] = useState<string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [promoterId, setPromoterId] = useState<string | null>(null);
  const [guestlistId, setGuestlistId] = useState<string | null>(null);
  const [pax, setPax] = useState<number>(0);
  const [entranceCharged, setEntranceCharged] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paying, setPaying] = useState(false);
  const [payMethod, setPayMethod] = useState<'CASH' | 'GCASH' | 'CARD' | 'OTHER'>('CASH');
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [closing, setClosing] = useState(false);
  const [closedSummary, setClosedSummary] = useState<any | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);

  const [modifierProduct, setModifierProduct] = useState<any | null>(null);
  const [pickedModifiers, setPickedModifiers] = useState<ModifierOption[]>([]);

  const [voidTarget, setVoidTarget] = useState<CartLine | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [showTransfer, setShowTransfer] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<any[]>([]);
  const [showSplit, setShowSplit] = useState(false);
  const [splitSelected, setSplitSelected] = useState<Set<string>>(new Set());
  const [showCancelOrder, setShowCancelOrder] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showReassign, setShowReassign] = useState(false);
  const [reassignPromoterId, setReassignPromoterId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const room = rooms.find((r) => r.id === roomId);
  const roomTables = tables.filter((t) => t.room_id === roomId);
  const filteredProducts = products.filter((p) => categoryId === 'all' || p.category_id === categoryId);
  const isTableOrder = Boolean(currentOrderId);

  const subtotal = cart.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const discountTotal = cart.reduce((s, l) => s + l.discount_amount, 0);
  const entranceTotal = entranceCharged ? pax * Number(room?.entrance_fee ?? 0) : 0;
  const grandTotal = subtotal - discountTotal + entranceTotal;

  function mapDbItem(item: any): CartLine {
    const p = products.find((pr) => pr.id === item.product_id);
    return {
      key: item.id,
      dbId: item.id,
      product_id: item.product_id,
      name: p?.name ?? 'Item',
      unit_price: Number(item.unit_price),
      unit_cost: Number(item.unit_cost),
      quantity: Number(item.quantity),
      discount_amount: Number(item.discount_amount),
      modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
    };
  }

  async function openShiftHandler() {
    const { data, error } = await supabase
      .from('shifts')
      .insert({ cashier_id: cashierId, opening_cash: Number(openingCash), status: 'OPEN' })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setShift(data);
    toast.success('Shift opened');
  }

  async function closeShiftHandler() {
    if (!shift) return;
    if (actualCash === '') return toast.error('Enter the counted cash amount');
    setClosing(true);
    const { data, error } = await supabase.rpc('close_shift', { p_shift_id: shift.id, p_actual_cash: Number(actualCash) });
    setClosing(false);
    if (error) return toast.error(error.message);
    setClosedSummary(Array.isArray(data) ? data[0] : data);
    toast.success('Shift closed');
  }

  function startNewShift() {
    setShift(null);
    setClosedSummary(null);
    setShowCloseShift(false);
    setActualCash('');
    setOpeningCash('5000');
  }

  function resetSelection() {
    setTableId(null);
    setCurrentOrderId(null);
    setGuestlistId(null);
    setPromoterId(null);
    setPax(0);
    setEntranceCharged(false);
    setCart([]);
  }

  async function selectTable(table: any) {
    setTableId(table.id);
    setCart([]);
    setCurrentOrderId(null);

    const { data: existingOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('table_id', table.id)
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (existingOrder) {
      setCurrentOrderId(existingOrder.id);
      setGuestlistId(existingOrder.guestlist_id);
      setPromoterId(existingOrder.promoter_id);
      setEntranceCharged(Number(existingOrder.entrance_total) > 0);

      if (existingOrder.guestlist_id) {
        const { data: gl } = await supabase.from('guestlists').select('*').eq('id', existingOrder.guestlist_id).single();
        setPax(gl?.pax ?? 0);
      } else {
        setPax(0);
      }

      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', existingOrder.id).eq('status', 'ACTIVE');
      setCart((items ?? []).map(mapDbItem));
      return;
    }

    const today = getBusinessDate();
    const { data: gl } = await supabase
      .from('guestlists')
      .select('*')
      .eq('table_id', table.id)
      .eq('business_date', today)
      .eq('status', 'ARRIVED')
      .order('arrived_at', { ascending: false })
      .maybeSingle();

    if (gl) {
      setGuestlistId(gl.id);
      setPromoterId(gl.promoter_id);
      setPax(gl.pax);
    } else {
      setGuestlistId(null);
      setPromoterId(null);
      setPax(0);
    }
    setEntranceCharged(false);
  }

  async function ensureOrder(): Promise<string> {
    if (currentOrderId) return currentOrderId;
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        room_id: roomId, table_id: tableId, guestlist_id: guestlistId, promoter_id: promoterId,
        cashier_id: cashierId, shift_id: shift?.id ?? null, status: 'OPEN',
        entrance_total: entranceCharged ? pax * Number(room?.entrance_fee ?? 0) : 0,
      })
      .select()
      .single();
    if (error || !order) throw error ?? new Error('Failed to open order');
    setCurrentOrderId(order.id);
    if (tableId) await supabase.from('club_tables').update({ status: 'OCCUPIED' }).eq('id', tableId);
    return order.id;
  }

  function productModifiers(productId: string) {
    return modifiers.filter((m) => (m as any).product_id === productId);
  }

  function openAddProduct(p: any) {
    const mods = productModifiers(p.id);
    if (mods.length > 0) {
      setModifierProduct(p);
      setPickedModifiers([]);
      return;
    }
    addToCart(p, []);
  }

  async function addToCart(p: any, selected: ModifierOption[]) {
    const extra = selected.reduce((s, m) => s + Number(m.extra_price), 0);
    const unitPrice = Number(p.selling_price) + extra;
    const modifierPayload = selected.map((m) => ({ name: m.name, extra_price: m.extra_price }));

    if (tableId) {
      try {
        const orderId = await ensureOrder();
        const { data: item, error } = await supabase
          .from('order_items')
          .insert({ order_id: orderId, product_id: p.id, quantity: 1, unit_cost: Number(p.cost_price), unit_price: unitPrice, modifiers: modifierPayload })
          .select()
          .single();
        if (error) throw error;
        setCart((prev) => [...prev, mapDbItem(item)]);
      } catch (e: any) {
        toast.error(e.message ?? 'Failed to add item');
      }
    } else {
      setCart((prev) => [
        ...prev,
        { key: crypto.randomUUID(), product_id: p.id, name: p.name, unit_price: unitPrice, unit_cost: Number(p.cost_price), quantity: 1, discount_amount: 0, modifiers: modifierPayload },
      ]);
    }
    setModifierProduct(null);
  }

  async function updateQty(line: CartLine, delta: number) {
    const newQty = line.quantity + delta;
    if (newQty <= 0) return removeLine(line);
    if (line.dbId) {
      const { error } = await supabase.from('order_items').update({ quantity: newQty }).eq('id', line.dbId);
      if (error) return toast.error(error.message);
    }
    setCart((prev) => prev.map((l) => (l.key === line.key ? { ...l, quantity: newQty } : l)));
  }

  function removeLine(line: CartLine) {
    if (line.dbId) {
      setVoidTarget(line);
      setVoidReason('');
      return;
    }
    setCart((prev) => prev.filter((l) => l.key !== line.key));
  }

  async function confirmVoid() {
    if (!voidTarget?.dbId) return;
    if (!voidReason.trim()) return toast.error('A reason is required to void an item');
    const { error } = await supabase.rpc('void_order_item', { p_item_id: voidTarget.dbId, p_reason: voidReason });
    if (error) return toast.error(error.message);
    setCart((prev) => prev.filter((l) => l.key !== voidTarget.key));
    setVoidTarget(null);
    setVoidReason('');
    toast.success('Item voided');
  }

  async function chargeEntrance() {
    if (!guestlistId || pax <= 0) return;
    try {
      const orderId = await ensureOrder();
      const { data: existingGuests } = await supabase.from('guestlist_guests').select('*').eq('guestlist_id', guestlistId);
      const have = existingGuests?.length ?? 0;
      if (have < pax) {
        const toInsert = Array.from({ length: pax - have }, (_, i) => ({ guestlist_id: guestlistId, guest_name: `Guest ${have + i + 1}` }));
        await supabase.from('guestlist_guests').insert(toInsert);
      }
      await supabase.from('guestlist_guests').update({ paid_entrance: true, entrance_paid_at: new Date().toISOString() }).eq('guestlist_id', guestlistId).eq('paid_entrance', false);
      const newEntranceTotal = pax * Number(room?.entrance_fee ?? 0);
      await supabase.from('orders').update({ entrance_total: newEntranceTotal }).eq('id', orderId);
      setEntranceCharged(true);
      toast.success(`Entrance charged for ${pax} guests`);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to charge entrance');
    }
  }

  async function completeSale() {
    if (cart.length === 0) return toast.error('Add items before checkout');
    setPaying(true);
    try {
      let orderId = currentOrderId;
      let finalGrandTotal = grandTotal;

      if (orderId) {
        const { data: freshOrder } = await supabase.from('orders').select('*').eq('id', orderId).single();
        finalGrandTotal = Number(freshOrder.grand_total);
      } else {
        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .insert({ room_id: roomId, table_id: tableId, guestlist_id: guestlistId, promoter_id: promoterId, cashier_id: cashierId, shift_id: shift?.id ?? null, status: 'OPEN', entrance_total: entranceTotal })
          .select()
          .single();
        if (orderErr || !order) throw orderErr;
        orderId = order.id;

        const items = cart.map((l) => ({ order_id: orderId, product_id: l.product_id, quantity: l.quantity, unit_cost: l.unit_cost, unit_price: l.unit_price, discount_amount: l.discount_amount, modifiers: l.modifiers }));
        const { error: itemsErr } = await supabase.from('order_items').insert(items);
        if (itemsErr) throw itemsErr;

        const { data: freshOrder } = await supabase.from('orders').select('*').eq('id', orderId).single();
        finalGrandTotal = Number(freshOrder.grand_total);
      }

      const { error: payErr } = await supabase.from('payments').insert({ order_id: orderId, method: payMethod, amount: finalGrandTotal, status: 'PAID', received_by: cashierId });
      if (payErr) throw payErr;

      const { data: paidOrder, error: updateErr } = await supabase.from('orders').update({ status: 'PAID', paid_at: new Date().toISOString() }).eq('id', orderId).select().single();
      if (updateErr) throw updateErr;

      if (tableId) await supabase.from('club_tables').update({ status: 'CLEANING' }).eq('id', tableId);

      const tableNumber = tables.find((t) => t.id === tableId)?.table_number ?? null;
      setLastReceipt({
        orderNumber: paidOrder.order_number, paidAt: paidOrder.paid_at, roomName: room?.name ?? '', tableNumber,
        cashierName, paymentMethod: payMethod, entranceTotal, discountTotal,
        grandTotal: finalGrandTotal, items: cart.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unit_price, discount: l.discount_amount })),
      });

      toast.success(`Sale complete — ₱${finalGrandTotal.toLocaleString()}`);
      resetSelection();
    } catch (e: any) {
      toast.error(e.message ?? 'Checkout failed');
    } finally {
      setPaying(false);
    }
  }

  // ---- transfer / merge / split / cancel / reassign ----

  async function doTransfer(newTableId: string) {
    if (!currentOrderId) return;
    setActionBusy(true);
    const { error } = await supabase.rpc('transfer_order_table', { p_order_id: currentOrderId, p_new_table_id: newTableId, p_reason: 'Transferred via POS' });
    setActionBusy(false);
    if (error) return toast.error(error.message);
    setTableId(newTableId);
    setShowTransfer(false);
    toast.success('Table transferred');
  }

  async function openMergeModal() {
    if (!currentOrderId) return;
    const { data } = await supabase.from('orders').select('*').eq('status', 'OPEN').eq('room_id', roomId).neq('id', currentOrderId).not('table_id', 'is', null);
    setMergeCandidates(data ?? []);
    setShowMerge(true);
  }

  async function doMerge(targetOrderId: string) {
    if (!currentOrderId) return;
    setActionBusy(true);
    const { error } = await supabase.rpc('merge_orders', { p_source_order_id: currentOrderId, p_target_order_id: targetOrderId, p_reason: 'Merged via POS' });
    setActionBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Bills merged');
    setShowMerge(false);
    resetSelection();
  }

  function toggleSplitItem(dbId: string) {
    setSplitSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dbId)) next.delete(dbId); else next.add(dbId);
      return next;
    });
  }

  async function doSplitAndPay() {
    if (!currentOrderId || splitSelected.size === 0) return toast.error('Select at least one item');
    setActionBusy(true);
    try {
      const ids = Array.from(splitSelected);
      const { data: newOrderId, error } = await supabase.rpc('split_order_items', { p_source_order_id: currentOrderId, p_item_ids: ids, p_reason: 'Split bill via POS' });
      if (error) throw error;

      const { data: newItems } = await supabase.from('order_items').select('*').eq('order_id', newOrderId).eq('status', 'ACTIVE');
      const { data: newOrderRow } = await supabase.from('orders').select('*').eq('id', newOrderId).single();

      await supabase.from('payments').insert({ order_id: newOrderId, method: payMethod, amount: newOrderRow.grand_total, status: 'PAID', received_by: cashierId });
      const { data: paidSplit } = await supabase.from('orders').update({ status: 'PAID', paid_at: new Date().toISOString() }).eq('id', newOrderId).select().single();

      setCart((prev) => prev.filter((l) => !l.dbId || !ids.includes(l.dbId)));
      setLastReceipt({
        orderNumber: paidSplit.order_number, paidAt: paidSplit.paid_at, roomName: room?.name ?? '',
        tableNumber: tables.find((t) => t.id === tableId)?.table_number ?? null, cashierName, paymentMethod: payMethod,
        entranceTotal: 0, discountTotal: 0, grandTotal: Number(newOrderRow.grand_total),
        items: (newItems ?? []).map((it: any) => { const p = products.find((pr) => pr.id === it.product_id); return { name: p?.name ?? 'Item', quantity: Number(it.quantity), unitPrice: Number(it.unit_price), discount: Number(it.discount_amount) }; }),
      });
      setShowSplit(false);
      setSplitSelected(new Set());
      toast.success('Split bill paid');
    } catch (e: any) {
      toast.error(e.message ?? 'Split failed');
    } finally {
      setActionBusy(false);
    }
  }

  async function doCancelOrder() {
    if (!currentOrderId) return;
    if (!cancelReason.trim()) return toast.error('A reason is required to cancel this order');
    setActionBusy(true);
    const { error } = await supabase.rpc('cancel_order', { p_order_id: currentOrderId, p_reason: cancelReason });
    setActionBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Order cancelled');
    setShowCancelOrder(false);
    setCancelReason('');
    resetSelection();
  }

  async function doReassignPromoter() {
    if (!currentOrderId || !reassignPromoterId) return;
    if (!reassignReason.trim()) return toast.error('A reason is required to reassign the promoter');
    setActionBusy(true);
    const { error } = await supabase.rpc('reassign_order_promoter', { p_order_id: currentOrderId, p_new_promoter_id: reassignPromoterId, p_reason: reassignReason });
    setActionBusy(false);
    if (error) return toast.error(error.message);
    setPromoterId(reassignPromoterId);
    setShowReassign(false);
    setReassignReason('');
    toast.success('Promoter reassigned');
  }

  if (closedSummary) {
    const variance = Number(closedSummary.variance);
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="text-center mb-4">
            <LogOut className="mx-auto mb-3 text-fuchsia-400" size={28} />
            <h2 className="font-semibold text-lg">Shift closed</h2>
          </div>
          <div className="space-y-2 text-sm border-t border-neutral-800 pt-4">
            <div className="flex justify-between"><span className="text-neutral-500">Opening cash</span><span>₱{Number(closedSummary.opening_cash).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Expected cash</span><span>₱{Number(closedSummary.expected_cash).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Actual cash counted</span><span>₱{Number(closedSummary.closing_cash).toLocaleString()}</span></div>
            <div className="flex justify-between font-bold pt-2 border-t border-neutral-800">
              <span>Variance</span>
              <span className={variance === 0 ? 'text-neutral-100' : variance > 0 ? 'text-emerald-400' : 'text-rose-400'}>{variance > 0 ? '+' : ''}₱{variance.toLocaleString()}</span>
            </div>
          </div>
          {Math.abs(variance) > 500 && <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900 rounded-lg p-2.5 mt-4">Significant variance — flag this to a manager for approval.</p>}
          <button onClick={startNewShift} className="w-full mt-5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 py-2.5 font-medium">Start next shift</button>
        </div>
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center">
          <DoorOpen className="mx-auto mb-3 text-fuchsia-400" size={28} />
          <h2 className="font-semibold text-lg mb-1">Open your shift</h2>
          <p className="text-sm text-neutral-500 mb-4">Enter your opening cash drawer amount to start the POS.</p>
          <input type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2.5 text-center text-lg mb-4" />
          <button onClick={openShiftHandler} className="w-full rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 py-2.5 font-medium">Open Shift</button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col lg:flex-row h-[calc(100vh)] lg:h-screen">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-40 lg:pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            {rooms.map((r) => (
              <button key={r.id} onClick={() => { setRoomId(r.id); resetSelection(); }} className={`px-4 py-2 rounded-lg text-sm font-medium border ${roomId === r.id ? 'bg-fuchsia-600 border-fuchsia-600 text-white' : 'border-neutral-800 text-neutral-400'}`}>
                {r.name}
              </button>
            ))}
          </div>
          <button onClick={() => setShowCloseShift(true)} className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-rose-400 border border-neutral-800 rounded-lg px-3 py-2 shrink-0">
            <LogOut size={14} /> Close Shift
          </button>
        </div>

        <div>
          <div className="text-xs font-medium text-neutral-500 mb-2">TABLES</div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {roomTables.map((t) => (
              <button key={t.id} onClick={() => selectTable(t)} className={`rounded-lg border px-2 py-3 text-xs font-medium text-center ${tableId === t.id ? 'bg-fuchsia-600 border-fuchsia-600 text-white' : t.status === 'AVAILABLE' ? 'border-neutral-800 text-neutral-300' : t.status === 'OCCUPIED' ? 'border-emerald-800 bg-emerald-950/30 text-emerald-400' : 'border-amber-800 bg-amber-950/30 text-amber-400'}`}>
                <div className="font-semibold">{t.table_number}</div>
                <div className="opacity-70">{t.capacity}p</div>
              </button>
            ))}
            <button onClick={resetSelection} className={`rounded-lg border px-2 py-3 text-xs font-medium ${!tableId ? 'bg-fuchsia-600 border-fuchsia-600 text-white' : 'border-neutral-800 text-neutral-400'}`}>
              Walk-up
            </button>
          </div>
        </div>

        {guestlistId && (
          <div className="rounded-lg border border-fuchsia-900/50 bg-fuchsia-950/20 p-3 text-sm flex items-center justify-between flex-wrap gap-2">
            <span>Attributed promoter linked · {pax} pax</span>
            <div className="flex items-center gap-2">
              {room?.type === 'NIGHTCLUB' && !entranceCharged && (
                <button onClick={chargeEntrance} className="text-xs bg-fuchsia-600 px-2.5 py-1.5 rounded-md font-medium">Charge entrance (₱{Number(room?.entrance_fee ?? 0) * pax})</button>
              )}
              {entranceCharged && <span className="text-xs text-emerald-400">Entrance charged ✓</span>}
              {(role === 'ADMIN' || role === 'MANAGER') && isTableOrder && (
                <button onClick={() => { setShowReassign(true); setReassignPromoterId(promoterId ?? ''); }} className="text-xs flex items-center gap-1 text-neutral-400 hover:text-neutral-200 border border-neutral-700 px-2 py-1.5 rounded-md">
                  <UserCog size={13} /> Reassign
                </button>
              )}
            </div>
          </div>
        )}

        {isTableOrder && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setShowTransfer(true)} className="flex items-center gap-1 text-xs border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-400"><ArrowLeftRight size={13} /> Transfer table</button>
            <button onClick={openMergeModal} className="flex items-center gap-1 text-xs border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-400"><Combine size={13} /> Merge bills</button>
            <button onClick={() => setShowSplit(true)} className="flex items-center gap-1 text-xs border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-400"><Split size={13} /> Split bill</button>
            <button onClick={() => setShowCancelOrder(true)} className="flex items-center gap-1 text-xs border border-rose-900 rounded-lg px-2.5 py-1.5 text-rose-400"><Ban size={13} /> Cancel order</button>
          </div>
        )}

        <div>
          <div className="flex gap-2 overflow-x-auto pb-1 mb-2">
            <button onClick={() => setCategoryId('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${categoryId === 'all' ? 'bg-neutral-100 text-neutral-900' : 'border-neutral-800 text-neutral-400'}`}>All</button>
            {categories.map((c) => (
              <button key={c.id} onClick={() => setCategoryId(c.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${categoryId === c.id ? 'bg-neutral-100 text-neutral-900' : 'border-neutral-800 text-neutral-400'}`}>{c.name}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filteredProducts.map((p) => (
              <button key={p.id} onClick={() => openAddProduct(p)} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-left hover:border-fuchsia-700 transition-colors">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-xs text-neutral-500 mt-1">₱{Number(p.selling_price).toLocaleString()}{productModifiers(p.id).length > 0 && ' · add-ons'}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-neutral-800 bg-neutral-950 flex flex-col fixed bottom-0 left-0 right-0 lg:static max-h-[70vh] lg:max-h-none">
        <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
          <Receipt size={16} className="text-fuchsia-400" />
          <span className="font-semibold text-sm">{isTableOrder ? 'Table Tab' : 'Current Order'}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 && <div className="text-center text-neutral-600 text-sm py-8">No items yet</div>}
          {cart.map((l) => (
            <div key={l.key} className="flex items-center gap-2 bg-neutral-900 rounded-lg p-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{l.name}</div>
                <div className="text-xs text-neutral-500">₱{l.unit_price} × {l.quantity}{l.modifiers.length > 0 && ` · ${l.modifiers.map((m) => m.name).join(', ')}`}</div>
              </div>
              <button onClick={() => updateQty(l, -1)} className="p-1 rounded bg-neutral-800"><Minus size={14} /></button>
              <span className="w-5 text-center text-sm">{l.quantity}</span>
              <button onClick={() => updateQty(l, 1)} className="p-1 rounded bg-neutral-800"><Plus size={14} /></button>
              <button onClick={() => removeLine(l)} className="p-1 rounded bg-neutral-800 text-rose-400"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-neutral-800 space-y-2">
          <div className="flex justify-between text-sm text-neutral-400"><span>Subtotal</span><span>₱{subtotal.toLocaleString()}</span></div>
          {entranceTotal > 0 && <div className="flex justify-between text-sm text-neutral-400"><span>Entrance</span><span>₱{entranceTotal.toLocaleString()}</span></div>}
          <div className="flex justify-between font-bold text-base"><span>Total</span><span>₱{grandTotal.toLocaleString()}</span></div>
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {(['CASH', 'GCASH', 'CARD', 'OTHER'] as const).map((m) => (
              <button key={m} onClick={() => setPayMethod(m)} className={`py-1.5 rounded-md text-xs font-medium border ${payMethod === m ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-neutral-800 text-neutral-400'}`}>{m}</button>
            ))}
          </div>
          <button onClick={completeSale} disabled={paying || cart.length === 0} className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-3 font-semibold mt-2">
            {paying ? 'Processing…' : `Complete Sale — ₱${grandTotal.toLocaleString()}`}
          </button>
        </div>
      </div>
    </div>

    {modifierProduct && (
      <Modal onClose={() => setModifierProduct(null)} title={`Add-ons — ${modifierProduct.name}`}>
        <div className="space-y-2 mb-4">
          {productModifiers(modifierProduct.id).map((m) => {
            const checked = pickedModifiers.some((pm) => pm.id === m.id);
            return (
              <label key={m.id} className="flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm cursor-pointer">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={checked} onChange={() => setPickedModifiers((prev) => checked ? prev.filter((pm) => pm.id !== m.id) : [...prev, m])} />
                  {m.name}
                </span>
                <span className="text-neutral-500">{m.extra_price > 0 ? `+₱${m.extra_price}` : 'free'}</span>
              </label>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={() => addToCart(modifierProduct, [])} className="flex-1 py-2.5 rounded-lg bg-neutral-800 text-sm font-medium">No add-ons</button>
          <button onClick={() => addToCart(modifierProduct, pickedModifiers)} className="flex-1 py-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-sm font-medium">Add to order</button>
        </div>
      </Modal>
    )}

    {voidTarget && (
      <Modal onClose={() => setVoidTarget(null)} title={`Void — ${voidTarget.name}`}>
        <p className="text-xs text-neutral-500 mb-3">Voiding restores inventory and is recorded in the audit log.</p>
        <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason for voiding" rows={2} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-3" autoFocus />
        <div className="flex gap-2">
          <button onClick={() => setVoidTarget(null)} className="flex-1 py-2.5 rounded-lg bg-neutral-800 text-sm font-medium">Cancel</button>
          <button onClick={confirmVoid} className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm font-medium">Void item</button>
        </div>
      </Modal>
    )}

    {showTransfer && (
      <Modal onClose={() => setShowTransfer(false)} title="Transfer to table">
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {tables.filter((t) => t.room_id === roomId && t.status === 'AVAILABLE' && t.id !== tableId).map((t) => (
            <button key={t.id} onClick={() => doTransfer(t.id)} disabled={actionBusy} className="w-full flex justify-between items-center bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm hover:border-fuchsia-700">
              <span>Table {t.table_number}</span><span className="text-neutral-500 text-xs">{t.capacity} pax</span>
            </button>
          ))}
          {tables.filter((t) => t.room_id === roomId && t.status === 'AVAILABLE' && t.id !== tableId).length === 0 && <div className="text-center text-neutral-600 text-sm py-6">No available tables in this room.</div>}
        </div>
      </Modal>
    )}

    {showMerge && (
      <Modal onClose={() => setShowMerge(false)} title="Merge into another table's bill">
        <p className="text-xs text-neutral-500 mb-3">This table's items move into the selected bill; this table is freed.</p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {mergeCandidates.map((o) => {
            const t = tables.find((tb) => tb.id === o.table_id);
            return (
              <button key={o.id} onClick={() => doMerge(o.id)} disabled={actionBusy} className="w-full flex justify-between items-center bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm hover:border-fuchsia-700">
                <span>Table {t?.table_number ?? '—'}</span><span className="text-neutral-500 text-xs">₱{Number(o.grand_total).toLocaleString()}</span>
              </button>
            );
          })}
          {mergeCandidates.length === 0 && <div className="text-center text-neutral-600 text-sm py-6">No other open bills in this room.</div>}
        </div>
      </Modal>
    )}

    {showSplit && (
      <Modal onClose={() => setShowSplit(false)} title="Split bill">
        <p className="text-xs text-neutral-500 mb-3">Select items to move to a separate bill and pay now.</p>
        <div className="space-y-1.5 max-h-56 overflow-y-auto mb-3">
          {cart.filter((l) => l.dbId).map((l) => (
            <label key={l.key} className="flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm cursor-pointer">
              <span className="flex items-center gap-2"><input type="checkbox" checked={splitSelected.has(l.dbId!)} onChange={() => toggleSplitItem(l.dbId!)} /> {l.name} ×{l.quantity}</span>
              <span className="text-neutral-500">₱{(l.unit_price * l.quantity).toLocaleString()}</span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {(['CASH', 'GCASH', 'CARD', 'OTHER'] as const).map((m) => (
            <button key={m} onClick={() => setPayMethod(m)} className={`py-1.5 rounded-md text-xs font-medium border ${payMethod === m ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-neutral-800 text-neutral-400'}`}>{m}</button>
          ))}
        </div>
        <button onClick={doSplitAndPay} disabled={actionBusy || splitSelected.size === 0} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium">Pay selected as separate bill</button>
      </Modal>
    )}

    {showCancelOrder && (
      <Modal onClose={() => setShowCancelOrder(false)} title="Cancel this order">
        <p className="text-xs text-neutral-500 mb-3">All items will be voided (inventory restored) and this table freed.</p>
        <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancelling" rows={2} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-3" autoFocus />
        <div className="flex gap-2">
          <button onClick={() => setShowCancelOrder(false)} className="flex-1 py-2.5 rounded-lg bg-neutral-800 text-sm font-medium">Back</button>
          <button onClick={doCancelOrder} disabled={actionBusy} className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm font-medium">Cancel order</button>
        </div>
      </Modal>
    )}

    {showReassign && (
      <Modal onClose={() => setShowReassign(false)} title="Reassign promoter attribution">
        <p className="text-xs text-neutral-500 mb-3">Admin/Manager only. This changes who earns commission on this bill going forward.</p>
        <select value={reassignPromoterId} onChange={(e) => setReassignPromoterId(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-3">
          <option value="">Select promoter…</option>
          {promoters.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <textarea value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} placeholder="Reason (required)" rows={2} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-3" />
        <button onClick={doReassignPromoter} disabled={actionBusy} className="w-full py-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-sm font-medium">Confirm reassignment</button>
      </Modal>
    )}

    {showCloseShift && (
      <Modal onClose={() => setShowCloseShift(false)} title="Close shift">
        <p className="text-xs text-neutral-500 mb-4">Count your cash drawer and enter the total. Expected cash is calculated automatically from cash sales this shift.</p>
        <label className="block text-xs text-neutral-500 mb-1.5">Actual cash counted</label>
        <input type="number" value={actualCash} onChange={(e) => setActualCash(e.target.value)} placeholder="0" className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2.5 text-center text-lg mb-4" autoFocus />
        <div className="flex gap-2">
          <button onClick={() => setShowCloseShift(false)} className="flex-1 py-2.5 rounded-lg bg-neutral-800 text-sm font-medium">Cancel</button>
          <button onClick={closeShiftHandler} disabled={closing} className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-sm font-medium">{closing ? 'Closing…' : 'Confirm close'}</button>
        </div>
      </Modal>
    )}

    {lastReceipt && <ReceiptView receipt={lastReceipt} onClose={() => setLastReceipt(null)} />}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-lg mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
}
