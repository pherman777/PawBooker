import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { getOrCreateGroomerThread } from '@/services/chat';
import { supabase } from '@/services/supabase';
import type { Groomer, SalonReview } from '@/types';
import { notify } from '@/utils/confirm';
import { DAYS_OF_WEEK, dayLabel, formatDayHours, todayKey } from '@/utils/hours';
import { formatPhoneForDisplay, phoneToTelHref } from '@/utils/phone';
import { StarRating } from '@/components/StarRating';
import { DirectionsButton } from '@/components/DirectionsButton';
import { useLightStatusBar } from '@/hooks/useLightStatusBar';

export default function GroomerDetailScreen() {
  useLightStatusBar();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [groomer, setGroomer] = useState<Groomer | null>(null);
  const [reviews, setReviews] = useState<SalonReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [isDeactivated, setIsDeactivated] = useState(false);
  const [startingBookingFor, setStartingBookingFor] = useState<string | null>(null);

  async function handleMessage() {
    if (!session || !groomer) return;
    setMessaging(true);
    try {
      const threadId = await getOrCreateGroomerThread(session.user.id, groomer.id);
      router.push({ pathname: '/chat/[threadId]', params: { threadId } });
    } catch (err) {
      notify('Could not start conversation', err instanceof Error ? err.message : 'Something went wrong.');
    }
    setMessaging(false);
  }

  // A customer with zero pets can reach the booking screen but has nothing to
  // select and no way to actually book - check first and send them to add a
  // pet instead, rather than dropping them into a dead-end screen.
  async function handleBookPress(serviceId: string) {
    if (!session || !groomer) return;
    setStartingBookingFor(serviceId);
    const { count, error: countError } = await supabase
      .from('pets')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', session.user.id);
    setStartingBookingFor(null);

    if (countError) {
      notify('Something went wrong', countError.message);
      return;
    }

    if (!count) {
      notify('Add a pet first', "You'll need a pet profile before you can book an appointment - let's set one up.");
      router.push('/pet/new');
      return;
    }

    router.push({ pathname: '/booking/[groomerId]', params: { groomerId: groomer.id, serviceId } });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadGroomer() {
      const [groomerResult, reviewsResult] = await Promise.all([
        supabase
          .from('groomers')
          .select(
            'id, name, avatar_url, bio, address, latitude, longitude, rating, review_count, phone, email, hours, deactivated_at, groomer_services(id, name, price_cents, duration_minutes, description)'
          )
          .eq('id', id)
          .single(),
        supabase
          .from('salon_reviews')
          .select('id, booking_id, groomer_id, customer_id, rating, comment, created_at')
          .eq('groomer_id', id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (cancelled) return;

      const { data, error: queryError } = groomerResult;

      if (queryError) {
        setError(queryError.message);
      } else if (data) {
        setGroomer({
          id: data.id,
          name: data.name,
          avatarUrl: data.avatar_url ?? undefined,
          bio: data.bio ?? undefined,
          address: data.address,
          latitude: data.latitude ?? undefined,
          longitude: data.longitude ?? undefined,
          rating: data.rating,
          reviewCount: data.review_count,
          priceFromCents: Math.min(...data.groomer_services.map((s) => s.price_cents)),
          services: data.groomer_services.map((s) => ({
            id: s.id,
            name: s.name,
            priceCents: s.price_cents,
            durationMinutes: s.duration_minutes,
            description: (s as { description?: string | null }).description ?? undefined,
          })),
          phone: data.phone ?? undefined,
          email: data.email ?? undefined,
          hours: data.hours ?? undefined,
        });
        setIsDeactivated(Boolean(data.deactivated_at));
      }

      if (reviewsResult.data) {
        setReviews(
          reviewsResult.data.map((r) => ({
            id: r.id,
            bookingId: r.booking_id,
            groomerId: r.groomer_id,
            customerId: r.customer_id,
            rating: r.rating,
            comment: r.comment ?? undefined,
            createdAt: r.created_at,
          }))
        );
      }

      setLoading(false);
    }

    loadGroomer();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  if (error || !groomer) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>Couldn&apos;t load this groomer{error ? `: ${error}` : ''}.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            {groomer.avatarUrl ? (
              <Image source={{ uri: groomer.avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Ionicons name="paw" size={28} color={Colors.light.tint} />
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.name}>{groomer.name}</Text>
            <Text style={styles.address}>{groomer.address}</Text>
          </View>
        </View>

        {groomer.latitude != null && groomer.longitude != null && (
          <View style={styles.directionsWrapper}>
            <DirectionsButton destination={{ latitude: groomer.latitude, longitude: groomer.longitude }} />
          </View>
        )}

        <Text style={styles.rating}>
          ★ {groomer.rating.toFixed(1)} ({groomer.reviewCount} reviews)
        </Text>
        {groomer.bio && <Text style={styles.bio}>{groomer.bio}</Text>}

        {isDeactivated ? (
          <Text style={styles.deactivatedNotice}>
            This salon is no longer accepting messages or bookings.
          </Text>
        ) : (
          <Pressable style={styles.messageButton} onPress={handleMessage} disabled={messaging}>
            {messaging ? (
              <ActivityIndicator color={Colors.light.tint} size="small" />
            ) : (
              <Text style={styles.messageButtonText}>Message this groomer</Text>
            )}
          </Pressable>
        )}

        <Text style={styles.sectionTitle}>Services</Text>
        {groomer.services.map((service) => (
          <View key={service.id} style={styles.serviceRow}>
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceName}>{service.name}</Text>
              <Text style={styles.serviceMeta}>{service.durationMinutes} min</Text>
              {service.description ? (
                <Text style={styles.serviceDescription}>{service.description}</Text>
              ) : null}
            </View>
            <View style={styles.serviceAction}>
              <Text style={styles.servicePrice}>${(service.priceCents / 100).toFixed(0)}</Text>
              {!isDeactivated && (
                <Pressable
                  style={styles.bookButton}
                  onPress={() => handleBookPress(service.id)}
                  disabled={startingBookingFor === service.id}>
                  {startingBookingFor === service.id ? (
                    <ActivityIndicator color={Colors.light.text} size="small" />
                  ) : (
                    <Text style={styles.bookButtonText}>Book</Text>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        ))}

        {groomer.hours && (
          <>
            <Text style={styles.sectionTitle}>Hours</Text>
            {DAYS_OF_WEEK.map((day) => {
              const isToday = day === todayKey();
              return (
                <View key={day} style={styles.hoursRow}>
                  <Text style={[styles.hoursDay, isToday && styles.hoursToday]}>{dayLabel(day)}</Text>
                  <Text style={[styles.hoursTime, isToday && styles.hoursToday]}>
                    {formatDayHours(groomer.hours![day])}
                  </Text>
                </View>
              );
            })}
          </>
        )}

        {(groomer.phone || groomer.email) && (
          <>
            <Text style={styles.sectionTitle}>Contact</Text>
            {groomer.phone && (
              <Pressable onPress={() => Linking.openURL(`tel:${phoneToTelHref(groomer.phone)}`)}>
                <Text style={styles.contactText}>{formatPhoneForDisplay(groomer.phone)}</Text>
              </Pressable>
            )}
            {groomer.email && (
              <Pressable onPress={() => Linking.openURL(`mailto:${groomer.email}`)}>
                <Text style={styles.contactText}>{groomer.email}</Text>
              </Pressable>
            )}
          </>
        )}

        <Text style={styles.sectionTitle}>Reviews</Text>
        {reviews.length === 0 && <Text style={styles.noReviews}>No reviews yet.</Text>}
        {reviews.map((review) => (
          <View key={review.id} style={styles.reviewRow}>
            <View style={styles.reviewHeader}>
              <StarRating value={review.rating} size={16} />
              <Text style={styles.reviewDate}>
                {new Date(review.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <Text style={styles.reviewAuthor}>Verified customer</Text>
            {review.comment && <Text style={styles.reviewComment}>{review.comment}</Text>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 20,
  },
  loading: {
    marginTop: 40,
  },
  error: {
    margin: 20,
    fontSize: 15,
    color: Colors.light.danger,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(107,143,114,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
  },
  address: {
    marginTop: 6,
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  directionsWrapper: {
    marginTop: 10,
  },
  rating: {
    marginTop: 6,
    fontSize: 15,
    color: Colors.light.text,
  },
  bio: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.light.text,
  },
  messageButton: {
    marginTop: 16,
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  deactivatedNotice: {
    marginTop: 16,
    fontSize: 14,
    fontStyle: 'italic',
    color: Colors.light.textMuted,
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 12,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  serviceMeta: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  serviceDescription: {
    marginTop: 6,
    marginRight: 12,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textMuted,
  },
  serviceAction: {
    alignItems: 'flex-end',
    gap: 6,
  },
  servicePrice: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  bookButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.light.tint,
  },
  bookButtonText: {
    color: Colors.light.text,
    fontSize: 14,
    fontWeight: '600',
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  hoursDay: {
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  hoursTime: {
    fontSize: 14,
    color: Colors.light.text,
  },
  hoursToday: {
    color: Colors.light.tint,
    fontWeight: '700',
  },
  contactText: {
    fontSize: 15,
    color: Colors.light.tint,
    marginBottom: 8,
  },
  noReviews: {
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  reviewRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewDate: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  reviewAuthor: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
  },
  reviewComment: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
  },
});
