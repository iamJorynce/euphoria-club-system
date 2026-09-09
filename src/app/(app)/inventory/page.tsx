import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { InventoryClient } from '@/components/inventory/InventoryClient';

export default async function InventoryPage() {
  await requireModule('inventory');
  const supabase = await createClient();

  const [{ data: products }, { data: categories }, { data: suppliers }] = await Promise.all([
    supabase.from('products').select('*').order('name'),
    supabase.from('product_categories').select('*'),
    supabase.from('suppliers').select('*'),
  ]);

  return <InventoryClient products={products ?? []} categories={categories ?? []} suppliers={suppliers ?? []} />;
}
