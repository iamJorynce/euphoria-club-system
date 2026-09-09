import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';

// Uses the Supabase service role key (server-only env var) to create auth users.
// This must never be exposed to the client — it bypasses RLS entirely.
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only admins can create users.' }, { status: 403 });
  }

  const { email, full_name, role, password } = await req.json();
  if (!email || !full_name || !role || !password) {
    return NextResponse.json({ error: 'email, full_name, role, and password are required.' }, { status: 400 });
  }

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // profile row is auto-created by the handle_new_auth_user() trigger with the
  // metadata role above; nothing further to do here.
  return NextResponse.json({ user: data.user });
}
