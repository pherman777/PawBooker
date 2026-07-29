import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { BookingCalendar } from '@/components/BookingCalendar';
import { CancelBookingModal } from '@/components/CancelBookingModal';
import { GroomerNotificationBell } from '@/components/GroomerNotificationBell';
import { MessagesIconButton } from '@/components/MessagesIconButton';
import { ReportModal } from '@/components/ReportModal';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { sendBookingEmail } from '@/services/notifications';
import { submitReport } from '@/services/support';
import { supabase } from '@/services/supabase';
import type { BookingStatus, PaymentStatus } from '@/types';
import { addMonths, isSameDay } from '@/utils/calendar';
import { notify, showActionSheet } from '@/utils/confirm';

const REPORT_REASONS = [
  'Failure to pay / payment dispute',
  'Rude or abusive behavior',
  'No-show / repeated cancellations',
  'Unsafe or aggressive pet not disclosed',
  'Other',
];

type SalonBookingRow = {
  id: string;
  customerId: string;
  startsAt: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  serviceCompletedAt?: string;
  serviceName: string;
  petName: string;
  cancellationReason?: string;
  invoiceTotalCents?: number;
};

type ViewMode = 'list' | 'calendar';
type StatFilter = 'pending' | 'upcoming' | 'ready_to_bill' | null;

function matchesStatFilter(booking: SalonBookingRow, filter: StatFilter): boolean {
  if (filter === 'pending') return booking.status === 'pending';
  if (filter === 'upcoming') return booking.status === 'confirmed' && !booking.serviceCompletedAt;
  if (filter === 'ready_to_bill') return booking.status === 'confirmed' && Boolean(booking.serviceCompletedAt);
  return true;
}

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: Colors.light.warning,
  confirmed: Colors.light.success,
  completed: Colors.light.textMuted,
  cancelled: Colors.light.danger,
};

