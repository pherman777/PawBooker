import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { CancelBookingModal } from '@/components/CancelBookingModal';
import { DirectionsButton } from '@/components/DirectionsButton';
import { ReportModal } from '@/components/ReportModal';
import { ReviewModal } from '@/components/ReviewModal';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { getOrCreateGroomerThread } from '@/services/chat';
import { notifyGroomer, sendBookingEmail } from '@/services/notifications';
import { submitReport } from '@/services/support';
import { supabase } from '@/services/supabase';
import type { BookingStatus, PaymentStatus } from '@/types';
import { addBookingToCalendar } from '@/utils/deviceCalendar';
import { notify } from '@/utils/confirm';

const REPORT_REASONS = [
  'Overcharged me',
  'Unsafe or unprofessional handling of my pet',
  'Rude or unprofessional behavior',
  'Did not show up',
  'Other',
];

type BookingReview = {
  rating: number;
  comment: string;
};

type BookingRow = {
  id: string;
  groupId?: string;
  groomerId: string;
  serviceId: string;
  petId: string;
  startsAt: string;
  status: BookingStatus;
  groomerName: string;
  groomerAddress?: string;
  groomerLatitude?: number;
  groomerLongitude?: number;
  serviceName: string;
  serviceDurationMinutes: number;
  petName: string;
  cancellationReason?: string;
  review?: BookingReview;
  invoiceTotalCents?: number;
  tipAmountCents?: number;
  paymentStatus?: PaymentStatus;
};

// A row in the list is either a standalone booking or a multi-pet group booked
// as one visit. `bookings` is sorted earliest-first; `lead` is that earliest one.
type BookingEntry = {
  key: string;
  bookings: BookingRow[];
  lead: BookingRow;
};

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: Colors.light.warning,
  confirmed: Colors.light.success,
  completed: Colors.light.textMuted,
  cancelled: Colors.light.danger,
  declined: Colors.light.warning,
};

// Collapses linked bookings (same group_id) into one entry, preserving the
// order groups first appear in the (already sorted) list. Standalone bookings
// each become an entry of one.
function groupEntries(rows: BookingRow[]): BookingEntry[] {
  const entries: BookingEntry[] = [];
  const indexByGroup = new Map<string, number>();
  for (const row of rows) {
    if (row.groupId) {
      const at = indexByGroup.get(row.groupId);
      if (at != null) {
        entries[at].bookings.push(row);
        continue;
      }
      indexByGroup.set(row.groupId, entries.length);
      entries.push({ key: row.groupId, bookings: [row], lead: row });
    } else {
      entries.push({ key: row.id, bookings: [row], lead: row });
    }
  }
  for (const entry of entries) {
    entry.bookings.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    entry.lead = entry.bookings[0];
  }
  return entries;
}

// One representative status for a whole group: done only if every pet is done,
// otherwise surface the most "active" state the customer should act on.
function groupStatus(rows: BookingRow[]): BookingStatus {
  if (rows.every((b) => b.status === 'completed')) return 'completed';
  const order: BookingStatus[] = ['pending', 'confirmed', 'cancelled', 'declined', 'completed'];
  for (const status of order) {
    if (rows.some((b) => b.status === status)) return status;
  }
  return rows[0].status;
}

