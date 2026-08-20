'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

import styles from '../marketing.module.css';

export default function UpgradePage() {
  return (
    <Suspense>
      <UpgradePageContent />
    </Suspense>
  );
}

function UpgradePageContent() {
  const success = useSearchParams().get('success') === '1';
  const [email, setEmail] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    // create-checkout-session is a plain public GET endpoint that responds
    // with a 302 straight to Stripe Checkout (see
    // supabase/functions/create-checkout-session) - a full-page redirect,
    // not a supabase.functions.invoke() call.
    window.location.href = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-checkout-session?email=${encodeURIComponent(trimmed)}`;
  }

  return (
    <>
      <SiteHeader />
      <div className={styles.page} style={{ maxWidth: 480 }}>
        {success ? (
          <div className={styles.successCard}>
            <h2>You&rsquo;re on Pro!</h2>
            <p>Open the PawBooker app and your Pro features will be active within a few seconds.</p>
          </div>
        ) : (
          <>
            <p className="eyebrow">For groomers</p>
            <h1>Upgrade to Pro</h1>
            <p className={styles.pageLede}>$35/month. Includes:</p>
            <ul>
              <li>Insights dashboard (revenue, repeat rate, cancellations, service mix)</li>
              <li>AI chat assistant for your customers, with escalation when it needs you</li>
              <li>Business Assistant &mdash; ask about customers, revenue, and supplies</li>
              <li>Win-back reminders for lapsed customers</li>
              <li>Priority support</li>
            </ul>

            <div className="card">
              <form onSubmit={handleSubmit}>
                <label htmlFor="email">Your PawBooker account email</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
                <button type="submit" className="btn btn-secondary" style={{ width: '100%' }}>
                  Continue to payment
                </button>
              </form>
            </div>
          </>
        )}
      </div>
      <SiteFooter />
    </>
  );
}
