import Image from 'next/image';
import Link from 'next/link';

import styles from '@/app/marketing.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.siteFooter}>
      <div className={`${styles.wrap} ${styles.footInner}`}>
        <Link className={styles.brand} href="/" style={{ fontSize: 15, color: 'var(--ink)' }}>
          <Image src="/images/icon.png" alt="" width={24} height={24} />
          PawBooker
        </Link>
        <nav className={styles.footLinks}>
          <Link href="/#owners">For pet owners</Link>
          <Link href="/#groomers">For groomers</Link>
          <Link href="/support">Support</Link>
          <Link href="/privacy">Privacy</Link>
          <a href="mailto:support@paw-booker.com">Contact</a>
        </nav>
        <span className={styles.copy}>&copy; 2026 PawBooker</span>
      </div>
    </footer>
  );
}
