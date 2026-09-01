'use client';

import { Briefcase, Calendar, Check, ChevronRight, Clock, CreditCard, PawPrint, Scissors, ShieldCheck, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type StepState = {
  hasServices: boolean;
  hasHours: boolean;
  hasSupplies: boolean;
  hasStaff: boolean;
};

type Step = {
  key: string;
  title: string;
  subtitle: string;
  done: boolean;
  required: boolean;
  route: string;
  icon: typeof Briefcase;
};

export default function WelcomePage() {
  const router = useRouter();
  const { groomerProfile, refreshGroomerProfile } = useAuth();
  const [state, setState] = useState<StepState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      await refreshGroomerProfile();

      const [servicesResult, suppliesResult, staffResult, groomerResult] = await Promise.all([
        supabase.from('groomer_services').select('id', { count: 'exact', head: true }).eq('groomer_id', groomerProfile!.id),
        supabase.from('groomer_supplies').select('id', { count: 'exact', head: true }).eq('groomer_id', groomerProfile!.id),
        supabase.from('salon_staff').select('id', { count: 'exact', head: true }).eq('salon_id', groomerProfile!.id).eq('active', true),
        supabase.from('groomers').select('hours').eq('id', groomerProfile!.id).single(),
      ]);

      if (cancelled) return;
      const hours = groomerResult.data?.hours as Record<string, unknown> | null;
      const hasHours = Boolean(hours && Object.values(hours).some((day) => day != null));

      setState({
        hasServices: (servicesResult.count ?? 0) > 0,
        hasSupplies: (suppliesResult.count ?? 0) > 0,
        hasStaff: (staffResult.count ?? 0) > 0,
        hasHours,
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groomerProfile?.id]);

  const payoutsEnabled = Boolean(groomerProfile?.payoutsEnabled);

  const steps: Step[] = [
    { key: 'business', title: 'Create your business', subtitle: 'Name and address added', done: true, required: true, route: '/dashboard/business-info', icon: Briefcase },
    { key: 'services', title: 'Add your services', subtitle: 'What you offer, with prices and durations', done: Boolean(state?.hasServices), required: true, route: '/dashboard/services', icon: Scissors },
    { key: 'hours', title: 'Set your hours', subtitle: 'When customers can book you', done: Boolean(state?.hasHours), required: true, route: '/dashboard/hours', icon: Calendar },
    { key: 'payouts', title: 'Connect payouts', subtitle: 'Get paid for bookings via Stripe', done: payoutsEnabled, required: true, route: '/dashboard/payouts', icon: CreditCard },
    { key: 'staff', title: 'Add your groomers', subtitle: "Let customers book a specific groomer (skip if it's just you)", done: Boolean(state?.hasStaff), required: false, route: '/dashboard/staff', icon: Users },
    { key: 'supplies', title: 'Add your supplies', subtitle: 'Track inventory and get low-stock reminders', done: Boolean(state?.hasSupplies), required: false, route: '/dashboard/supplies', icon: PawPrint },
    { key: 'vaccination', title: 'Vaccination requirement', subtitle: 'Require a current rabies vaccination on file to book (on by default)', done: true, required: false, route: '/dashboard/vaccination', icon: ShieldCheck },
  ];
  const requiredSteps = steps.filter((s) => s.required);
  const optionalSteps = steps.filter((s) => !s.required);

  const requiredDone = steps.filter((s) => s.required && s.done).length;
  const requiredTotal = steps.filter((s) => s.required).length;
  const isLive = requiredDone === requiredTotal;
  const totalDone = steps.filter((s) => s.done).length;
  const progressPct = steps.length > 0 ? Math.round((totalDone / steps.length) * 100) : 0;

  return (
    <div className="settings-page width-form">
      <h1 className="page-title" style={{ marginTop: 8 }}>
        Welcome to PawBooker
      </h1>
      <p className="page-subtitle">
        Finish these steps so customers can book you and you get paid. You&apos;re listed as soon as you add a service.
      </p>

      {isLive ? (
        <div className={styles.celebrateCard}>
          <span className={styles.confettiDot} style={{ width: 8, height: 8, top: 18, left: 34, background: 'var(--clay)', opacity: 0.55 }} />
          <span className={styles.confettiDot} style={{ width: 5, height: 5, top: 44, left: 64, background: 'var(--sage)', opacity: 0.5 }} />
          <span className={styles.confettiDot} style={{ width: 6, height: 6, top: 24, right: 48, background: 'var(--sage)', opacity: 0.45 }} />
          <span className={styles.confettiDot} style={{ width: 9, height: 9, top: 52, right: 30, background: 'var(--clay)', opacity: 0.4 }} />
          <span className={styles.confettiDot} style={{ width: 5, height: 5, bottom: 20, left: 70, background: 'var(--clay)', opacity: 0.4 }} />
          <span className={styles.confettiDot} style={{ width: 6, height: 6, bottom: 24, right: 66, background: 'var(--sage)', opacity: 0.5 }} />
          <div className={styles.seal}>
            <PawPrint size={30} strokeWidth={0} fill="#fff" />
          </div>
          <p className={styles.celebrateTitle}>You&rsquo;re live!</p>
          <p className={styles.celebrateText}>Customers can find and book you now. Nice work.</p>
        </div>
      ) : (
        <div className={`${styles.statusBanner} ${styles.statusPending}`}>
          <div className={styles.statusHeaderRow}>
            <Clock size={20} color="var(--warning)" />
            <p className={styles.statusText}>{`${requiredDone} of ${requiredTotal} required steps done`}</p>
          </div>
          <div className={styles.progressTrack}>
            <div className={`${styles.progressFill} ${styles.progressFillPending}`} style={{ width: `${progressPct}%` }} />
          </div>
          <p className={styles.progressCaption}>
            {totalDone} of {steps.length} steps completed
          </p>
        </div>
      )}

      {loading && !state ? (
        <span className="spinner" aria-hidden />
      ) : (
        <>
          <p className={styles.sectionLabel}>Required to go live</p>
          {requiredSteps.map((step) => {
            const Icon = step.icon;
            return (
              <button key={step.key} className={styles.stepRow} onClick={() => router.push(step.route)}>
                <div className={`${styles.iconBadge} ${step.done ? styles.iconBadgeDone : styles.iconBadgePending}`}>
                  <Icon size={19} strokeWidth={1.8} />
                  {step.done && (
                    <span className={styles.badgeCheck}>
                      <Check size={9} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className={styles.stepBody}>
                  <div className={styles.stepTitleRow}>
                    <span className={styles.stepTitle}>{step.title}</span>
                  </div>
                  <p className={styles.stepSubtitle}>{step.subtitle}</p>
                </div>
                <ChevronRight size={18} color="var(--muted-2)" />
              </button>
            );
          })}

          <p className={styles.sectionLabel}>Optional</p>
          {optionalSteps.map((step) => {
            const Icon = step.icon;
            return (
              <button key={step.key} className={styles.stepRow} onClick={() => router.push(step.route)}>
                <div className={`${styles.iconBadge} ${step.done ? styles.iconBadgeDone : styles.iconBadgePending}`}>
                  <Icon size={19} strokeWidth={1.8} />
                  {step.done && (
                    <span className={styles.badgeCheck}>
                      <Check size={9} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className={styles.stepBody}>
                  <div className={styles.stepTitleRow}>
                    <span className={styles.stepTitle}>{step.title}</span>
                    <span className={styles.optionalTag}>OPTIONAL</span>
                  </div>
                  <p className={styles.stepSubtitle}>{step.subtitle}</p>
                </div>
                <ChevronRight size={18} color="var(--muted-2)" />
              </button>
            );
          })}
        </>
      )}

      <Button label="Go to dashboard" variant="primary" onClick={() => router.replace('/dashboard')} style={{ marginTop: 12 }} />
    </div>
  );
}
