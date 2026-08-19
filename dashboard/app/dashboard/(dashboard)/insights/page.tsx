'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type InsightBookingRow = {
  customerId: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  startsAt: string;
  cancelledBy?: 'customer' | 'groomer';
  invoiceTotalCents?: number;
  taxAmountCents?: number;
  serviceName: string;
};

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short' });
}

export default function InsightsPage() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [bookings, setBookings] = useState<InsightBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ported from the RN screen - it also self-checks the plan even though the
  // dashboard Nav's menu already keeps non-Pro groomers from reaching this
  // route, so this is a belt-and-suspenders redirect, not new gating.
  useEffect(() => {
    if (groomerProfile && groomerProfile.plan !== 'pro') {
      router.replace('/dashboard/plan');
    }
  }, [groomerProfile, router]);

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data, error: queryError } = await supabase
        .from('bookings')
        .select(
          'customer_id, status, starts_at, cancelled_by, invoice_total_cents, tax_amount_cents, groomer_services(name)'
        )
        .eq('groomer_id', groomerProfile!.id);

      if (cancelled) return;

      if (queryError) {
        setError(queryError.message);
      } else {
        setBookings(
          (data ?? []).map((row) => ({
            customerId: row.customer_id,
            status: row.status,
            startsAt: row.starts_at,
            cancelledBy: row.cancelled_by ?? undefined,
            invoiceTotalCents: row.invoice_total_cents ?? undefined,
            taxAmountCents: row.tax_amount_cents ?? undefined,
            serviceName: (row.groomer_services as unknown as { name: string })?.name ?? 'Service',
          }))
        );
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  const metrics = useMemo(() => {
    const completed = bookings.filter((b) => b.status === 'completed');
    const revenueOf = (b: InsightBookingRow) => (b.invoiceTotalCents ?? 0) - (b.taxAmountCents ?? 0);

    const totalRevenueCents = completed.reduce((sum, b) => sum + revenueOf(b), 0);
    const avgTicketCents = completed.length > 0 ? totalRevenueCents / completed.length : 0;

    const completedByCustomer = new Map<string, number>();
    for (const b of completed) {
      completedByCustomer.set(b.customerId, (completedByCustomer.get(b.customerId) ?? 0) + 1);
    }
    const distinctCompletedCustomers = completedByCustomer.size;
    const repeatCustomers = [...completedByCustomer.values()].filter((count) => count >= 2).length;
    const repeatRate = distinctCompletedCustomers > 0 ? repeatCustomers / distinctCompletedCustomers : 0;
    const revenuePerCustomerCents = distinctCompletedCustomers > 0 ? totalRevenueCents / distinctCompletedCustomers : 0;

    const cancelled = bookings.filter((b) => b.status === 'cancelled');
    const cancellationRate = bookings.length > 0 ? cancelled.length / bookings.length : 0;
    const cancelledByCustomer = cancelled.filter((b) => b.cancelledBy === 'customer').length;
    const cancelledByGroomer = cancelled.filter((b) => b.cancelledBy === 'groomer').length;

    const serviceMap = new Map<string, { count: number; revenueCents: number }>();
    for (const b of completed) {
      const entry = serviceMap.get(b.serviceName) ?? { count: 0, revenueCents: 0 };
      entry.count += 1;
      entry.revenueCents += revenueOf(b);
      serviceMap.set(b.serviceName, entry);
    }
    const serviceMix = [...serviceMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenueCents - a.revenueCents);

    const now = new Date();
    const monthBuckets: { key: string; revenueCents: number }[] = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: monthKey(d), revenueCents: 0 };
    });
    const bucketIndex = new Map(monthBuckets.map((b, i) => [b.key, i]));
    for (const b of completed) {
      const key = monthKey(new Date(b.startsAt));
      const index = bucketIndex.get(key);
      if (index != null) {
        monthBuckets[index].revenueCents += revenueOf(b);
      }
    }
    const maxMonthRevenue = Math.max(1, ...monthBuckets.map((b) => b.revenueCents));

    return {
      totalRevenueCents,
      avgTicketCents,
      repeatRate,
      repeatCustomers,
      distinctCompletedCustomers,
      revenuePerCustomerCents,
      cancellationRate,
      cancelledTotal: cancelled.length,
      cancelledByCustomer,
      cancelledByGroomer,
      serviceMix,
      monthBuckets,
      maxMonthRevenue,
    };
  }, [bookings]);

  return (
    <div className="settings-page width-content">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Insights</h1>
      <p className="page-subtitle">How your business is doing, at a glance.</p>

      {loading && <span className="spinner" aria-hidden />}
      {error && <p className={styles.error}>Couldn&apos;t load insights: {error}</p>}

      {!loading && !error && (
        <>
          <p className={styles.sectionTitle}>Revenue, last 6 months</p>
          <div className={`card ${styles.chart}`}>
            {metrics.monthBuckets.map((bucket) => (
              <div key={bucket.key} className={styles.chartCol} title={formatMoney(bucket.revenueCents)}>
                <span className={styles.chartValue}>{formatMoney(bucket.revenueCents)}</span>
                <div className={styles.chartBarTrack}>
                  <div
                    className={styles.chartBarFill}
                    style={{ height: `${(bucket.revenueCents / metrics.maxMonthRevenue) * 100}%` }}
                  />
                </div>
                <span className={styles.chartLabel}>{monthLabel(bucket.key)}</span>
              </div>
            ))}
          </div>

          <div className={styles.statsGrid}>
            <div className={`card ${styles.statCard}`}>
              <p className={styles.statValue}>{(metrics.repeatRate * 100).toFixed(0)}%</p>
              <p className={styles.statLabel}>Repeat customer rate</p>
              <p className={styles.statSub}>
                {metrics.repeatCustomers} of {metrics.distinctCompletedCustomers} customers rebooked
              </p>
            </div>
            <div className={`card ${styles.statCard}`}>
              <p className={styles.statValue}>{(metrics.cancellationRate * 100).toFixed(0)}%</p>
              <p className={styles.statLabel}>Cancellation rate</p>
              <p className={styles.statSub}>
                {metrics.cancelledByCustomer} by customer · {metrics.cancelledByGroomer} by you
              </p>
            </div>
            <div className={`card ${styles.statCard}`}>
              <p className={styles.statValue}>{formatMoney(metrics.avgTicketCents)}</p>
              <p className={styles.statLabel}>Average ticket</p>
            </div>
            <div className={`card ${styles.statCard}`}>
              <p className={styles.statValue}>{formatMoney(metrics.revenuePerCustomerCents)}</p>
              <p className={styles.statLabel}>Revenue per customer</p>
            </div>
          </div>

          <p className={styles.sectionTitle}>Services</p>
          {metrics.serviceMix.length === 0 && <p className={styles.emptyText}>No completed appointments yet.</p>}
          {metrics.serviceMix.map((service) => (
            <div key={service.name} className={styles.serviceRow}>
              <div>
                <p className={styles.serviceName}>{service.name}</p>
                <p className={styles.serviceMeta}>{service.count} completed</p>
              </div>
              <span className={styles.serviceRevenue}>{formatMoney(service.revenueCents)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
