import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { supabase } from '@/services/supabase';
import type { Groomer, SalonReview } from '@/types';
import { DAYS_OF_WEEK, dayLabel, formatDayHours, todayKey } from '@/utils/hours';
import { StarRating } from '@/components/StarRating';

export default function GroomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [groomer, setGroomer] = useState<Groomer | null>(null);
  const [reviews, setReviews] = useState<SalonReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGroomer() {
      const [groomerResult, reviewsResult] = await Promise.all([
        supabase
          .from('groomers')
          .select(
            'id, name, avatar_url, bio, address, rating, review_count, phone, email, hours, groomer_services(id, name, price_cents, duration_minutes)'
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
          rating: data.rating,
          reviewCount: data.review_count,
          priceFromCents: Math.min(...data.groomer_services.map((s) => s.price_cents)),
          services: data.groomer_services.map((s) => ({
            id: s.id,
            name: s.name,
            priceCents: s.price_cents,
            durationMinutes: s.duration_minutes,
          })),
          phone: data.phone ?? undefined,
          email: data.email ?? undefined,
          hours: data.hours ?? undefined,
        });
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.name}>{groomer.name}</Text>
        <Text style={styles.address}>{groomer.address}</Text>
        <Text style={styles.rating}>
          ★ {groomer.rating.toFixed(1)} ({groomer.reviewCount} reviews)
        </Text>
        {groomer.bio && <Text style={styles.bio}>{groomer.bio}</Text>}

        <Text style={styles.sectionTitle}>Services</Text>
        {groomer.services.map((service) => (
          <View key={service.id} style={styles.serviceRow}>
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceName}>{service.name}</Text>
              <Text style={styles.serviceMeta}>{service.durationMinutes} min</Text>
            </View>
            <View style={styles.serviceAction}>
              <Text style={styles.servicePrice}>${(service.priceCents / 100).toFixed(0)}</Text>
              <Pressable
                style={styles.bookButton}
                onPress={() =>
                  router.push({
                    pathname: '/booking/[groomerId]',
                    params: { groomerId: groomer.id, serviceId: service.id },
                  })
                }>
                <Text style={styles.bookButtonText}>Book</Text>
              </Pressable>
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
              <Pressable onPress={() => Linking.openURL(`tel:${groomer.phone}`)}>
                <Text style={styles.contactText}>{groomer.phone}</Text>
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
    alignItems: 'center',
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
    color: '#fff',
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
