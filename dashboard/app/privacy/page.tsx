import type { Metadata } from 'next';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

import styles from '../marketing.module.css';

export const metadata: Metadata = { title: 'PawBooker Privacy Policy' };

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <div className={styles.page}>
        <p className="eyebrow">Legal</p>
        <h1>Privacy Policy</h1>
        <div className={styles.updated}>Last updated: July 30, 2026</div>

        <div className={styles.notice}>
          <strong>Draft — not final legal advice.</strong> This policy was prepared as a working draft describing
          what the PawBooker app actually collects and how it&rsquo;s used. Have it reviewed by a licensed attorney
          in your jurisdiction before relying on it as your permanent, legally binding privacy policy.
        </div>

        <p>
          This Privacy Policy describes how PawBooker (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;)
          collects, uses, and shares information when you use the PawBooker mobile app (the &ldquo;App&rdquo;).
          PawBooker connects pet owners (&ldquo;Customers&rdquo;) with independent pet groomers
          (&ldquo;Groomers&rdquo;).
        </p>

        <h2>Information We Collect</h2>

        <h3>Account information</h3>
        <p>
          When you create an account, we collect your email address and password (handled securely by our
          authentication provider, Supabase). Groomer accounts also include a business name, phone number, email,
          address, and hours.
        </p>

        <h3>Pet information</h3>
        <p>
          To book a grooming appointment, Customers provide information about their pet: name, species, breed,
          color, weight, and an optional photo. Customers may also upload documents such as vaccination records
          (e.g. proof of rabies vaccination), which may include an expiration date.
        </p>

        <h3>Booking and payment information</h3>
        <p>
          We collect booking details (service selected, date/time, cancellation reason if applicable) and payment
          information necessary to process a charge. Card details are handled directly by our payment processor,
          Stripe &mdash; PawBooker does not store your full card number. We do store limited, non-sensitive payment
          method details (card brand, last 4 digits) to let you manage saved payment methods in the app.
        </p>

        <h3>Location</h3>
        <p>
          With your permission, we use your device&rsquo;s location to show nearby groomers in the Browse tab. You
          can also manually search by address or zip code instead of sharing your device location. Groomer business
          addresses are geocoded (converted to map coordinates) using Mapbox to support search and driving
          directions.
        </p>

        <h3>Messages</h3>
        <p>
          Messages you send between a Customer and a Groomer are stored so both parties can see the conversation
          history. If a Groomer&rsquo;s salon has our AI booking assistant enabled, message content may be sent to
          our AI provider, Anthropic, to generate a response (see &ldquo;Third-Party Service Providers&rdquo;
          below).
        </p>

        <h3>Push notification tokens</h3>
        <p>
          If you allow notifications, we store a device push token (provided by Apple/Expo&rsquo;s push notification
          service) so we can send you booking updates, messages, and payment alerts.
        </p>

        <h3>Reviews</h3>
        <p>
          Ratings and written reviews Customers leave for a Groomer after a completed appointment are stored and
          displayed publicly on that Groomer&rsquo;s profile within the app.
        </p>

        <h2>How We Use Information</h2>
        <ul>
          <li>To create and manage your account</li>
          <li>To process bookings, payments, tips, and payouts to Groomers</li>
          <li>To let Customers and Groomers communicate about a booking</li>
          <li>To show relevant, nearby groomers based on location</li>
          <li>To send booking-related notifications and receipts</li>
          <li>To respond to support requests and investigate reports of abuse or disputes</li>
        </ul>

        <h2>Third-Party Service Providers</h2>
        <p>We share information with the following providers only as needed to operate the App:</p>
        <table>
          <tbody>
            <tr>
              <th>Provider</th>
              <th>Purpose</th>
            </tr>
            <tr>
              <td>Stripe</td>
              <td>Payment processing, saved payment methods, groomer payouts</td>
            </tr>
            <tr>
              <td>Supabase</td>
              <td>Account authentication, database, and file storage</td>
            </tr>
            <tr>
              <td>Resend</td>
              <td>Transactional email (booking confirmations, invoices, receipts)</td>
            </tr>
            <tr>
              <td>Anthropic</td>
              <td>Powers the optional AI booking assistant in chat, for salons that have it enabled</td>
            </tr>
            <tr>
              <td>Mapbox</td>
              <td>Address search and geocoding for location-based search and directions</td>
            </tr>
            <tr>
              <td>Apple / Expo</td>
              <td>Delivering push notifications to your device</td>
            </tr>
          </tbody>
        </table>
        <p>We do not sell your personal information to third parties.</p>

        <h2>Data Retention</h2>
        <p>
          We retain account, booking, and payment records for as long as your account is active and as needed to
          comply with legal, tax, and accounting obligations. You may request deletion of your account and
          associated personal data by contacting us (below), subject to records we&rsquo;re required to retain by
          law (e.g. transaction history for tax purposes).
        </p>

        <h2>Your Choices</h2>
        <ul>
          <li>You can decline location permission and search by address/zip instead.</li>
          <li>You can decline notification permission at any time in your device settings.</li>
          <li>You can remove a saved payment method from your Profile at any time.</li>
          <li>You can request access to, correction of, or deletion of your personal information by contacting us.</li>
        </ul>

        <h2>Children&rsquo;s Privacy</h2>
        <p>
          PawBooker is not directed at children under 13, and we do not knowingly collect personal information from
          children under 13.
        </p>

        <h2>Security</h2>
        <p>
          We use industry-standard measures (including encryption in transit) to protect your information. No
          method of transmission or storage is 100% secure, and we cannot guarantee absolute security.
        </p>

        <h2>Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We&rsquo;ll update the &ldquo;Last updated&rdquo; date above when we do.</p>

        <div className={`card ${styles.contactCard}`}>
          <h2>Contact us</h2>
          <p style={{ marginBottom: 0 }}>
            Questions about this policy or your data? Email <a href="mailto:support@paw-booker.com">support@paw-booker.com</a>.
          </p>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
