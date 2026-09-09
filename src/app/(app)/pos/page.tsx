import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { POSClient } from '@/components/pos/POSClient';

export default async function POSPage() {
  const profile = await requireModule('pos');
  const supabase = await createClient();

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
