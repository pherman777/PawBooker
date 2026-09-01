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
// deployments, etc.) bounces sign-in/sign-up (and, once /book exists,
// browsing/booking) to the homepage waitlist instead. Once both app store
// reviews clear and paw-booker.com itself should start serving the real
// thing too, set the LAUNCHED env var to "true" in Vercel and redeploy - no
// code change needed, so launch day doesn't require an engineer on hand.
// Stays unset/false until that's an intentional decision. Doesn't affect "/"
// on any host - see isAppOnlyHost above for why app.paw-booker.com's "/"
// redirect is separate from this.
const LAUNCHED = process.env.LAUNCHED === 'true';

// Only gate the actual production deployment. Vercel sets VERCEL_ENV to
// "preview" for every branch/PR deploy (unguessable URLs, not the real
// domain) - those need to stay open regardless of LAUNCHED so a branch can
// actually be QA'd before it's merged and goes live for real.
const isProductionDeploy = process.env.VERCEL_ENV === 'production';

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

  // Every other host, production only: "/" is always the real marketing
  // homepage. Sign-in/sign-up and all of /book (browsing is public, not just
  // its own sign-in/sign-up) get gated pre-launch - once LAUNCHED is true
  // they pass through to the real pages here too.
  if (isProductionDeploy && !LAUNCHED && (pathname === '/dashboard/sign-in' || pathname === '/dashboard/sign-up' || pathname.startsWith('/book'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = pathname === '/dashboard/sign-up' ? '?notify=1&groomer=1' : '?notify=1';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/sign-in', '/dashboard/sign-up', '/book', '/book/:path*'],
};
