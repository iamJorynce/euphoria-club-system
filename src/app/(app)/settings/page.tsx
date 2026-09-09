import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { SettingsClient } from '@/components/settings/SettingsClient';

export default async function SettingsPage() {
  await requireModule('settings');
  const supabase = await createClient();

  const [{ data: rooms }, { data: tables }, { data: categories }, { data: expenseCategories }, { data: suppliers }, { data: products }, { data: productModifiers }] =
    await Promise.all([
      supabase.from('rooms').select('*'),
      supabase.from('club_tables').select('*').order('table_number'),
      supabase.from('product_categories').select('*').order('name'),
      supabase.from('expense_categories').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('product_modifiers').select('*'),
    ]);

  return (
    <SettingsClient
      rooms={rooms ?? []}
      tables={tables ?? []}
      categories={categories ?? []}
      expenseCategories={expenseCategories ?? []}
      suppliers={suppliers ?? []}
      products={products ?? []}
      productModifiers={productModifiers ?? []}
    />
  );
}
