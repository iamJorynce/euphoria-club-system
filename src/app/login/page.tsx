'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Welcome back');
    // Best-effort audit trail; never blocks login if it fails.
    await supabase.rpc('write_audit_log', {
      p_action: 'LOGIN', p_module: 'auth', p_table: null, p_record_id: null, p_old: null, p_new: null, p_reason: null,
    }).then(undefined, () => {});
    // '/' looks up the signed-in user's role server-side and redirects to their
    // correct home screen (e.g. promoters -> /promoter, cashiers -> /pos).
    // Never hardcode '/dashboard' here — that's admin/manager only.
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-fuchsia-400 tracking-tight">Club POS</h1>
          <p className="text-neutral-500 text-sm mt-1">Live Band + Nightclub Management</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              placeholder="you@club.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white font-medium py-2.5 text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-center text-xs text-neutral-600 mt-6">
          Accounts are created by an administrator. Contact management for access.
        </p>
      </div>
    </div>
  );
}