export default function SalonDashboardScreen() {
  const router = useRouter();
  const { bookingId: notifiedBookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const handledNotificationRef = useRef<string | null>(null);
  const { groomerProfile } = useAuth();
  const [bookings, setBookings] = useState<SalonBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [statFilter, setStatFilter] = useState<StatFilter>(null);
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const flatListRef = useRef<FlatList<SalonBookingRow>>(null);

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    const { data, error: queryError } = await supabase
      .from('bookings')
      .select(
        'id, customer_id, starts_at, status, payment_status, service_completed_at, cancellation_reason, invoice_total_cents, pets(name), groomer_services(name)'
      )
      .eq('groomer_id', groomerProfile.id)
      .order('starts_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
    } else {
      setBookings(
        (data ?? []).map((row) => ({
          id: row.id,
          customerId: row.customer_id,
          startsAt: row.starts_at,
          status: row.status,
          paymentStatus: row.payment_status,
          serviceCompletedAt: row.service_completed_at ?? undefined,
          cancellationReason: row.cancellation_reason ?? undefined,
          invoiceTotalCents: row.invoice_total_cents ?? undefined,
          serviceName: (row.groomer_services as unknown as { name: string })?.name ?? 'Service',
          petName: (row.pets as unknown as { name: string })?.name ?? 'Pet',
        }))
      );
    }
    setLoading(false);
  }, [groomerProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const stats = useMemo(() => {
    const pendingCount = bookings.filter((b) => b.status === 'pending').length;
    const upcomingCount = bookings.filter((b) => b.status === 'confirmed' && !b.serviceCompletedAt).length;
    const readyToBillCount = bookings.filter(
      (b) => b.status === 'confirmed' && b.serviceCompletedAt
    ).length;
    const customerCount = new Set(bookings.map((b) => b.customerId)).size;
    return { pendingCount, upcomingCount, readyToBillCount, customerCount };
  }, [bookings]);

  const displayedBookings = useMemo(() => {
    let result = bookings;
    if (viewMode === 'calendar') {
      result = result.filter((b) => isSameDay(new Date(b.startsAt), selectedDay));
    }
    if (statFilter) {
      result = result.filter((b) => matchesStatFilter(b, statFilter));
    }
    return result;
  }, [bookings, viewMode, selectedDay, statFilter]);

  function toggleStatFilter(filter: StatFilter) {
    setStatFilter((current) => (current === filter ? null : filter));
  }

  function handleSelectBookingFromNotification(bookingId: string) {
    setViewMode('list');
    setHighlightedId(bookingId);

    setTimeout(() => {
      const index = bookings.findIndex((b) => b.id === bookingId);
      if (index >= 0) {
        flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
      }
    }, 100);

    setTimeout(() => setHighlightedId(null), 4000);
  }

  useEffect(() => {
    if (!notifiedBookingId || notifiedBookingId === handledNotificationRef.current) return;
    if (bookings.length === 0) return;
    handledNotificationRef.current = notifiedBookingId;
    handleSelectBookingFromNotification(notifiedBookingId);
  }, [notifiedBookingId, bookings]);

  function handleOpenMenu() {
    const isPro = groomerProfile?.plan === 'pro';
    showActionSheet('Menu', [
      {
        label: isPro ? 'Insights' : 'Insights (upgrade to Pro)',
        onPress: () => router.push(isPro ? '/(salon)/insights' : '/(salon)/plan'),
      },
      { label: 'Help & support', onPress: () => router.push('/help') },
      { label: 'Sign out', destructive: true, onPress: () => supabase.auth.signOut() },
    ]);
  }

  async function handleAccept(bookingId: string) {
    setUpdatingId(bookingId);
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', bookingId);
    setUpdatingId(null);

    if (updateError) {
      notify('Update failed', updateError.message);
      return;
    }
    await load();
    sendBookingEmail(bookingId, 'accepted');
  }

  async function handleCompleteService(bookingId: string) {
    setUpdatingId(bookingId);
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ service_completed_at: new Date().toISOString() })
      .eq('id', bookingId);
    setUpdatingId(null);

    if (updateError) {
      notify('Update failed', updateError.message);
      return;
    }
    await load();
    sendBookingEmail(bookingId, 'service_completed');
  }

  async function handleConfirmCancel(reason: string) {
    if (!cancelTargetId) return;
    const bookingId = cancelTargetId;
    setUpdatingId(bookingId);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancellation_reason: reason, cancelled_by: 'groomer' })
      .eq('id', bookingId);

    setUpdatingId(null);
    setCancelTargetId(null);

    if (updateError) {
      notify('Update failed', updateError.message);
      return;
    }
    await load();
    sendBookingEmail(bookingId, 'groomer_cancelled');
  }

  async function handleSubmitReport(reason: string, details: string) {
    if (!reportTargetId) return;

    setSubmittingReport(true);
    try {
      await submitReport(reportTargetId, reason, details || undefined);
      setReportTargetId(null);
      notify('Report submitted', 'Thanks for letting us know — our team will review it.');
    } catch (err) {
      notify('Could not submit report', err instanceof Error ? err.message : 'Something went wrong.');
    }
    setSubmittingReport(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader
        title={groomerProfile?.name ?? ''}
        subtitle="Dashboard"
        stackRight
        right={
          <View style={styles.headerActions}>
            {groomerProfile && <MessagesIconButton groomerId={groomerProfile.id} />}
            {groomerProfile && (
              <GroomerNotificationBell
                groomerId={groomerProfile.id}
                onSelectBooking={handleSelectBookingFromNotification}
              />
            )}
            <Pressable style={styles.iconButton} onPress={handleOpenMenu} hitSlop={8}>
              <Ionicons name="menu-outline" size={22} color={Colors.light.text} />
              {groomerProfile?.plan !== 'pro' && (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={9} color="#fff" />
                </View>
              )}
            </Pressable>
          </View>
        }
      />

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}
      {error && <Text style={styles.error}>Couldn&apos;t load bookings: {error}</Text>}

      {!loading && !error && (
        <FlatList
          ref={flatListRef}
          data={displayedBookings}
          keyExtractor={(item) => item.id}
          style={styles.flatList}
          contentContainerStyle={styles.list}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
            }, 200);
          }}
          ListHeaderComponent={
            <View>
              <Pressable style={styles.planBanner} onPress={() => router.push('/(salon)/plan')}>
                <Ionicons
                  name={groomerProfile?.plan === 'pro' ? 'star' : 'star-outline'}
                  size={16}
                  color={Colors.light.tint}
                />
                <Text style={styles.planBannerText}>
                  {groomerProfile?.plan === 'pro'
                    ? 'On the Pro plan · Manage subscription'
                    : 'Upgrade to Pro for Insights + the AI chat assistant'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.light.textMuted} />
              </Pressable>

              <Pressable style={styles.planBanner} onPress={() => router.push('/(salon)/payouts')}>
                <Ionicons
                  name={groomerProfile?.payoutsEnabled ? 'checkmark-circle' : 'card-outline'}
                  size={16}
                  color={Colors.light.tint}
                />
                <Text style={styles.planBannerText}>
                  {groomerProfile?.payoutsEnabled
                    ? 'Payouts active · View details'
                    : 'Connect your bank account to get paid'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.light.textMuted} />
              </Pressable>

              <View style={styles.statsGrid}>
                <Pressable
                  style={[styles.statCard, statFilter === 'pending' && styles.statCardActive]}
                  onPress={() => toggleStatFilter('pending')}>
                  <Text style={[styles.statValue, statFilter === 'pending' && styles.statValueActive]}>
                    {stats.pendingCount}
                  </Text>
                  <Text style={[styles.statLabel, statFilter === 'pending' && styles.statLabelActive]}>
                    Pending requests
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.statCard, statFilter === 'upcoming' && styles.statCardActive]}
                  onPress={() => toggleStatFilter('upcoming')}>
                  <Text style={[styles.statValue, statFilter === 'upcoming' && styles.statValueActive]}>
                    {stats.upcomingCount}
                  </Text>
                  <Text style={[styles.statLabel, statFilter === 'upcoming' && styles.statLabelActive]}>
                    Upcoming
                  </Text>
                </Pressable>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.customerCount}</Text>
                  <Text style={styles.statLabel}>Customers</Text>
                </View>
                <Pressable
                  style={[styles.statCard, statFilter === 'ready_to_bill' && styles.statCardActive]}
                  onPress={() => toggleStatFilter('ready_to_bill')}>
                  <Text style={[styles.statValue, statFilter === 'ready_to_bill' && styles.statValueActive]}>
                    {stats.readyToBillCount}
                  </Text>
                  <Text style={[styles.statLabel, statFilter === 'ready_to_bill' && styles.statLabelActive]}>
                    Ready to bill
                  </Text>
                </Pressable>
              </View>

              {statFilter && (
                <Pressable style={styles.clearFilter} onPress={() => setStatFilter(null)}>
                  <Text style={styles.clearFilterText}>
                    Showing{' '}
                    {statFilter === 'pending'
                      ? 'pending requests'
                      : statFilter === 'upcoming'
                        ? 'upcoming appointments'
                        : 'appointments ready to bill'}{' '}
                    only · Clear
                  </Text>
                </Pressable>
              )}

              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleButton, viewMode === 'list' && styles.toggleButtonActive]}
                  onPress={() => setViewMode('list')}>
                  <Ionicons
                    name="list"
                    size={15}
                    color={viewMode === 'list' ? '#fff' : Colors.light.textMuted}
                  />
                  <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>
                    Cards
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleButton, viewMode === 'calendar' && styles.toggleButtonActive]}
                  onPress={() => setViewMode('calendar')}>
                  <Ionicons
                    name="calendar-outline"
                    size={15}
                    color={viewMode === 'calendar' ? '#fff' : Colors.light.textMuted}
                  />
                  <Text style={[styles.toggleText, viewMode === 'calendar' && styles.toggleTextActive]}>
                    Calendar
                  </Text>
                </Pressable>
              </View>

              {viewMode === 'calendar' && (
                <>
                  <BookingCalendar
                    month={calendarMonth}
                    selectedDay={selectedDay}
                    bookings={bookings}
                    onChangeMonth={(delta) => setCalendarMonth((m) => addMonths(m, delta))}
                    onSelectDay={setSelectedDay}
                  />
                  <Text style={styles.dayListLabel}>
                    {selectedDay.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Text>
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, item.id === highlightedId && styles.cardHighlighted]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardService}>{item.serviceName}</Text>
                <Text style={[styles.cardStatus, { color: STATUS_COLORS[item.status] }]}>{item.status}</Text>
              </View>
              <Text style={styles.cardMeta}>for {item.petName}</Text>
              <Text style={styles.cardMeta}>
                {new Date(item.startsAt).toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>

              {item.status === 'cancelled' && item.cancellationReason && (
                <Text style={styles.reasonText}>Reason: {item.cancellationReason}</Text>
              )}

              {item.status === 'completed' && item.invoiceTotalCents != null && (
                <Text style={styles.paidText}>Paid ${(item.invoiceTotalCents / 100).toFixed(2)}</Text>
              )}

              {item.paymentStatus === 'failed' && (
                <Text style={styles.reasonText}>Payment failed — retry from Complete &amp; invoice</Text>
              )}

              {(item.status === 'pending' || item.status === 'confirmed') && (
                <View style={styles.actions}>
                  {item.status === 'pending' && (
                    <Pressable
                      style={[styles.actionButton, styles.acceptButton]}
                      onPress={() => handleAccept(item.id)}
                      disabled={updatingId === item.id}>
                      {updatingId === item.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.acceptButtonText}>Accept</Text>
                      )}
                    </Pressable>
                  )}
                  {item.status === 'confirmed' && !item.serviceCompletedAt && (
                    <Pressable
                      style={[styles.actionButton, styles.acceptButton]}
                      onPress={() => handleCompleteService(item.id)}
                      disabled={updatingId === item.id}>
                      {updatingId === item.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.acceptButtonText}>Complete Service</Text>
                      )}
                    </Pressable>
                  )}
                  {item.status === 'confirmed' && item.serviceCompletedAt && (
                    <Pressable
                      style={[styles.actionButton, styles.acceptButton]}
                      onPress={() => router.push({ pathname: '/(salon)/complete/[bookingId]', params: { bookingId: item.id } })}
                      disabled={updatingId === item.id}>
                      <Text style={styles.acceptButtonText}>Complete & Invoice</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.actionButton, styles.cancelButton]}
                    onPress={() => setCancelTargetId(item.id)}
                    disabled={updatingId === item.id}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              )}

              {(item.status === 'completed' || item.status === 'cancelled') && (
                <Pressable style={styles.reportLink} onPress={() => setReportTargetId(item.id)}>
                  <Text style={styles.reportLinkText}>Report an issue</Text>
                </Pressable>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {statFilter
                  ? `No ${
                      statFilter === 'pending'
                        ? 'pending requests'
                        : statFilter === 'upcoming'
                          ? 'upcoming appointments'
                          : 'appointments ready to bill'
                    }`
                  : viewMode === 'calendar'
                    ? 'No bookings on this day'
                    : 'No booking requests yet'}
              </Text>
            </View>
          }
        />
      )}

      <CancelBookingModal
        visible={cancelTargetId != null}
        submitting={updatingId === cancelTargetId}
        onDismiss={() => setCancelTargetId(null)}
        onConfirm={handleConfirmCancel}
      />

      <ReportModal
        visible={reportTargetId != null}
        reasons={REPORT_REASONS}
        submitting={submittingReport}
        onDismiss={() => setReportTargetId(null)}
        onSubmit={handleSubmitReport}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.light.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    marginTop: 24,
  },
  error: {
    marginTop: 24,
    fontSize: 15,
    color: Colors.light.danger,
  },
  flatList: {
    flex: 1,
  },
  list: {
    marginTop: 16,
    gap: 12,
    paddingBottom: 24,
  },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  planBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  statCardActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  statValueActive: {
    color: '#fff',
  },
  statLabelActive: {
    color: 'rgba(255,255,255,0.85)',
  },
  clearFilter: {
    marginTop: -6,
    marginBottom: 16,
  },
  clearFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.tint,
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
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  toggleButtonActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textMuted,
  },
  toggleTextActive: {
    color: '#fff',
  },
  dayListLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  cardHighlighted: {
    borderColor: Colors.light.tint,
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardService: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
  },
  cardStatus: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  reasonText: {
    marginTop: 8,
    fontSize: 13,
    fontStyle: 'italic',
    color: Colors.light.danger,
  },
  reportLink: {
    marginTop: 10,
    alignItems: 'center',
  },
  reportLinkText: {
    fontSize: 12,
    color: Colors.light.textMuted,
    textDecorationLine: 'underline',
  },
  paidText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.success,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: Colors.light.tint,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.danger,
  },
  cancelButtonText: {
    color: Colors.light.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.light.textMuted,
  },
});
