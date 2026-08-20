import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Real groomer accounts are only created on app.paw-booker.com (the live
// pilot groomer's domain) - everywhere else public (paw-booker.com, preview
// deployments, etc.) is pre-launch, so sign-in/sign-up there bounces to the
// homepage waitlist instead. Allow-list the live app host explicitly rather
// than block-list the marketing one, so a new host or preview URL is safe
// (gated) by default. Localhost is always unlocked so this never gets in
// the way of testing the real flow before pushing.
const LIVE_APP_HOST = 'app.paw-booker.com';

function isUnlockedHost(host: string): boolean {
  return host === LIVE_APP_HOST || host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  if (isUnlockedHost(host)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const url = request.nextUrl.clone();
  url.pathname = '/';
  url.search = pathname === '/dashboard/sign-up' ? '?notify=1&groomer=1' : '?notify=1';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/dashboard/sign-in', '/dashboard/sign-up'],
};
