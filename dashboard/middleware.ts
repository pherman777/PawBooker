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
  const { pathname } = request.nextUrl;

  if (isUnlockedHost(host)) {
    // The marketing homepage lives at "/" too (same deployment serves both
    // hosts) - on the live app host, a groomer landing on "/" should hit the
    // real app, not the marketing splash. /dashboard already redirects an
    // unauthenticated visitor to /dashboard/sign-in itself (see
    // app/dashboard/(dashboard)/layout.tsx), so this just needs to get them
    // there rather than duplicating that check.
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Locked host: only sign-in/sign-up bounce to the waitlist. "/" itself is
  // the real marketing homepage and must render normally here - it's only
  // in the matcher below for the unlocked-host branch above.
  if (pathname === '/dashboard/sign-in' || pathname === '/dashboard/sign-up') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = pathname === '/dashboard/sign-up' ? '?notify=1&groomer=1' : '?notify=1';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/sign-in', '/dashboard/sign-up'],
};
