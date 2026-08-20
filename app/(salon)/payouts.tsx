import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import { createConnectDashboardLink, createConnectOnboardingLink } from '@/services/stripe';
import { notify } from '@/utils/confirm';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

type ConnectStatus = {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

export default function PayoutsScreen() {
  const router = useRouter();
  const { groomerProfile, refreshGroomerProfile } = useAuth();
  const groomerId = groomerProfile?.id;
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [feesThisMonthCents, setFeesThisMonthCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!groomerId) return;
    setLoading(true);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [groomerResult, feesResult] = await Promise.all([
      supabase
        .from('groomers')
        .select('stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
        .eq('id', groomerId)
        .single(),
      supabase
        .from('bookings')
        .select('platform_fee_cents')
        .eq('groomer_id', groomerId)
        .eq('status', 'completed')
        .gte('invoice_sent_at', monthStart.toISOString()),
    ]);

    const data = groomerResult.data;
    setStatus(
      data
        ? {
            accountId: data.stripe_connect_account_id,
            chargesEnabled: data.stripe_connect_charges_enabled,
            payoutsEnabled: data.stripe_connect_payouts_enabled,
          }
        : null
    );
    setFeesThisMonthCents((feesResult.data ?? []).reduce((sum, row) => sum + (row.platform_fee_cents ?? 0), 0));
    setLoading(false);
    await refreshGroomerProfile();
  }, [groomerId, refreshGroomerProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isFullySetUp = Boolean(status?.chargesEnabled && status?.payoutsEnabled);
  const isPro = groomerProfile?.plan === 'pro';

  async function handleSetUpPayouts() {
    setWorking(true);
    try {
      const { url } = await createConnectOnboardingLink();
      await Linking.openURL(url);
    } catch (err) {
      notify('Could not start setup', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setWorking(false);
    }
  }

  async function handleViewDashboard() {
    setWorking(true);
    try {
      const { url } = await createConnectDashboardLink();
      await Linking.openURL(url);
    } catch (err) {
      notify('Could not open dashboard', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>

      <ScrollView style={webFlushScroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, webContentWidth('form')]}>
        <Text style={styles.title}>Payouts</Text>
        <Text style={styles.subtitle}>
          Connect a bank account so booking payments and tips get deposited directly to you.
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
        ) : (
          <>
            <View style={[styles.statusCard, isFullySetUp && styles.statusCardActive]}>
              <Ionicons
                name={isFullySetUp ? 'checkmark-circle' : 'time-outline'}
                size={22}
                color={isFullySetUp ? Colors.light.text : Colors.light.textMuted}
              />
              <View style={styles.statusTextWrap}>
                <Text style={[styles.statusTitle, isFullySetUp && styles.statusTitleActive]}>
                  {isFullySetUp
                    ? 'Payouts active'
                    : status?.accountId
                      ? 'Setup incomplete'
                      : 'Not set up yet'}
                </Text>
                <Text style={[styles.statusSubtitle, isFullySetUp && styles.statusTitleActive]}>
                  {isFullySetUp
                    ? 'Your bookings and tips are deposited to your bank account.'
                    : status?.accountId
                      ? 'Finish a few more steps with Stripe to start receiving payouts.'
                      : 'Until this is set up, your booking payments stay on PawBooker’s account.'}
                </Text>
              </View>
            </View>

            <Button
              label={isFullySetUp ? 'View payout details' : status?.accountId ? 'Continue setup' : 'Connect your bank account'}
              onPress={isFullySetUp ? handleViewDashboard : handleSetUpPayouts}
              loading={working}
              style={styles.actionButton}
            />

            <View style={styles.feeCard}>
              <Text style={styles.feeCardLabel}>PawBooker fees this month</Text>
              <Text style={styles.feeCardAmount}>${(feesThisMonthCents / 100).toFixed(2)}</Text>
              {isPro ? (
                <Text style={styles.feeCardNote}>
                  You&apos;re on Pro — a flat $35/month with no per-booking acquisition fees.
                </Text>
              ) : (
                <>
                  <Text style={styles.feeCardNote}>
                    A one-time 5% fee applies to each new customer&apos;s first booking. Pro is a flat
                    $35/month with no acquisition fees.
                  </Text>
                  <Pressable onPress={() => router.push('/(salon)/plan')}>
                    <Text style={styles.feeCardLink}>See how Pro compares →</Text>
                  </Pressable>
                </>
              )}
            </View>
          </>
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
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 24,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textMuted,
  },
  loading: {
    marginTop: 24,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  statusCardActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  statusTextWrap: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  statusTitleActive: {
    color: Colors.light.text,
  },
  statusSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textMuted,
  },
  actionButton: {
    marginTop: 20,
    width: '100%',
  },
  feeCard: {
    marginTop: 28,
    padding: 18,
    borderRadius: 16,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  feeCardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textMuted,
  },
  feeCardAmount: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '800',
    color: Colors.light.text,
  },
  feeCardNote: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.light.textMuted,
  },
  feeCardLink: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
  },
});
