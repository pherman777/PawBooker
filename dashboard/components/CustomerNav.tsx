'use client';

import { Calendar, LogOut, MessageCircle, Search, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { customerSupabase } from '@/lib/customerSupabase';

const NAV_LINKS = [
  { href: '/book/browse', label: 'Browse', icon: Search },
  { href: '/book/bookings', label: 'Bookings', icon: Calendar },
  { href: '/book/messages', label: 'Messages', icon: MessageCircle },
];

// Customer-side equivalent of components/Nav.tsx - a persistent top bar for
// every /book/(book)/* page, standing in for the native app's bottom tab bar
// ((tabs)/_layout.tsx: Home/Browse/Bookings/Messages/Profile). Deliberately
// its own component, not a variant of the groomer Nav - the two navs share
// no state (separate auth contexts) and mixing them risks the live groomer
// dashboard.
export function CustomerNav() {
  const pathname = usePathname();

  return (
    <header className="nav-bar">
      <div className="width-content nav-inner">
        <Link href="/book" className="nav-brand">
          <span className="nav-brand-mark" aria-hidden />
          <span className="nav-brand-name">PawBooker</span>
        </Link>
        <div className="nav-links">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link${pathname.startsWith(href) ? ' nav-link-active' : ''}`}>
              <Icon size={15} strokeWidth={2} />
              {label}
            </Link>
          ))}
        </div>
        <div className="nav-right">
          <Link href="/book/account" className="nav-icon-btn" aria-label="Account">
            <User size={16} strokeWidth={2} />
          </Link>
          <button className="nav-icon-btn" onClick={() => customerSupabase.auth.signOut()} aria-label="Sign out">
            <LogOut size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </header>
  );
}
