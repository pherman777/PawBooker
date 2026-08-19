import Image from 'next/image';
import Link from 'next/link';

import styles from '@/app/marketing.module.css';

type Props = {
  showAuthCta?: boolean;
};

// Shared across the marketing homepage and the four inner pages
// (privacy/support/delete-account/upgrade). Only the homepage shows the
// "Log in / Sign up" CTA, matching the original public/index.html vs.
// public/{support,privacy,...}.html nav markup.
export function SiteHeader({ showAuthCta }: Props) {
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
          {showAuthCta && (
            <Link className={`btn btn-sm ${styles.btnSage}`} data-btn href="/dashboard/sign-in">
              Log in / Sign up
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
