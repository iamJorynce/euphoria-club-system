import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PurchasingClient } from '@/components/purchasing/PurchasingClient';

export default async function PurchasingPage() {
  await requireModule('purchasing');
  const supabase = await createClient();

  const [{ data: purchases }, { data: products }, { data: suppliers }] = await Promise.all([
    supabase.from('purchases').select('*, purchase_items(*)').order('created_at', { ascending: false }).limit(50),
    supabase.from('products').select('*').eq('is_active', true).order('name'),
    supabase.from('suppliers').select('*'),
  ]);

  return <PurchasingClient purchases={purchases ?? []} products={products ?? []} suppliers={suppliers ?? []} />;
}
