'use client';

import Image from 'next/image';
import Link from 'next/link';

import { useNotifyModal } from '@/components/NotifyModal';
import styles from '@/app/marketing.module.css';

type Props = {
  showAuthCta?: boolean;
};

const LAUNCHED = process.env.NEXT_PUBLIC_LAUNCHED === 'true';

// Shared across the marketing homepage and the four inner pages
// (privacy/support/delete-account/upgrade). Only the homepage shows the
// "Log in / Sign up" CTA, matching the original public/index.html vs.
// public/{support,privacy,...}.html nav markup. Real sign-in/sign-up isn't
// live on this domain yet pre-launch (see dashboard/middleware.ts) - this
// opens the same waitlist modal as the rest of the homepage instead of
// linking to /book/sign-in directly. Once LAUNCHED flips, links to the real
// customer sign-in - groomers have their own distinct "List your business"
// CTAs elsewhere on the page rather than sharing this one.
export function SiteHeader({ showAuthCta }: Props) {
  const { openModal } = useNotifyModal();

  return (
    <header className={styles.nav}>
      <div className={`${styles.wrap} ${styles.navInner}`}>
        <Link className={styles.brand} href="/">
          <Image src="/images/icon.png" alt="" width={28} height={28} />
          PawBooker
        </Link>
        <nav className={styles.navLinks}>
          <Link href="/#owners">For pet owners</Link>
          <Link href="/#groomers">For groomers</Link>
          {showAuthCta &&
            (LAUNCHED ? (
              <Link className={`btn btn-sm ${styles.btnSage}`} data-btn href="/book/sign-in">
                Log in / Sign up
              </Link>
            ) : (
              <button className={`btn btn-sm ${styles.btnSage}`} data-btn onClick={() => openModal()}>
                Log in / Sign up
              </button>
            ))}
        </nav>
      </div>
    </header>
  );
}
