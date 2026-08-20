'use client';

import {
  Banknote,
  Briefcase,
  Calendar,
  ClipboardList,
  CreditCard,
  LayoutGrid,
  LogOut,
  Mail,
  Menu,
  PawPrint,
  Scissors,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { NotificationBell } from '@/components/NotificationBell';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

type MenuItem = {
  route: string;
  label: string;
  icon: typeof LayoutGrid;
  proOnly?: boolean;
};

const MENU_ITEMS: MenuItem[] = [
  { route: '/dashboard/welcome', label: 'Setup checklist', icon: ClipboardList },
  { route: '/dashboard/business-info', label: 'Business info', icon: Briefcase },
  { route: '/dashboard/services', label: 'Services & prices', icon: Scissors },
  { route: '/dashboard/staff', label: 'Groomers', icon: Users },
  { route: '/dashboard/supplies', label: 'Supplies', icon: PawPrint },
  { route: '/dashboard/discount', label: 'Multi-pet discount', icon: Wallet },
  { route: '/dashboard/vaccination', label: 'Vaccination requirement', icon: ShieldCheck },
  { route: '/dashboard/hours', label: 'Hours', icon: Calendar },
  { route: '/dashboard/invite', label: 'Invite your customers', icon: Mail },
  { route: '/dashboard/insights', label: 'Insights', icon: TrendingUp, proOnly: true },
  { route: '/dashboard/reminders', label: 'Win-back reminders', icon: Mail, proOnly: true },
  { route: '/dashboard/payouts', label: 'Payouts', icon: CreditCard },
  { route: '/dashboard/plan', label: 'Plan', icon: Banknote },
];

// Mirrors components/SalonWebNav.tsx + the handleOpenMenu action sheet from
// the RN app - a persistent top bar with a hamburger menu covering every
// salon settings screen, which the web dashboard didn't have until now.
export function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const { groomerProfile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isPro = groomerProfile?.plan === 'pro';

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  function handleSelect(item: MenuItem) {
    setMenuOpen(false);
    router.push(item.proOnly && !isPro ? '/plan' : item.route);
  }

  return (
    <header className="nav-bar">
      <div className="width-content nav-inner">
        <div className="nav-brand">
          <span className="nav-brand-mark" aria-hidden />
          <span className="nav-brand-name">PawBooker</span>
        </div>
        <div className="nav-links">
          <Link href="/dashboard" className={`nav-link${pathname === '/dashboard' ? ' nav-link-active' : ''}`}>
            <LayoutGrid size={15} strokeWidth={2} />
            Dashboard
          </Link>
          <Link
            href="/dashboard/customers"
            className={`nav-link${pathname.startsWith('/dashboard/customers') ? ' nav-link-active' : ''}`}>
            <Users size={15} strokeWidth={2} />
            Customers
          </Link>
        </div>
        <div className="nav-right">
          {groomerProfile && <span className="nav-groomer-name">{groomerProfile.name}</span>}
          {groomerProfile && <NotificationBell groomerId={groomerProfile.id} />}
          <div className="nav-menu-wrap" ref={panelRef}>
            <button className="nav-icon-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
              {menuOpen ? <X size={16} strokeWidth={2} /> : <Menu size={16} strokeWidth={2} />}
            </button>
            {menuOpen && (
              <div className="nav-menu-panel">
                {MENU_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const locked = item.proOnly && !isPro;
                  return (
                    <button key={item.route} className="nav-menu-item" onClick={() => handleSelect(item)}>
                      <Icon size={16} strokeWidth={2} color="var(--muted)" />
                      <span>{item.label}</span>
                      {locked && <span className="nav-menu-pro-tag">Pro</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button className="nav-icon-btn" onClick={() => supabase.auth.signOut()} aria-label="Sign out">
            <LogOut size={16} strokeWidth={2} />
          </button>
          {groomerProfile && (
            <div className="nav-avatar" aria-label="Account">
              {groomerProfile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={groomerProfile.avatarUrl} alt="" />
              ) : (
                initials(groomerProfile.name)
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
