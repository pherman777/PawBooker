'use client';

import { Calendar, MessageCircle, Search, User } from 'lucide-react';
import Link from 'next/link';

import styles from './page.module.css';

// Bare landing page for /book - nav cards to the other sections, mirroring
// app/(tabs)/index.tsx's card layout (minus its testimonials/review prompt,
// out of scope for the foundation phase).
const NAV_CARDS = [
  { href: '/book/browse', icon: Search, title: 'Find a groomer', subtitle: 'Search grooming services near you' },
  { href: '/book/bookings', icon: Calendar, title: 'My bookings', subtitle: 'View and manage appointments' },
  { href: '/book/messages', icon: MessageCircle, title: 'Messages', subtitle: 'Chat with your groomer' },
  { href: '/book/account', icon: User, title: 'Account & pets', subtitle: 'Manage your pets and account' },
];

export default function BookHomePage() {
  return (
    <div>
      <div className={styles.hero}>
        <h1 className="page-title">PawBooker</h1>
        <p className={styles.tagline}>Grooming made easy for your best friend.</p>
      </div>

      <div className={styles.cards}>
        {NAV_CARDS.map(({ href, icon: Icon, title, subtitle }) => (
          <Link key={href} href={href} className={`card ${styles.card}`}>
            <div className={styles.cardIcon}>
              <Icon size={20} strokeWidth={2} />
            </div>
            <div className={styles.cardText}>
              <div className={styles.cardTitle}>{title}</div>
              <div className={styles.cardSubtitle}>{subtitle}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
