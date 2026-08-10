import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { ReviewModal } from '@/components/ReviewModal';
import { Wordmark } from '@/components/Wordmark';
import { StarRating } from '@/components/StarRating';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import type { AppReview } from '@/types';
import { notify } from '@/utils/confirm';

type NavCard = {
  href: '/(tabs)/browse' | '/(tabs)/bookings' | '/(tabs)/messages' | '/(tabs)/profile';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
};

const NAV_CARDS: NavCard[] = [
  {
    href: '/(tabs)/browse',
    icon: 'search',
    title: 'Find a groomer',
    subtitle: 'Search grooming services near you',
  },
  {
    href: '/(tabs)/bookings',
    icon: 'calendar',
    title: 'My bookings',
    subtitle: 'View and manage appointments',
  },
  {
    href: '/(tabs)/messages',
    icon: 'chatbubble-ellipses',
    title: 'Messages',
    subtitle: 'Chat with your groomer',
  },
  {
    href: '/(tabs)/profile',
    icon: 'person',
    title: 'Profile & pets',
    subtitle: 'Manage your pets and account',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [appReviews, setAppReviews] = useState<AppReview[]>([]);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('app_reviews')
      .select('customer_id, rating, comment, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setAppReviews(
        data.map((r) => ({
          customerId: r.customer_id,
          rating: r.rating,
          comment: r.comment ?? undefined,
          createdAt: r.created_at,
        }))
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const myReview = session ? appReviews.find((r) => r.customerId === session.user.id) : undefined;
  const averageRating =
    appReviews.length > 0 ? appReviews.reduce((sum, r) => sum + r.rating, 0) / appReviews.length : 0;
  const reviewsWithComments = appReviews.filter((r) => r.comment);

  async function handleSubmitReview(rating: number, comment: string) {
    if (!session) return;
    setSubmittingReview(true);

    const { error: reviewError } = await supabase.from('app_reviews').upsert(
      {
        customer_id: session.user.id,
        rating,
        comment: comment || null,
      },
      { onConflict: 'customer_id' }
    );

    setSubmittingReview(false);
    setReviewModalVisible(false);

    if (reviewError) {
      notify('Review not saved', reviewError.message);
      return;
    }
    await load();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Logo size={88} style={styles.logoBadge} />
          <Wordmark size={30} style={styles.appName} />
          <Text style={styles.tagline}>Grooming made easy for your best friend.</Text>
        </View>

        <View style={styles.cards}>
          {NAV_CARDS.map((card) => (
            <Pressable
              key={card.href}
              style={styles.card}
              onPress={() => router.push(card.href)}>
              <View style={styles.cardIcon}>
                <Ionicons name={card.icon} size={22} color={Colors.light.tint} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.light.textMuted} />
            </Pressable>
          ))}
        </View>

        {appReviews.length > 0 && (
          <View style={styles.testimonials}>
            <View style={styles.testimonialsHeader}>
              <Text style={styles.sectionTitle}>What people are saying</Text>
              <View style={styles.testimonialsRating}>
                <StarRating value={Math.round(averageRating)} size={16} />
                <Text style={styles.testimonialsRatingText}>
                  {averageRating.toFixed(1)} ({appReviews.length})
                </Text>
              </View>
            </View>

            {reviewsWithComments.slice(0, 5).map((review) => (
              <View key={review.customerId} style={styles.testimonialCard}>
                <StarRating value={review.rating} size={14} />
                <Text style={styles.testimonialComment}>{review.comment}</Text>
              </View>
            ))}
          </View>
        )}

        {session && (
          <Pressable style={styles.rateButton} onPress={() => setReviewModalVisible(true)}>
            <Ionicons name="star-outline" size={18} color={Colors.light.tint} />
            <Text style={styles.rateButtonText}>{myReview ? 'Edit your review' : 'Rate PawBooker'}</Text>
          </Pressable>
        )}

        {session?.user.email && <Text style={styles.footer}>Signed in as {session.user.email}</Text>}
      </ScrollView>

      <ReviewModal
        visible={reviewModalVisible}
        title="Rate PawBooker"
        subtitle="Tell us how we're doing overall"
        submitting={submittingReview}
        initialRating={myReview?.rating ?? 0}
        initialComment={myReview?.comment ?? ''}
        onDismiss={() => setReviewModalVisible(false)}
        onSubmit={handleSubmitReview}
      />
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
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  logoBadge: {
    shadowColor: Colors.light.tint,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  appName: {
    marginTop: 16,
  },
  tagline: {
    marginTop: 6,
    fontSize: 15,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
  cards: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    gap: 14,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  footer: {
    marginTop: 28,
    fontSize: 13,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
  },
  testimonials: {
    marginTop: 32,
  },
  testimonialsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  testimonialsRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  testimonialsRatingText: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  testimonialCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    marginBottom: 10,
    gap: 8,
  },
  testimonialComment: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
  },
  rateButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.tint,
  },
  rateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
  },
});
