import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { CancelBookingModal } from '@/components/CancelBookingModal';
import { DirectionsButton } from '@/components/DirectionsButton';
import { ReportModal } from '@/components/ReportModal';
import { ReviewModal } from '@/components/ReviewModal';
import { TipModal } from '@/components/TipModal';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { notifyGroomer, sendBookingEmail } from '@/services/notifications';
import { submitReport } from '@/services/support';
import { chargeTip } from '@/services/stripe';
import { supabase } from '@/services/supabase';
import type { BookingStatus, PaymentStatus } from '@/types';
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
  groomerId: string;
  serviceId: string;
  petId: string;
  startsAt: string;
  status: BookingStatus;
  groomerName: string;
  groomerLatitude?: number;
  groomerLongitude?: number;
  serviceName: string;
  petName: string;
  cancellationReason?: string;
  review?: BookingReview;
  invoiceTotalCents?: number;
  taxAmountCents?: number;
  tipAmountCents?: number;
  paymentStatus?: PaymentStatus;
};

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: Colors.light.warning,
  confirmed: Colors.light.success,
  completed: Colors.light.textMuted,
  cancelled: Colors.light.danger,
  declined: Colors.light.warning,
};

export default function BookingsScreen() {
  const router = useRouter();
  const { bookingId: notifiedBookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const handledNotificationRef = useRef<string | null>(null);
  const flatListRef = useRef<FlatList<BookingRow>>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const { session } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [tipTargetId, setTipTargetId] = useState<string | null>(null);
  const [submittingTip, setSubmittingTip] = useState(false);
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    const [bookingsResult, reviewsResult] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          'id, groomer_id, service_id, pet_id, starts_at, status, payment_status, cancellation_reason, invoice_total_cents, tax_amount_cents, tip_amount_cents, groomers(name, latitude, longitude), groomer_services(name), pets(name)'
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
          groomerId: row.groomer_id,
          serviceId: row.service_id,
          petId: row.pet_id,
          startsAt: row.starts_at,
          status: row.status,
          cancellationReason: row.cancellation_reason ?? undefined,
          groomerName:
            (row.groomers as unknown as { name: string; latitude: number | null; longitude: number | null })
              ?.name ?? 'Unknown groomer',
          groomerLatitude:
            (row.groomers as unknown as { latitude: number | null } | null)?.latitude ?? undefined,
          groomerLongitude:
            (row.groomers as unknown as { longitude: number | null } | null)?.longitude ?? undefined,
          serviceName: (row.groomer_services as unknown as { name: string })?.name ?? 'Service',
          petName: (row.pets as unknown as { name: string })?.name ?? 'Pet',
          review: reviewsByBooking.get(row.id),
          invoiceTotalCents: row.invoice_total_cents ?? undefined,
          taxAmountCents: row.tax_amount_cents ?? undefined,
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

  async function handleConfirmCancel(reason: string) {
    if (!cancelTargetId) return;
    const bookingId = cancelTargetId;
    const cancelledBooking = bookings.find((b) => b.id === bookingId);
    setUpdatingId(bookingId);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancellation_reason: reason, cancelled_by: 'customer' })
      .eq('id', bookingId);

    setUpdatingId(null);
    setCancelTargetId(null);

    if (updateError) {
      notify('Update failed', updateError.message);
      return;
    }
    await load();
    sendBookingEmail(bookingId, 'customer_cancelled');
    if (cancelledBooking) {
      notifyGroomer(cancelledBooking.groomerId, bookingId, 'booking_cancelled');
    }
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

  async function handleSubmitTip(tipAmountCents: number) {
    if (!tipTargetId) return;

    setSubmittingTip(true);
    try {
      await chargeTip(tipTargetId, tipAmountCents);
      setTipTargetId(null);
      await load();
    } catch (err) {
      notify('Tip not sent', err instanceof Error ? err.message : 'Something went wrong.');
    }
    setSubmittingTip(false);
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
        <FlatList
          ref={flatListRef}
          data={bookings}
          keyExtractor={(item) => item.id}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
            }, 200);
          }}
          style={styles.flatList}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
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
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => setCancelTargetId(item.id)}
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

              {item.status === 'completed' && item.invoiceTotalCents != null && (
                item.tipAmountCents != null ? (
                  <Text style={styles.tippedText}>Tipped ${(item.tipAmountCents / 100).toFixed(2)}</Text>
                ) : (
                  <Pressable style={styles.tipButton} onPress={() => setTipTargetId(item.id)}>
                    <Text style={styles.tipButtonText}>Leave a tip</Text>
                  </Pressable>
                )
              )}

              {(item.status === 'completed' || item.status === 'cancelled' || item.status === 'confirmed') && (
                <Pressable style={styles.reportLink} onPress={() => setReportTargetId(item.id)}>
                  <Text style={styles.reportLinkText}>Report an issue</Text>
                </Pressable>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No bookings yet</Text>
              <Pressable style={styles.emptyButton} onPress={() => router.push('/(tabs)/browse')}>
                <Text style={styles.emptyButtonText}>Book an appointment</Text>
              </Pressable>
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

      <TipModal
        visible={tipTargetId != null}
        subtotalCents={
          (bookings.find((b) => b.id === tipTargetId)?.invoiceTotalCents ?? 0) -
          (bookings.find((b) => b.id === tipTargetId)?.taxAmountCents ?? 0)
        }
        submitting={submittingTip}
        onDismiss={() => setTipTargetId(null)}
        onSubmit={handleSubmitTip}
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
    color: '#fff',
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
    color: '#fff',
  },
  paymentFailedBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FBEAE8',
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
  tipButton: {
    marginTop: 8,
    height: 38,
    borderRadius: 8,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
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
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
