'use client';

import { CheckCircle2, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { createConnectDashboardLink, createConnectOnboardingLink } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type ConnectStatus = {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

export default function PayoutsPage() {
  const router = useRouter();
  const { groomerProfile, refreshGroomerProfile } = useAuth();
  const groomerId = groomerProfile?.id;
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [feesThisMonthCents, setFeesThisMonthCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!groomerId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [groomerResult, feesResult] = await Promise.all([
        supabase
          .from('groomers')
          .select('stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
          .eq('id', groomerId as string)
          .single(),
        supabase
          .from('bookings')
          .select('platform_fee_cents')
          .eq('groomer_id', groomerId as string)
          .eq('status', 'completed')
          .gte('invoice_sent_at', monthStart.toISOString()),
      ]);

      if (cancelled) return;
      const data = groomerResult.data;
      setStatus(
        data
          ? {
              accountId: data.stripe_connect_account_id,
              chargesEnabled: data.stripe_connect_charges_enabled,
              payoutsEnabled: data.stripe_connect_payouts_enabled,
            }
          : null
      );
      setFeesThisMonthCents((feesResult.data ?? []).reduce((sum, row) => sum + (row.platform_fee_cents ?? 0), 0));
      setLoading(false);
      await refreshGroomerProfile();
    }

    load();
    return () => {
      cancelled = true;
    };
    // refreshGroomerProfile intentionally omitted - see lib/auth.tsx, it's
    // stable across renders via useCallback with an empty dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groomerId]);

  const isFullySetUp = Boolean(status?.chargesEnabled && status?.payoutsEnabled);
  const isPro = groomerProfile?.plan === 'pro';

  async function handleSetUpPayouts() {
    setWorking(true);
    try {
      const { url } = await createConnectOnboardingLink();
      window.location.href = url;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not start setup.');
    } finally {
      setWorking(false);
    }
  }

  async function handleViewDashboard() {
    setWorking(true);
    try {
      const { url } = await createConnectDashboardLink();
      window.open(url, '_blank');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not open dashboard.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="settings-page width-form">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Payouts</h1>
      <p className="page-subtitle">Connect a bank account so booking payments and tips get deposited directly to you.</p>

      {loading ? (
        <span className="spinner" aria-hidden />
      ) : (
        <>
          <div className={`card ${styles.statusCard} ${isFullySetUp ? styles.statusCardActive : ''}`}>
            {isFullySetUp ? <CheckCircle2 size={22} /> : <Clock size={22} color="var(--muted)" />}
            <div>
              <p className={styles.statusTitle}>
                {isFullySetUp ? 'Payouts active' : status?.accountId ? 'Setup incomplete' : 'Not set up yet'}
              </p>
              <p className={styles.statusSubtitle}>
                {isFullySetUp
                  ? 'Your bookings and tips are deposited to your bank account.'
                  : status?.accountId
                    ? 'Finish a few more steps with Stripe to start receiving payouts.'
                    : "Until this is set up, your booking payments stay on PawBooker's account."}
              </p>
            </div>
          </div>

          <Button
            label={isFullySetUp ? 'View payout details' : status?.accountId ? 'Continue setup' : 'Connect your bank account'}
            onClick={isFullySetUp ? handleViewDashboard : handleSetUpPayouts}
            loading={working}
            style={{ marginTop: 20 }}
          />

          <div className={`card ${styles.feeCard}`}>
            <p className={styles.feeCardLabel}>PawBooker fees this month</p>
            <p className={styles.feeCardAmount}>${(feesThisMonthCents / 100).toFixed(2)}</p>
            {isPro ? (
              <p className={styles.feeCardNote}>You&apos;re on Pro — a flat $35/month with no per-booking acquisition fees.</p>
            ) : (
              <>
                <p className={styles.feeCardNote}>
                  A one-time 5% fee applies to each new customer&apos;s first booking. Pro is a flat $35/month with no acquisition fees.
                </p>
                <button className={styles.feeCardLink} onClick={() => router.push('/dashboard/plan')}>
                  See how Pro compares →
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
