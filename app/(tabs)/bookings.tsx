import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { CancelBookingModal } from '@/components/CancelBookingModal';
import { ReviewModal } from '@/components/ReviewModal';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { notifyGroomer, sendBookingEmail } from '@/services/notifications';
import { supabase } from '@/services/supabase';
import type { BookingStatus } from '@/types';
import { notify } from '@/utils/confirm';

type BookingReview = {
  rating: number;
  comment: string;
};

type BookingRow = {
  id: string;
  groomerId: string;
  startsAt: string;
  status: BookingStatus;
  groomerName: string;
  serviceName: string;
  petName: string;
  cancellationReason?: string;
  review?: BookingReview;
};

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: Colors.light.warning,
  confirmed: Colors.light.success,
  completed: Colors.light.textMuted,
  cancelled: Colors.light.danger,
};

export default function BookingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    const [bookingsResult, reviewsResult] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          'id, groomer_id, starts_at, status, cancellation_reason, groomers(name), groomer_services(name), pets(name)'
        )
        .eq('customer_id', session.user.id)
        .order('starts_at', { ascending: true }),
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
          startsAt: row.starts_at,
          status: row.status,
          cancellationReason: row.cancellation_reason ?? undefined,
          groomerName: (row.groomers as unknown as { name: string })?.name ?? 'Unknown groomer',
          serviceName: (row.groomer_services as unknown as { name: string })?.name ?? 'Service',
          petName: (row.pets as unknown as { name: string })?.name ?? 'Pet',
          review: reviewsByBooking.get(row.id),
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
          data={bookings}
          keyExtractor={(item) => item.id}
          style={styles.flatList}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
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
