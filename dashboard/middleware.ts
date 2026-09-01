import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// app.paw-booker.com (the live pilot groomer's domain) is app-only - "/"
// there should hit the real dashboard, not the marketing splash, regardless
// of public launch status. Localhost is included so this never gets in the
// way of testing the real flow before pushing.
const LIVE_APP_HOST = 'app.paw-booker.com';

function isAppOnlyHost(host: string): boolean {
  return host === LIVE_APP_HOST || host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

// Public launch switch: real groomer accounts are only created on
// app.paw-booker.com pre-launch - every other host (paw-booker.com, preview
// deployments, etc.) bounces sign-in/sign-up to the homepage waitlist
// instead. Once both app store reviews clear and paw-booker.com itself
// should start serving real sign-up/sign-in too, set the LAUNCHED env var to
// "true" in Vercel and redeploy - no code change needed, so launch day
// doesn't require an engineer on hand. Stays unset/false until that's an
// intentional decision. Doesn't affect "/" on any host - see isAppOnlyHost
// above for why app.paw-booker.com's "/" redirect is separate from this.
const LAUNCHED = process.env.LAUNCHED === 'true';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  if (isAppOnlyHost(host)) {
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

  // Every other host: "/" is always the real marketing homepage. Only
  // sign-in/sign-up get gated, and only pre-launch - once LAUNCHED is true
  // they pass through to the real pages here too.
  if (!LAUNCHED && (pathname === '/dashboard/sign-in' || pathname === '/dashboard/sign-up')) {
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
