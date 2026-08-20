'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type InsightBookingRow = {
  id: string;
  customerId: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'declined';
  startsAt: string;
  cancelledBy?: 'customer' | 'groomer';
  invoiceTotalCents?: number;
  taxAmountCents?: number;
  tipAmountCents?: number;
  staffId?: string;
  staffName?: string;
  serviceName: string;
};

type ReminderRow = {
  customerId: string;
  sentAt: string;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  const [sentReminders, setSentReminders] = useState<ReminderRow[]>([]);
  const [ratingByBooking, setRatingByBooking] = useState<Map<string, number>>(new Map());
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

      const [bookingsResult, remindersResult, reviewsResult] = await Promise.all([
        supabase
          .from('bookings')
          .select(
            'id, customer_id, status, starts_at, cancelled_by, invoice_total_cents, tax_amount_cents, tip_amount_cents, staff_id, groomer_services(name), salon_staff(name)'
          )
          .eq('groomer_id', groomerProfile!.id),
        supabase
          .from('customer_reminders')
          .select('customer_id, sent_at')
          .eq('groomer_id', groomerProfile!.id)
          .eq('status', 'sent'),
        supabase.from('salon_reviews').select('booking_id, rating').eq('groomer_id', groomerProfile!.id),
      ]);

      if (cancelled) return;

      if (bookingsResult.error) {
        setError(bookingsResult.error.message);
      } else {
        setBookings(
          (bookingsResult.data ?? []).map((row) => ({
            id: row.id,
            customerId: row.customer_id,
            status: row.status,
            startsAt: row.starts_at,
            cancelledBy: row.cancelled_by ?? undefined,
            invoiceTotalCents: row.invoice_total_cents ?? undefined,
            taxAmountCents: row.tax_amount_cents ?? undefined,
            tipAmountCents: row.tip_amount_cents ?? undefined,
            staffId: row.staff_id ?? undefined,
            staffName: (row.salon_staff as unknown as { name: string } | null)?.name ?? undefined,
            serviceName: (row.groomer_services as unknown as { name: string })?.name ?? 'Service',
          }))
        );
      }

      if (remindersResult.data) {
        setSentReminders(
          remindersResult.data
            .filter((r) => r.sent_at)
            .map((r) => ({ customerId: r.customer_id, sentAt: r.sent_at as string }))
        );
      }

      if (reviewsResult.data) {
        setRatingByBooking(new Map(reviewsResult.data.map((r) => [r.booking_id, r.rating])));
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

    // A customer's earliest completed booking with this salon marks them "new"
    // for that visit; every later one is "returning" - lets the revenue chart
    // show acquisition vs. retention instead of just a single total.
    const firstBookingByCustomer = new Map<string, string>();
    for (const b of completed) {
      const existing = firstBookingByCustomer.get(b.customerId);
      if (!existing || b.startsAt < existing) firstBookingByCustomer.set(b.customerId, b.startsAt);
    }

    const now = new Date();
    const monthBuckets: { key: string; revenueCents: number; newRevenueCents: number; returningRevenueCents: number }[] =
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { key: monthKey(d), revenueCents: 0, newRevenueCents: 0, returningRevenueCents: 0 };
      });
    const bucketIndex = new Map(monthBuckets.map((b, i) => [b.key, i]));
    for (const b of completed) {
      const key = monthKey(new Date(b.startsAt));
      const index = bucketIndex.get(key);
      if (index != null) {
        const revenue = revenueOf(b);
        monthBuckets[index].revenueCents += revenue;
        if (firstBookingByCustomer.get(b.customerId) === b.startsAt) {
          monthBuckets[index].newRevenueCents += revenue;
        } else {
          monthBuckets[index].returningRevenueCents += revenue;
        }
      }
    }
    const maxMonthRevenue = Math.max(1, ...monthBuckets.map((b) => b.revenueCents));

    // Tips are a separate off-session charge (not part of invoiceTotalCents),
    // so "tip rate" is measured against completed, invoiced visits only.
    const tippable = completed.filter((b) => (b.invoiceTotalCents ?? 0) > 0);
    const tipped = tippable.filter((b) => (b.tipAmountCents ?? 0) > 0);
    const tipRate = tippable.length > 0 ? tipped.length / tippable.length : 0;
    const totalTipCents = tipped.reduce((sum, b) => sum + (b.tipAmountCents ?? 0), 0);
    const avgTipCents = tipped.length > 0 ? totalTipCents / tipped.length : 0;
    const avgTipPercent =
      tipped.length > 0
        ? tipped.reduce((sum, b) => {
            const subtotal = revenueOf(b);
            return sum + (subtotal > 0 ? (b.tipAmountCents ?? 0) / subtotal : 0);
          }, 0) / tipped.length
        : 0;

    // Win-back effectiveness: of the reminders actually sent, how many of
    // those customers booked again afterward (a real confirmed/completed
    // visit, not just a pending request that never came through).
    const winBackSentCount = sentReminders.length;
    const winBackRebookedCount = sentReminders.filter((reminder) =>
      bookings.some(
        (b) =>
          b.customerId === reminder.customerId &&
          b.startsAt > reminder.sentAt &&
          (b.status === 'confirmed' || b.status === 'completed')
      )
    ).length;
    const winBackRate = winBackSentCount > 0 ? winBackRebookedCount / winBackSentCount : 0;

    // Busiest day of week, from completed visits (what actually happened),
    // not raw booking requests.
    const dayOfWeekCounts = Array.from({ length: 7 }, () => 0);
    for (const b of completed) {
      dayOfWeekCounts[new Date(b.startsAt).getDay()] += 1;
    }
    const maxDayCount = Math.max(1, ...dayOfWeekCounts);

    // Per-staff performance - only meaningful once a salon has more than one
    // active groomer; bookings left as "any available" (staffId undefined)
    // aren't attributed to anyone.
    const staffMap = new Map<string, { name: string; count: number; revenueCents: number; ratingSum: number; ratingCount: number }>();
    for (const b of completed) {
      if (!b.staffId) continue;
      const entry = staffMap.get(b.staffId) ?? {
        name: b.staffName ?? 'Groomer',
        count: 0,
        revenueCents: 0,
        ratingSum: 0,
        ratingCount: 0,
      };
      entry.count += 1;
      entry.revenueCents += revenueOf(b);
      const rating = ratingByBooking.get(b.id);
      if (rating != null) {
        entry.ratingSum += rating;
        entry.ratingCount += 1;
      }
      staffMap.set(b.staffId, entry);
    }
    const staffPerformance = [...staffMap.values()]
      .map((s) => ({
        name: s.name,
        count: s.count,
        revenueCents: s.revenueCents,
        avgRating: s.ratingCount > 0 ? s.ratingSum / s.ratingCount : null,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents);

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
      tipRate,
      tippedCount: tipped.length,
      tippableCount: tippable.length,
      avgTipCents,
      avgTipPercent,
      winBackSentCount,
      winBackRebookedCount,
      winBackRate,
      dayOfWeekCounts,
      maxDayCount,
      staffPerformance,
    };
  }, [bookings, sentReminders, ratingByBooking]);

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
          <div className={styles.sectionTitleRow}>
            <p className={styles.sectionTitle}>Revenue, last 6 months</p>
            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <span className={styles.legendSwatch} style={{ background: 'var(--sage)' }} />
                <span className={styles.legendText}>Returning</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendSwatch} style={{ background: 'var(--clay)' }} />
                <span className={styles.legendText}>New</span>
              </div>
            </div>
          </div>
          <div className={`card ${styles.chart}`}>
            {metrics.monthBuckets.map((bucket) => (
              <div key={bucket.key} className={styles.chartCol} title={formatMoney(bucket.revenueCents)}>
                <span className={styles.chartValue}>{formatMoney(bucket.revenueCents)}</span>
                <div className={styles.chartBarTrack}>
                  <div className={styles.chartBarStack}>
                    {bucket.newRevenueCents > 0 && (
                      <div
                        className={styles.chartBarSegment}
                        style={{
                          height: `${(bucket.newRevenueCents / metrics.maxMonthRevenue) * 100}%`,
                          background: 'var(--clay)',
                        }}
                      />
                    )}
                    {bucket.returningRevenueCents > 0 && bucket.newRevenueCents > 0 && <div className={styles.chartBarGap} />}
                    {bucket.returningRevenueCents > 0 && (
                      <div
                        className={styles.chartBarSegment}
                        style={{
                          height: `${(bucket.returningRevenueCents / metrics.maxMonthRevenue) * 100}%`,
                          background: 'var(--sage)',
                        }}
                      />
                    )}
                  </div>
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
            <div className={`card ${styles.statCard}`}>
              <p className={styles.statValue}>{(metrics.tipRate * 100).toFixed(0)}%</p>
              <p className={styles.statLabel}>Tip rate</p>
              <p className={styles.statSub}>
                {metrics.tippedCount} of {metrics.tippableCount} visits tipped
              </p>
            </div>
            <div className={`card ${styles.statCard}`}>
              <p className={styles.statValue}>{formatMoney(metrics.avgTipCents)}</p>
              <p className={styles.statLabel}>Average tip</p>
              <p className={styles.statSub}>{(metrics.avgTipPercent * 100).toFixed(0)}% of ticket, on average</p>
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

          <p className={`${styles.sectionTitle} ${styles.sectionSpacing}`}>Busiest day of the week</p>
          <div className={`card ${styles.dayChart}`}>
            {metrics.dayOfWeekCounts.map((count, index) => (
              <div key={DAY_LABELS[index]} className={styles.chartCol} title={String(count)}>
                <span className={styles.chartValue}>{count}</span>
                <div className={styles.chartBarTrack}>
                  <div
                    className={styles.chartBarSegment}
                    style={{ height: `${(count / metrics.maxDayCount) * 100}%`, background: 'var(--sage)' }}
                  />
                </div>
                <span className={styles.chartLabel}>{DAY_LABELS[index]}</span>
              </div>
            ))}
          </div>

          {metrics.winBackSentCount > 0 && (
            <>
              <p className={`${styles.sectionTitle} ${styles.sectionSpacing}`}>Win-back reminders</p>
              <div className={styles.statsGrid}>
                <div className={`card ${styles.statCard}`}>
                  <p className={styles.statValue}>{(metrics.winBackRate * 100).toFixed(0)}%</p>
                  <p className={styles.statLabel}>Rebooked after a reminder</p>
                  <p className={styles.statSub}>
                    {metrics.winBackRebookedCount} of {metrics.winBackSentCount} sent
                  </p>
                </div>
              </div>
            </>
          )}

          {metrics.staffPerformance.length > 0 && (
            <>
              <p className={`${styles.sectionTitle} ${styles.sectionSpacing}`}>Staff performance</p>
              {metrics.staffPerformance.map((staff) => (
                <div key={staff.name} className={styles.serviceRow}>
                  <div>
                    <p className={styles.serviceName}>{staff.name}</p>
                    <p className={styles.serviceMeta}>
                      {staff.count} completed{staff.avgRating != null ? ` · ★ ${staff.avgRating.toFixed(1)}` : ''}
                    </p>
                  </div>
                  <span className={styles.serviceRevenue}>{formatMoney(staff.revenueCents)}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
