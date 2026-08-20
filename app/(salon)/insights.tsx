import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

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

export default function InsightsScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [bookings, setBookings] = useState<InsightBookingRow[]>([]);
  const [sentReminders, setSentReminders] = useState<ReminderRow[]>([]);
  const [ratingByBooking, setRatingByBooking] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (groomerProfile && groomerProfile.plan !== 'pro') {
      router.replace('/(salon)/plan');
    }
  }, [groomerProfile, router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!groomerProfile) return;
      setLoading(true);

      const [bookingsResult, remindersResult, reviewsResult] = await Promise.all([
        supabase
          .from('bookings')
          .select(
            'id, customer_id, status, starts_at, cancelled_by, invoice_total_cents, tax_amount_cents, tip_amount_cents, staff_id, groomer_services(name), salon_staff(name)'
          )
          .eq('groomer_id', groomerProfile.id),
        supabase
          .from('customer_reminders')
          .select('customer_id, sent_at')
          .eq('groomer_id', groomerProfile.id)
          .eq('status', 'sent'),
        supabase.from('salon_reviews').select('booking_id, rating').eq('groomer_id', groomerProfile.id),
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
    const revenueOf = (b: InsightBookingRow) =>
      (b.invoiceTotalCents ?? 0) - (b.taxAmountCents ?? 0);

    const totalRevenueCents = completed.reduce((sum, b) => sum + revenueOf(b), 0);
    const avgTicketCents = completed.length > 0 ? totalRevenueCents / completed.length : 0;

    const completedByCustomer = new Map<string, number>();
    for (const b of completed) {
      completedByCustomer.set(b.customerId, (completedByCustomer.get(b.customerId) ?? 0) + 1);
    }
    const distinctCompletedCustomers = completedByCustomer.size;
    const repeatCustomers = [...completedByCustomer.values()].filter((count) => count >= 2).length;
    const repeatRate = distinctCompletedCustomers > 0 ? repeatCustomers / distinctCompletedCustomers : 0;
    const revenuePerCustomerCents =
      distinctCompletedCustomers > 0 ? totalRevenueCents / distinctCompletedCustomers : 0;

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
    const serviceMix = [...serviceMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenueCents - a.revenueCents);

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
    <SafeAreaView style={[styles.container, webContentWidth('content')]} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>
      <Text style={styles.title}>Insights</Text>
      <Text style={styles.subtitle}>How your business is doing, at a glance.</Text>

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}
      {error && <Text style={styles.error}>Couldn&apos;t load insights: {error}</Text>}

      {!loading && !error && (
        <ScrollView style={webFlushScroll} contentContainerStyle={[styles.content, webContentWidth('content')]} showsVerticalScrollIndicator={false}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Revenue, last 6 months</Text>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: Colors.light.tint }]} />
                <Text style={styles.legendText}>Returning</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: Colors.light.secondary }]} />
                <Text style={styles.legendText}>New</Text>
              </View>
            </View>
          </View>
          <View style={styles.chart}>
            {metrics.monthBuckets.map((bucket) => {
              const returningHeight = (bucket.returningRevenueCents / metrics.maxMonthRevenue) * 100;
              const newHeight = (bucket.newRevenueCents / metrics.maxMonthRevenue) * 100;
              return (
                <View key={bucket.key} style={styles.chartCol}>
                  <Text style={styles.chartValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {formatMoney(bucket.revenueCents)}
                  </Text>
                  <View style={styles.chartBarTrack}>
                    <View style={styles.chartBarStack}>
                      {bucket.newRevenueCents > 0 && (
                        <View style={[styles.chartBarSegment, { height: `${newHeight}%`, backgroundColor: Colors.light.secondary }]} />
                      )}
                      {bucket.returningRevenueCents > 0 && bucket.newRevenueCents > 0 && (
                        <View style={styles.chartBarGap} />
                      )}
                      {bucket.returningRevenueCents > 0 && (
                        <View style={[styles.chartBarSegment, { height: `${returningHeight}%`, backgroundColor: Colors.light.tint }]} />
                      )}
                    </View>
                  </View>
                  <Text style={styles.chartLabel}>{monthLabel(bucket.key)}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{(metrics.repeatRate * 100).toFixed(0)}%</Text>
              <Text style={styles.statLabel}>Repeat customer rate</Text>
              <Text style={styles.statSub}>
                {metrics.repeatCustomers} of {metrics.distinctCompletedCustomers} customers rebooked
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{(metrics.cancellationRate * 100).toFixed(0)}%</Text>
              <Text style={styles.statLabel}>Cancellation rate</Text>
              <Text style={styles.statSub}>
                {metrics.cancelledByCustomer} by customer · {metrics.cancelledByGroomer} by you
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatMoney(metrics.avgTicketCents)}</Text>
              <Text style={styles.statLabel}>Average ticket</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatMoney(metrics.revenuePerCustomerCents)}</Text>
              <Text style={styles.statLabel}>Revenue per customer</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{(metrics.tipRate * 100).toFixed(0)}%</Text>
              <Text style={styles.statLabel}>Tip rate</Text>
              <Text style={styles.statSub}>
                {metrics.tippedCount} of {metrics.tippableCount} visits tipped
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatMoney(metrics.avgTipCents)}</Text>
              <Text style={styles.statLabel}>Average tip</Text>
              <Text style={styles.statSub}>{(metrics.avgTipPercent * 100).toFixed(0)}% of ticket, on average</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Services</Text>
          {metrics.serviceMix.length === 0 && (
            <Text style={styles.emptyText}>No completed appointments yet.</Text>
          )}
          {metrics.serviceMix.map((service) => (
            <View key={service.name} style={styles.serviceRow}>
              <View>
                <Text style={styles.serviceName}>{service.name}</Text>
                <Text style={styles.serviceMeta}>{service.count} completed</Text>
              </View>
              <Text style={styles.serviceRevenue}>{formatMoney(service.revenueCents)}</Text>
            </View>
          ))}

          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Busiest day of the week</Text>
          <View style={styles.dayChart}>
            {metrics.dayOfWeekCounts.map((count, index) => (
              <View key={DAY_LABELS[index]} style={styles.chartCol}>
                <Text style={styles.chartValue} numberOfLines={1}>
                  {count}
                </Text>
                <View style={styles.chartBarTrack}>
                  <View
                    style={[
                      styles.chartBarSegment,
                      { height: `${(count / metrics.maxDayCount) * 100}%`, backgroundColor: Colors.light.tint },
                    ]}
                  />
                </View>
                <Text style={styles.chartLabel}>{DAY_LABELS[index]}</Text>
              </View>
            ))}
          </View>

          {metrics.winBackSentCount > 0 && (
            <>
              <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Win-back reminders</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{(metrics.winBackRate * 100).toFixed(0)}%</Text>
                  <Text style={styles.statLabel}>Rebooked after a reminder</Text>
                  <Text style={styles.statSub}>
                    {metrics.winBackRebookedCount} of {metrics.winBackSentCount} sent
                  </Text>
                </View>
              </View>
            </>
          )}

          {metrics.staffPerformance.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Staff performance</Text>
              {metrics.staffPerformance.map((staff) => (
                <View key={staff.name} style={styles.serviceRow}>
                  <View>
                    <Text style={styles.serviceName}>{staff.name}</Text>
                    <Text style={styles.serviceMeta}>
                      {staff.count} completed{staff.avgRating != null ? ` · ★ ${staff.avgRating.toFixed(1)}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.serviceRevenue}>{formatMoney(staff.revenueCents)}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: 20,
  },
  topRow: {
    flexDirection: 'row',
  },
  backLink: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  title: {
    marginTop: 12,
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  loading: {
    marginTop: 40,
  },
  error: {
    marginTop: 24,
    fontSize: 15,
    color: Colors.light.danger,
  },
  content: {
    paddingTop: 24,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 12,
  },
  sectionSpacing: {
    marginTop: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legend: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.textMuted,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 168,
    marginBottom: 28,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  dayChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    marginBottom: 28,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  chartCol: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartValue: {
    marginBottom: 6,
    fontSize: 10.5,
    fontWeight: '700',
    color: Colors.light.textMuted,
  },
  chartBarTrack: {
    width: 18,
    flex: 1,
    justifyContent: 'flex-end',
  },
  chartBarStack: {
    width: '100%',
  },
  chartBarSegment: {
    width: '100%',
    borderRadius: 4,
    minHeight: 3,
  },
  chartBarGap: {
    height: 2,
  },
  chartLabel: {
    marginTop: 6,
    fontSize: 11,
    color: Colors.light.textMuted,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.light.text,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  statSub: {
    marginTop: 6,
    fontSize: 11,
    color: Colors.light.textMuted,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  serviceMeta: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  serviceRevenue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
});
