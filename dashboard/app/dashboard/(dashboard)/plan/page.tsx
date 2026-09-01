'use client';

import { CheckCircle2, Circle, Info } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { cancelSubscription } from '@/lib/stripe';

import styles from './page.module.css';

const PRO_FEATURES = [
  'Insights dashboard (revenue, repeat rate, cancellations, service mix)',
  'AI chat assistant for your customers, with escalation when it needs you',
  'Business Assistant - ask about customers, revenue, and supplies',
  'Win-back reminders for lapsed customers',
  'Priority support',
];

export default function PlanPage() {
  const router = useRouter();
  const upgraded = useSearchParams().get('upgraded');
  const { groomerProfile, refreshGroomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [confirmingUpgrade, setConfirmingUpgrade] = useState(false);
  const groomerProfileRef = useRef(groomerProfile);

  useEffect(() => {
    groomerProfileRef.current = groomerProfile;
  }, [groomerProfile]);

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('groomers')
        .select('stripe_cancel_at_period_end, plan_current_period_end, stripe_subscription_id')
        .eq('id', groomerProfile!.id)
        .single();
      if (cancelled) return;
      setCancelAtPeriodEnd(Boolean(data?.stripe_cancel_at_period_end));
      setPeriodEnd(data?.plan_current_period_end ?? null);
      setHasSubscription(Boolean(data?.stripe_subscription_id));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  // Right after returning from a successful checkout, the plan isn't
  // necessarily "pro" yet - Stripe's webhook updates it asynchronously and
  // can lag a couple seconds behind the redirect. Poll briefly instead of
  // checking once, so the page doesn't flash "Free" right after payment.
  useEffect(() => {
    if (!upgraded) return;

    setConfirmingUpgrade(true);
    refreshGroomerProfile();

    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (groomerProfileRef.current?.plan === 'pro' || attempts >= 5) {
        clearInterval(interval);
        setConfirmingUpgrade(false);
        return;
      }
      refreshGroomerProfile();
    }, 2000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upgraded]);

  async function handleCancel() {
    setWorking(true);
    try {
      const result = await cancelSubscription();
      await refreshGroomerProfile();
      setCancelAtPeriodEnd(true);
      setPeriodEnd(result.currentPeriodEnd);
      const when = result.currentPeriodEnd
        ? new Date(result.currentPeriodEnd).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
        : 'the end of your billing period';
      window.alert(`Subscription set to cancel. You'll keep Pro access until ${when}.`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not cancel.');
    } finally {
      setWorking(false);
    }
  }

  const isPro = groomerProfile?.plan === 'pro';
  const periodEndLabel = periodEnd ? new Date(periodEnd).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : null;

  return (
    <div className="settings-page width-form">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title" style={{ marginBottom: 20 }}>
        Plan
      </h1>

      <div className={`card ${styles.planCard} ${isPro ? styles.planCardActive : ''}`}>
        <p className={styles.planName}>{isPro ? 'Pro' : 'Free'}</p>
        <p className={styles.planPrice}>{isPro ? '$35/month' : '$0'}</p>
      </div>

      <p className={styles.sectionTitle}>Pro includes</p>
      {PRO_FEATURES.map((feature) => (
        <div key={feature} className={styles.featureRow}>
          <CheckCircle2 size={18} color={isPro ? 'var(--sage)' : 'var(--muted)'} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{feature}</span>
        </div>
      ))}

      {loading ? (
        <span className="spinner" aria-hidden style={{ marginTop: 20 }} />
      ) : confirmingUpgrade && !isPro ? (
        <div className={`card ${styles.notice}`}>
          <span className="spinner" aria-hidden />
          <p>Confirming your upgrade — this only takes a moment...</p>
        </div>
      ) : isPro && cancelAtPeriodEnd ? (
        <div className={`card ${styles.notice}`}>
          <Info size={18} color="var(--muted)" />
          <p>
            Your subscription is set to cancel{periodEndLabel ? ` on ${periodEndLabel}` : ''}. You&apos;ll keep Pro access until then.
          </p>
        </div>
      ) : isPro && hasSubscription ? (
        <Button label="Cancel subscription" variant="danger" onClick={handleCancel} loading={working} style={{ marginTop: 20 }} />
      ) : isPro ? (
        <div className={`card ${styles.notice}`}>
          <Circle size={18} color="var(--muted)" />
          <p>You&apos;re on a complimentary Pro plan — no billing and nothing to cancel.</p>
        </div>
      ) : (
        <div className={`card ${styles.notice}`}>
          <p>Upgrading to Pro is done on the PawBooker website, not in the app. Visit paw-booker.com/upgrade from a browser to subscribe.</p>
        </div>
      )}
    </div>
  );
}
