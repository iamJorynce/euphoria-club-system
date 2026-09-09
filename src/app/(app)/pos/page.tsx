import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { POSClient } from '@/components/pos/POSClient';
import { ReceptionEntranceClient } from '@/components/pos/ReceptionEntranceClient';
import { getBusinessDate } from '@/lib/business-date';

export default async function POSPage() {
  const profile = await requireModule('pos');
  const supabase = await createClient();

  // Receptionists get a dedicated, much simpler screen: no product cart, no
  // shift management — just checking today's arrivals, charging the entrance
  // fee, and assigning a table.
  if (profile.role === 'RECEPTIONIST') {
    const today = getBusinessDate();
    const [{ data: rooms }, { data: tables }, { data: guestlists }] = await Promise.all([
      supabase.from('rooms').select('*').eq('is_active', true),
      supabase.from('club_tables').select('*').eq('is_active', true),
      supabase.from('guestlists').select('*').eq('business_date', today).eq('status', 'ARRIVED').order('arrived_at', { ascending: false }),
    ]);

    const guestlistIds = (guestlists ?? []).map((g) => g.id);
    const { data: guestlistGuests } = guestlistIds.length
      ? await supabase.from('guestlist_guests').select('*').in('guestlist_id', guestlistIds)
      : { data: [] as any[] };

    return (
      <ReceptionEntranceClient
        rooms={rooms ?? []}
        tables={tables ?? []}
        guestlists={guestlists ?? []}
        guestlistGuests={guestlistGuests ?? []}
        receptionistId={profile.id}
      />
    );
  }

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

  return (
    <POSClient
      rooms={rooms ?? []}
      tables={tables ?? []}
      products={products ?? []}
      categories={categories ?? []}
      promoters={promoters ?? []}
      modifiers={modifiers ?? []}
      cashierId={profile.id}
      cashierName={profile.full_name}
      role={profile.role}
      openShift={shift ?? null}
    />
  );
}
