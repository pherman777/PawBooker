import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';

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

export default function InsightsScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [bookings, setBookings] = useState<InsightBookingRow[]>([]);
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

      const { data, error: queryError } = await supabase
        .from('bookings')
        .select(
          'customer_id, status, starts_at, cancelled_by, invoice_total_cents, tax_amount_cents, groomer_services(name)'
        )
        .eq('groomer_id', groomerProfile.id);

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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Revenue, last 6 months</Text>
          <View style={styles.chart}>
            {metrics.monthBuckets.map((bucket) => (
              <View key={bucket.key} style={styles.chartCol}>
                <View style={styles.chartBarTrack}>
                  <View
                    style={[
                      styles.chartBarFill,
                      { height: `${(bucket.revenueCents / metrics.maxMonthRevenue) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.chartLabel}>{monthLabel(bucket.key)}</Text>
              </View>
            ))}
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
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    marginBottom: 28,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    padding: 16,
  },
  chartCol: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartBarTrack: {
    width: 18,
    flex: 1,
    justifyContent: 'flex-end',
  },
  chartBarFill: {
    width: '100%',
    backgroundColor: Colors.light.tint,
    borderRadius: 4,
    minHeight: 3,
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
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
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
