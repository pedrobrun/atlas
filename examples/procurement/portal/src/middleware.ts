import { NextResponse, type NextRequest } from 'next/server';

// Middleware runs on the edge runtime without node:crypto, so it only checks that a session
// cookie exists. The signature is verified in src/lib/session.ts on every page and BFF call.
export function middleware(request: NextRequest) {
  if (request.cookies.has('nw_session')) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const login = new URL(process.env.SSO_LOGIN_URL ?? '/login', request.url);
  login.searchParams.set('returnTo', request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|healthz).*)'],
};
