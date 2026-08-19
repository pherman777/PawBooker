import type { Metadata } from 'next';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

import styles from '../marketing.module.css';

export const metadata: Metadata = { title: 'Delete Your PawBooker Account' };

export default function DeleteAccountPage() {
  return (
    <>
      <SiteHeader />
      <div className={styles.page}>
        <p className="eyebrow">Account</p>
        <h1>Delete Your Account</h1>
        <p className={styles.pageLede}>
          You can permanently delete your PawBooker account and personal data at any time, directly from the app.
        </p>

        <div className="card">
          <h2>Pet owners</h2>
          <ol>
            <li>Open the PawBooker app and sign in</li>
            <li>
              Go to the <strong>Profile</strong> tab
            </li>
            <li>
              Scroll to the bottom and tap <strong>Delete account</strong>
            </li>
            <li>Confirm when prompted</li>
          </ol>
        </div>

        <div className="card">
          <h2>Groomers</h2>
          <ol>
            <li>Open the PawBooker app and sign in to your salon dashboard</li>
            <li>Tap the menu icon in the top right</li>
            <li>
              Tap <strong>Delete account</strong>
            </li>
            <li>Confirm when prompted</li>
          </ol>
        </div>

        <h2 style={{ marginTop: 44 }}>What gets deleted</h2>
        <p>
          Your login, pets, saved payment methods, and messages are permanently deleted immediately. Any active Pro
          subscription is canceled right away. Completed bookings and reviews are kept, but anonymized &mdash; the
          record of the service and payment stays (so the groomer you booked with keeps accurate business records),
          but it&rsquo;s no longer linked to your identity.
        </p>

        <h3>Can&rsquo;t access the app?</h3>
        <p style={{ marginBottom: 0 }}>
          Email <a href="mailto:support@paw-booker.com">support@paw-booker.com</a> from the address on your account
          and we&rsquo;ll delete it for you.
        </p>
      </div>
      <SiteFooter />
    </>
  );
}
