import type { Metadata } from 'next';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

import styles from '../marketing.module.css';

export const metadata: Metadata = { title: 'PawBooker Support' };

export default function SupportPage() {
  return (
    <>
      <SiteHeader />
      <div className={styles.page}>
        <p className="eyebrow">Help</p>
        <h1>Support</h1>
        <p className={styles.pageLede}>Need help with a booking, payment, or your account? We&rsquo;re happy to help.</p>

        <div className="card">
          <h2>Contact us</h2>
          <p style={{ marginBottom: 0 }}>
            Email <a href="mailto:support@paw-booker.com">support@paw-booker.com</a> and we&rsquo;ll get back to you
            as soon as we can.
          </p>
        </div>

        <h2 style={{ marginTop: 44 }}>Frequently asked</h2>
        <h3>I need to cancel or change a booking</h3>
        <p>
          Open the appointment in the Bookings tab of the app &mdash; you can cancel it directly, or message your
          groomer to reschedule.
        </p>

        <h3>I was charged incorrectly</h3>
        <p>Email us at the address above with your appointment details and we&rsquo;ll look into it.</p>

        <h3>I&rsquo;m a groomer and want to sign up</h3>
        <p>Email us at the address above and we&rsquo;ll help you get set up.</p>
      </div>
      <SiteFooter />
    </>
  );
}
