import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { POSClient } from '@/components/pos/POSClient';
import { ReceptionEntranceClient } from '@/components/pos/ReceptionEntranceClient';
import { POSViewSwitcher } from '@/components/pos/POSViewSwitcher';
import { getBusinessDate } from '@/lib/business-date';

async function loadEntranceProps(supabase: Awaited<ReturnType<typeof createClient>>, receptionistId: string) {
  const today = getBusinessDate();
  // RESERVED + ARRIVED (not just ARRIVED): reception needs to see tonight's
  // full roster to check guests in one at a time as they trickle in, not
  // only groups someone already bulk-marked as arrived.
  const [{ data: rooms }, { data: tables }, { data: guestlists }] = await Promise.all([
    supabase.from('rooms').select('*').eq('is_active', true),
    supabase.from('club_tables').select('*').eq('is_active', true),
    supabase.from('guestlists').select('*').eq('business_date', today).in('status', ['RESERVED', 'ARRIVED']).order('eta', { ascending: true }),
  ]);

  const guestlistIds = (guestlists ?? []).map((g) => g.id);
  const { data: guestlistGuests } = guestlistIds.length
    ? await supabase.from('guestlist_guests').select('*').in('guestlist_id', guestlistIds)
    : { data: [] as any[] };

  return {
    rooms: rooms ?? [],
    tables: tables ?? [],
    guestlists: guestlists ?? [],
    guestlistGuests: guestlistGuests ?? [],
    receptionistId,
  };
}

async function loadPosProps(supabase: Awaited<ReturnType<typeof createClient>>, profile: { id: string; full_name: string; role: string }) {
  const [{ data: rooms }, { data: tables }, { data: products }, { data: categories }, { data: promoters }, { data: modifiers }, { data: shift }] =
    await Promise.all([
      supabase.from('rooms').select('*').eq('is_active', true),
      supabase.from('club_tables').select('*').eq('is_active', true),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('product_categories').select('*').eq('is_active', true),
      supabase.from('promoters').select('*').eq('is_active', true),
      supabase.from('product_modifiers').select('*').eq('is_active', true),
      supabase.from('shifts').select('*').eq('cashier_id', profile.id).eq('status', 'OPEN').maybeSingle(),
    ]);

  return {
    rooms: rooms ?? [],
    tables: tables ?? [],
    products: products ?? [],
    categories: categories ?? [],
    promoters: promoters ?? [],
    modifiers: modifiers ?? [],
    cashierId: profile.id,
    cashierName: profile.full_name,
    role: profile.role,
    openShift: shift ?? null,
  };
}

export default async function POSPage() {
  const profile = await requireModule('pos');
  const supabase = await createClient();

  // Receptionists get a dedicated, much simpler screen: no product cart, no
  // shift management — just checking today's arrivals, charging the entrance
  // fee, and assigning a table.
  if (profile.role === 'RECEPTIONIST') {
    const entranceProps = await loadEntranceProps(supabase, profile.id);
    return <ReceptionEntranceClient {...entranceProps} />;
  }

  // ADMIN/MANAGER can see both: the full cashier POS and the same per-guest
  // Entrance check-in screen receptionists use, switchable via tabs. Useful
  // when reception is short-staffed or an admin wants to check the door
  // themselves without a dedicated RECEPTIONIST login.
  if (profile.role === 'ADMIN' || profile.role === 'MANAGER') {
    const [posProps, entranceProps] = await Promise.all([
      loadPosProps(supabase, profile),
      loadEntranceProps(supabase, profile.id),
    ]);
    return <POSViewSwitcher posProps={posProps} entranceProps={entranceProps} />;
  }

  const posProps = await loadPosProps(supabase, profile);
  return <POSClient {...posProps} />;
}