export default function BookingsScreen() {
  const router = useRouter();
  const { bookingId: notifiedBookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const handledNotificationRef = useRef<string | null>(null);
  const flatListRef = useRef<FlatList<BookingEntry>>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const { session } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [messagingGroomerId, setMessagingGroomerId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ ids: string[]; groomerId: string } | null>(null);
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    const [bookingsResult, reviewsResult] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          'id, group_id, groomer_id, service_id, pet_id, starts_at, status, payment_status, cancellation_reason, invoice_total_cents, tip_amount_cents, groomers(name, address, latitude, longitude), groomer_services(name, duration_minutes), pets(name)'
        )
        .eq('customer_id', session.user.id)
        .order('starts_at', { ascending: false }),
      supabase.from('salon_reviews').select('booking_id, rating, comment').eq('customer_id', session.user.id),
    ]);

    if (bookingsResult.error) {
      setError(bookingsResult.error.message);
    } else {
      const reviewsByBooking = new Map(
        (reviewsResult.data ?? []).map((r) => [r.booking_id, { rating: r.rating, comment: r.comment ?? '' }])
      );

      setBookings(
        (bookingsResult.data ?? []).map((row) => ({
          id: row.id,
          groupId: row.group_id ?? undefined,
          groomerId: row.groomer_id,
          serviceId: row.service_id,
          petId: row.pet_id,
          startsAt: row.starts_at,
          status: row.status,
          cancellationReason: row.cancellation_reason ?? undefined,
          groomerName:
            (row.groomers as unknown as { name: string; latitude: number | null; longitude: number | null })
              ?.name ?? 'Unknown groomer',
          groomerAddress: (row.groomers as unknown as { address: string | null } | null)?.address ?? undefined,
          groomerLatitude:
            (row.groomers as unknown as { latitude: number | null } | null)?.latitude ?? undefined,
          groomerLongitude:
            (row.groomers as unknown as { longitude: number | null } | null)?.longitude ?? undefined,
          serviceName: (row.groomer_services as unknown as { name: string })?.name ?? 'Service',
          serviceDurationMinutes: (row.groomer_services as unknown as { duration_minutes: number | null })?.duration_minutes ?? 60,
          petName: (row.pets as unknown as { name: string })?.name ?? 'Pet',
          review: reviewsByBooking.get(row.id),
          invoiceTotalCents: row.invoice_total_cents ?? undefined,
          tipAmountCents: row.tip_amount_cents ?? undefined,
          paymentStatus: row.payment_status ?? undefined,
        }))
      );
    }

    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const entries = useMemo(() => groupEntries(bookings), [bookings]);

  async function handleMessageGroomer(groomerId: string) {
    if (!session) return;
    setMessagingGroomerId(groomerId);
    try {
      const threadId = await getOrCreateGroomerThread(session.user.id, groomerId);
      router.push({ pathname: '/chat/[threadId]', params: { threadId } });
    } catch (err) {
      notify('Could not start conversation', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setMessagingGroomerId(null);
    }
  }

  async function handleAddToCalendar(row: BookingRow, petLabel: string) {
    const result = await addBookingToCalendar({
      title: `${row.serviceName} - ${petLabel} at ${row.groomerName}`,
      startDate: new Date(row.startsAt),
      durationMinutes: row.serviceDurationMinutes,
      location: row.groomerAddress,
    });

    if (result.status === 'added') {
      notify('Added to calendar', 'Your appointment has been added to your calendar.');
    } else if (result.status === 'permission_denied') {
      notify('Calendar access needed', 'Allow calendar access in Settings to add appointments.');
    } else if (result.status === 'no_calendar') {
      notify('No calendar found', "We couldn't find a calendar on your device to add this to.");
    } else {
      notify('Could not add to calendar', result.message);
    }
  }

  async function handleConfirmCancel(reason: string) {
    if (!cancelTarget) return;
    const { ids, groomerId } = cancelTarget;
    setUpdatingId(ids[0]);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancellation_reason: reason, cancelled_by: 'customer' })
      .in('id', ids);

    setUpdatingId(null);
    setCancelTarget(null);

    if (updateError) {
      notify('Update failed', updateError.message);
      return;
    }
    await load();
    // One email + groomer notification per visit, keyed on the lead booking.
    sendBookingEmail(ids[0], 'customer_cancelled');
    notifyGroomer(groomerId, ids[0], 'booking_cancelled');
  }

  async function handleSubmitReview(rating: number, comment: string) {
    if (!reviewTargetId || !session) return;
    const booking = bookings.find((b) => b.id === reviewTargetId);
    if (!booking) return;

    setSubmittingReview(true);

    const { error: reviewError } = await supabase.from('salon_reviews').upsert(
      {
        booking_id: booking.id,
        groomer_id: booking.groomerId,
        customer_id: session.user.id,
        rating,
        comment: comment || null,
      },
      { onConflict: 'booking_id' }
    );

    setSubmittingReview(false);
    setReviewTargetId(null);

    if (reviewError) {
      notify('Review not saved', reviewError.message);
      return;
    }
    await load();
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

  function handleSelectBookingFromNotification(bookingId: string) {
    setHighlightedId(bookingId);

    setTimeout(() => {
      const index = entries.findIndex((e) => e.bookings.some((b) => b.id === bookingId));
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

  function renderGroupCard(entry: BookingEntry) {
    const rows = entry.bookings;
    const lead = entry.lead;
    const status = groupStatus(rows);
    const isHighlighted = rows.some((b) => b.id === highlightedId);
    const petNames = rows.map((b) => b.petName).join(', ');
    const ids = rows.map((b) => b.id);
    const cancellable = status === 'pending' || status === 'confirmed';
    const allCompleted = rows.every((b) => b.status === 'completed');
    const totalPaidCents = rows.reduce((sum, b) => sum + (b.invoiceTotalCents ?? 0), 0);
    const anyPaymentFailed = rows.some((b) => b.paymentStatus === 'failed');

    return (
      <View style={[styles.card, isHighlighted && styles.cardHighlighted]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardService}>{lead.serviceName}</Text>
          <Text style={[styles.cardStatus, { color: STATUS_COLORS[status] }]}>{status}</Text>
        </View>
        <View style={styles.groupBadge}>
          <Text style={styles.groupBadgeText}>{rows.length} pets · one visit</Text>
        </View>
        <Text style={styles.cardMeta}>
          {lead.groomerName} · {petNames}
        </Text>
        <Text style={styles.cardMeta}>
          {new Date(lead.startsAt).toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>

        {status === 'cancelled' && lead.cancellationReason && (
          <Text style={styles.reasonText}>Reason: {lead.cancellationReason}</Text>
        )}

        {status === 'declined' && (
          <View style={styles.declinedBox}>
            <Text style={styles.declinedLabel}>Note from {lead.groomerName}</Text>
            <Text style={styles.declinedNote}>
              {lead.cancellationReason || 'They couldn’t take this time. Try booking another.'}
            </Text>
          </View>
        )}

        {anyPaymentFailed && (
          <View style={styles.paymentFailedBanner}>
            <Text style={styles.paymentFailedText}>
              We couldn&apos;t charge your card for this visit.
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/profile')}>
              <Text style={styles.paymentFailedLink}>Update payment method</Text>
            </Pressable>
          </View>
        )}

        {(status === 'pending' || status === 'confirmed') &&
          lead.groomerLatitude != null &&
          lead.groomerLongitude != null && (
            <View style={styles.directionsWrapper}>
              <DirectionsButton
                destination={{ latitude: lead.groomerLatitude, longitude: lead.groomerLongitude }}
              />
            </View>
          )}

        {(status === 'pending' || status === 'confirmed') && (
          <Pressable onPress={() => handleAddToCalendar(lead, petNames)}>
            <Text style={styles.addToCalendarText}>+ Add to calendar</Text>
          </Pressable>
        )}

        {status !== 'cancelled' && status !== 'declined' && (
          <Pressable onPress={() => handleMessageGroomer(lead.groomerId)} disabled={messagingGroomerId === lead.groomerId}>
            <Text style={styles.addToCalendarText}>{messagingGroomerId === lead.groomerId ? 'Opening…' : 'Message groomer'}</Text>
          </Pressable>
        )}

        {cancellable && (
          <Pressable
            style={styles.cancelButton}
            onPress={() => setCancelTarget({ ids, groomerId: lead.groomerId })}
            disabled={updatingId === ids[0]}>
            {updatingId === ids[0] ? (
              <ActivityIndicator color={Colors.light.danger} size="small" />
            ) : (
              <Text style={styles.cancelButtonText}>Cancel booking</Text>
            )}
          </Pressable>
        )}

        {allCompleted && totalPaidCents > 0 && (
          <Text style={styles.tippedText}>Paid ${(totalPaidCents / 100).toFixed(2)} total</Text>
        )}

        {allCompleted && (
          <Pressable style={styles.reviewButton} onPress={() => setReviewTargetId(lead.id)}>
            <Text style={styles.reviewButtonText}>{lead.review ? 'Edit review' : 'Leave a review'}</Text>
          </Pressable>
        )}

        {allCompleted && totalPaidCents > 0 && lead.tipAmountCents != null && (
          <Text style={styles.tippedText}>Tipped ${(lead.tipAmountCents / 100).toFixed(2)} for the visit</Text>
        )}

        {(status === 'completed' || status === 'cancelled' || status === 'confirmed') && (
          <Pressable style={styles.reportLink} onPress={() => setReportTargetId(lead.id)}>
            <Text style={styles.reportLinkText}>Report an issue</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader
        title="Your bookings"
        right={
          <Pressable style={styles.newButton} onPress={() => router.push('/(tabs)/browse')}>
            <Text style={styles.newButtonText}>+ New booking</Text>
          </Pressable>
        }
      />

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}
      {error && <Text style={styles.error}>Couldn&apos;t load bookings: {error}</Text>}

      {!loading && !error && (
        <FlatList showsVerticalScrollIndicator={false}
          ref={flatListRef}
          data={entries}
          keyExtractor={(entry) => entry.key}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
            }, 200);
          }}
          style={styles.flatList}
          contentContainerStyle={styles.list}
          renderItem={({ item: entry }) => {
            if (entry.bookings.length > 1) return renderGroupCard(entry);
            const item = entry.bookings[0];
            return (
            <View style={[styles.card, item.id === highlightedId && styles.cardHighlighted]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardService}>{item.serviceName}</Text>
                <Text style={[styles.cardStatus, { color: STATUS_COLORS[item.status] }]}>{item.status}</Text>
              </View>
              <Text style={styles.cardMeta}>
                {item.groomerName} · for {item.petName}
              </Text>
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

              {item.status === 'declined' && (
                <View style={styles.declinedBox}>
                  <Text style={styles.declinedLabel}>Note from {item.groomerName}</Text>
                  <Text style={styles.declinedNote}>
                    {item.cancellationReason || 'They couldn’t take this time. Try booking another.'}
                  </Text>
                  <Pressable
                    style={styles.rebookButton}
                    onPress={() =>
                      router.push({
                        pathname: '/booking/[groomerId]',
                        params: {
                          groomerId: item.groomerId,
                          serviceId: item.serviceId,
                          petId: item.petId,
                          note: item.cancellationReason ?? '',
                        },
                      })
                    }>
                    <Text style={styles.rebookButtonText}>Rebook a different time</Text>
                  </Pressable>
                </View>
              )}

              {item.paymentStatus === 'failed' && (
                <View style={styles.paymentFailedBanner}>
                  <Text style={styles.paymentFailedText}>
                    We couldn&apos;t charge your card for this appointment.
                  </Text>
                  <Pressable onPress={() => router.push('/(tabs)/profile')}>
                    <Text style={styles.paymentFailedLink}>Update payment method</Text>
                  </Pressable>
                </View>
              )}

              {(item.status === 'pending' || item.status === 'confirmed') &&
                item.groomerLatitude != null &&
                item.groomerLongitude != null && (
                  <View style={styles.directionsWrapper}>
                    <DirectionsButton
                      destination={{ latitude: item.groomerLatitude, longitude: item.groomerLongitude }}
                    />
                  </View>
                )}

              {(item.status === 'pending' || item.status === 'confirmed') && (
                <Pressable onPress={() => handleAddToCalendar(item, item.petName)}>
                  <Text style={styles.addToCalendarText}>+ Add to calendar</Text>
                </Pressable>
              )}

              {item.status !== 'cancelled' && item.status !== 'declined' && (
                <Pressable onPress={() => handleMessageGroomer(item.groomerId)} disabled={messagingGroomerId === item.groomerId}>
                  <Text style={styles.addToCalendarText}>{messagingGroomerId === item.groomerId ? 'Opening…' : 'Message groomer'}</Text>
                </Pressable>
              )}

              {(item.status === 'pending' || item.status === 'confirmed') && (
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => setCancelTarget({ ids: [item.id], groomerId: item.groomerId })}
                  disabled={updatingId === item.id}>
                  {updatingId === item.id ? (
                    <ActivityIndicator color={Colors.light.danger} size="small" />
                  ) : (
                    <Text style={styles.cancelButtonText}>Cancel booking</Text>
                  )}
                </Pressable>
              )}

              {item.status === 'completed' && (
                <Pressable style={styles.reviewButton} onPress={() => setReviewTargetId(item.id)}>
                  <Text style={styles.reviewButtonText}>
                    {item.review ? 'Edit review' : 'Leave a review'}
                  </Text>
                </Pressable>
              )}

              {item.status === 'completed' && item.tipAmountCents != null && (
                <Text style={styles.tippedText}>Tipped ${(item.tipAmountCents / 100).toFixed(2)}</Text>
              )}

              {(item.status === 'completed' || item.status === 'cancelled' || item.status === 'confirmed') && (
                <Pressable style={styles.reportLink} onPress={() => setReportTargetId(item.id)}>
                  <Text style={styles.reportLinkText}>Report an issue</Text>
                </Pressable>
              )}
            </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIllustration}>
                <Ionicons name="calendar-outline" size={34} color={Colors.light.tint} />
              </View>
              <Text style={styles.emptyText}>No bookings yet</Text>
              <Pressable style={styles.emptyButton} onPress={() => router.push('/(tabs)/browse')}>
                <Text style={styles.emptyButtonText}>Book an appointment</Text>
              </Pressable>
            </View>
          }
        />
      )}

      <CancelBookingModal
        visible={cancelTarget != null}
        submitting={cancelTarget != null && updatingId === cancelTarget.ids[0]}
        onDismiss={() => setCancelTarget(null)}
        onConfirm={handleConfirmCancel}
        subtitle={
          cancelTarget && cancelTarget.ids.length > 1
            ? `This cancels all ${cancelTarget.ids.length} pets booked in this visit.`
            : undefined
        }
      />

      <ReviewModal
        visible={reviewTargetId != null}
        title="Rate this appointment"
        subtitle={bookings.find((b) => b.id === reviewTargetId)?.groomerName}
        submitting={submittingReview}
        initialRating={bookings.find((b) => b.id === reviewTargetId)?.review?.rating ?? 0}
        initialComment={bookings.find((b) => b.id === reviewTargetId)?.review?.comment ?? ''}
        onDismiss={() => setReviewTargetId(null)}
        onSubmit={handleSubmitReview}
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
  newButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.light.tint,
  },
  newButtonText: {
    color: Colors.light.text,
    fontSize: 13,
    fontWeight: '600',
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
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
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
  groupBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.light.tint,
  },
  groupBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.text,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  directionsWrapper: {
    marginTop: 10,
  },
  cardStatus: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  reasonText: {
    marginTop: 8,
    fontSize: 13,
    fontStyle: 'italic',
    color: Colors.light.danger,
  },
  declinedBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  declinedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.textMuted,
    marginBottom: 4,
  },
  declinedNote: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
  },
  rebookButton: {
    marginTop: 12,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rebookButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  paymentFailedBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    // Danger-tinted wash, recomputed for the new danger hex (#B14B3E).
    backgroundColor: 'rgba(177,75,62,0.14)',
  },
  paymentFailedText: {
    fontSize: 13,
    color: Colors.light.danger,
  },
  paymentFailedLink: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.tint,
    textDecorationLine: 'underline',
  },
  addToCalendarText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  cancelButton: {
    marginTop: 12,
    height: 38,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.danger,
  },
  reviewButton: {
    marginTop: 12,
    height: 38,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  tippedText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.success,
    textAlign: 'center',
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
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    gap: 16,
  },
  emptyIllustration: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(107,143,114,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  emptyButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
  },
  emptyButtonText: {
    color: Colors.light.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
