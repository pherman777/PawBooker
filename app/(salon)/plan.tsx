import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import { cancelSubscription } from '@/services/stripe';
import { notify } from '@/utils/confirm';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

const PRO_FEATURES = [
  'Insights dashboard (revenue, repeat rate, cancellations, service mix)',
  'AI chat assistant for your customers, with escalation when it needs you',
  'Business Assistant - ask about customers, revenue, and supplies',
  'Win-back reminders for lapsed customers',
  'Priority support',
];

export default function PlanScreen() {
  const router = useRouter();
  const { upgraded } = useLocalSearchParams<{ upgraded?: string }>();
  const { groomerProfile, refreshGroomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [confirmingUpgrade, setConfirmingUpgrade] = useState(false);
  const groomerProfileRef = useRef(groomerProfile);

  useEffect(() => {
    groomerProfileRef.current = groomerProfile;
  }, [groomerProfile]);

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    const { data: groomerResult } = await supabase
      .from('groomers')
      .select('stripe_cancel_at_period_end, plan_current_period_end, stripe_subscription_id')
      .eq('id', groomerProfile.id)
      .single();

    setCancelAtPeriodEnd(Boolean(groomerResult?.stripe_cancel_at_period_end));
    setPeriodEnd(groomerResult?.plan_current_period_end ?? null);
    setHasSubscription(Boolean(groomerResult?.stripe_subscription_id));

    setLoading(false);
  }, [groomerProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Right after returning from a successful checkout, the plan isn't
  // necessarily "pro" yet - Stripe's webhook updates it asynchronously and
  // can lag a couple seconds behind the redirect. Poll briefly rather than
  // checking once, so the screen doesn't flash "Free" right after payment.
  // (Only refreshing here, not on every focus - refreshGroomerProfile creates
  // a new object each call, which would retrigger this screen's other effects
  // and cause an infinite render loop if tied to every focus event instead.)
  useEffect(() => {
    if (!upgraded) return;

    setConfirmingUpgrade(true);
    refreshGroomerProfile();

    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (groomerProfileRef.current?.plan === 'pro' || attempts >= 5) {
        clearInterval(interval);
        setConfirmingUpgrade(false);
        return;
      }
      refreshGroomerProfile();
    }, 2000);

    return () => clearInterval(interval);
  }, [upgraded, refreshGroomerProfile]);

  async function handleCancel() {
    setWorking(true);
    try {
      const result = await cancelSubscription();
      await refreshGroomerProfile();
      setCancelAtPeriodEnd(true);
      setPeriodEnd(result.currentPeriodEnd);
      const when = result.currentPeriodEnd
        ? new Date(result.currentPeriodEnd).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
          })
        : 'the end of your billing period';
      notify('Subscription set to cancel', `You'll keep Pro access until ${when}.`);
    } catch (err) {
      notify('Could not cancel', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setWorking(false);
    }
  }

  const isPro = groomerProfile?.plan === 'pro';
  const periodEndLabel = periodEnd
    ? new Date(periodEnd).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
    : null;

  return (
    <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>

      <ScrollView style={webFlushScroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, webContentWidth('form')]}>
        <Text style={styles.title}>Plan</Text>

        <View style={[styles.planCard, isPro && styles.planCardActive]}>
          <Text style={[styles.planName, isPro && styles.planNameActive]}>
            {isPro ? 'Pro' : 'Free'}
          </Text>
          <Text style={[styles.planPrice, isPro && styles.planNameActive]}>
            {isPro ? '$35/month' : '$0'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Pro includes</Text>
        {PRO_FEATURES.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={isPro ? Colors.light.tint : Colors.light.textMuted}
            />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}

        {loading ? (
          <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
        ) : confirmingUpgrade && !isPro ? (
          <View style={styles.cancelNotice}>
            <ActivityIndicator color={Colors.light.tint} size="small" />
            <Text style={styles.cancelNoticeText}>Confirming your upgrade — this only takes a moment...</Text>
          </View>
        ) : isPro && cancelAtPeriodEnd ? (
          <View style={styles.cancelNotice}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.light.textMuted} />
            <Text style={styles.cancelNoticeText}>
              Your subscription is set to cancel{periodEndLabel ? ` on ${periodEndLabel}` : ''}. You&apos;ll
              keep Pro access until then.
            </Text>
          </View>
        ) : isPro && hasSubscription ? (
          <Button
            label="Cancel subscription"
            variant="danger"
            onPress={handleCancel}
            loading={working}
            style={styles.cancelButton}
          />
        ) : isPro ? (
          <View style={styles.cancelNotice}>
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.light.textMuted} />
            <Text style={styles.cancelNoticeText}>
              You&apos;re on a complimentary Pro plan — no billing and nothing to cancel.
            </Text>
          </View>
        ) : null}
      </ScrollView>
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
  content: {
    paddingTop: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 20,
  },
  planCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  planCardActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  planName: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.light.text,
  },
  planNameActive: {
    color: Colors.light.text,
  },
  planPrice: {
    marginTop: 4,
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
  },
  loading: {
    marginTop: 24,
  },
  cancelButton: {
    marginTop: 20,
    width: '100%',
  },
  cancelNotice: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  cancelNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textMuted,
  },
});
