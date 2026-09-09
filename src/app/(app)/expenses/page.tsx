import { requireModule } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ExpensesClient } from '@/components/expenses/ExpensesClient';

export default async function ExpensesPage() {
  await requireModule('expenses');
  const supabase = await createClient();

  const [{ data: expenses }, { data: categories }] = await Promise.all([
    supabase.from('expenses').select('*').is('deleted_at', null).order('expense_date', { ascending: false }).limit(200),
    supabase.from('expense_categories').select('*').order('name'),
  ]);

  return <ExpensesClient expenses={expenses ?? []} categories={categories ?? []} />;
}
