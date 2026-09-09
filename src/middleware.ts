import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// NOTE: Role-based page authorization is enforced again inside each route (via
// requireRole()) AND at the database layer via RLS. Middleware here only handles
// session refresh + "must be logged in" redirect. Never rely on middleware alone.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
