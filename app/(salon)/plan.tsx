import { LinkDisplay, PlatformPay } from '@stripe/stripe-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useStripePayments } from '@/hooks/useStripePayments';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import {
  cancelSubscription,
  createSetupIntent,
  createSubscription,
  finalizePaymentMethod,
  isStripeTestMode,
} from '@/services/stripe';
import { notify } from '@/utils/confirm';

const PRO_FEATURES = [
  'Insights dashboard (revenue, repeat rate, cancellations, service mix)',
  'AI chat assistant for your customers, with escalation when it needs you',
  'Priority support',
];

export default function PlanScreen() {
  const router = useRouter();
  const { groomerProfile, refreshGroomerProfile } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripePayments();
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      const [billingResult, groomerResult] = await Promise.all([
        supabase.from('customer_billing').select('user_id').eq('user_id', session.user.id).maybeSingle(),
        supabase
          .from('groomers')
          .select('stripe_cancel_at_period_end, plan_current_period_end')
          .eq('id', groomerProfile.id)
          .single(),
      ]);
      setHasPaymentMethod(Boolean(billingResult.data));
      setCancelAtPeriodEnd(Boolean(groomerResult.data?.stripe_cancel_at_period_end));
      setPeriodEnd(groomerResult.data?.plan_current_period_end ?? null);
    }

    setLoading(false);
  }, [groomerProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function ensurePaymentMethod() {
    if (hasPaymentMethod) return true;

    const { setupIntentClientSecret } = await createSetupIntent();

    const { error: initError } = await initPaymentSheet({
      merchantDisplayName: 'PawBooker',
      setupIntentClientSecret,
      allowsDelayedPaymentMethods: false,
      link: { display: LinkDisplay.NEVER },
      applePay: {
        merchantCountryCode: 'US',
        buttonType: PlatformPay.ButtonType.SetUp,
        cartItems: [{ paymentType: 'Immediate', label: 'No charge today', amount: '0.00' }],
      },
      googlePay: { merchantCountryCode: 'US', currencyCode: 'USD', testEnv: isStripeTestMode },
    });
    if (initError) throw new Error(initError.message);

    const { error: presentError } = await presentPaymentSheet();
    if (presentError) {
      if (presentError.code === 'Canceled') return false;
      throw new Error(presentError.message);
    }

    const setupIntentId = setupIntentClientSecret.split('_secret_')[0];
    await finalizePaymentMethod(setupIntentId);
    setHasPaymentMethod(true);
    return true;
  }

  async function handleUpgrade() {
    setWorking(true);
    try {
      const ready = await ensurePaymentMethod();
      if (!ready) return;

      await createSubscription();
      await refreshGroomerProfile();
      notify('You’re on Pro!', 'Insights and the AI assistant are now unlocked.');
    } catch (err) {
      notify('Upgrade failed', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setWorking(false);
    }
  }

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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
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
        ) : isPro && cancelAtPeriodEnd ? (
          <View style={styles.cancelNotice}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.light.textMuted} />
            <Text style={styles.cancelNoticeText}>
              Your subscription is set to cancel{periodEndLabel ? ` on ${periodEndLabel}` : ''}. You&apos;ll
              keep Pro access until then.
            </Text>
          </View>
        ) : isPro ? (
          <Pressable style={styles.cancelButton} onPress={handleCancel} disabled={working}>
            {working ? (
              <ActivityIndicator color={Colors.light.danger} size="small" />
            ) : (
              <Text style={styles.cancelButtonText}>Cancel subscription</Text>
            )}
          </Pressable>
        ) : (
          <Pressable style={styles.upgradeButton} onPress={handleUpgrade} disabled={working}>
            {working ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.upgradeButtonText}>Upgrade to Pro — $35/mo</Text>
            )}
          </Pressable>
        )}
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
    borderRadius: 14,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    marginBottom: 24,
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
    color: '#fff',
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
  upgradeButton: {
    marginTop: 20,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 20,
    height: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.danger,
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
