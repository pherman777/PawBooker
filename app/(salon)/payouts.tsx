import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import { createConnectDashboardLink, createConnectOnboardingLink } from '@/services/stripe';
import { notify } from '@/utils/confirm';

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
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!groomerId) return;
    setLoading(true);

    const { data } = await supabase
      .from('groomers')
      .select('stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
      .eq('id', groomerId)
      .single();

    setStatus(
      data
        ? {
            accountId: data.stripe_connect_account_id,
            chargesEnabled: data.stripe_connect_charges_enabled,
            payoutsEnabled: data.stripe_connect_payouts_enabled,
          }
        : null
    );
    setLoading(false);
    await refreshGroomerProfile();
  }, [groomerId, refreshGroomerProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isFullySetUp = Boolean(status?.chargesEnabled && status?.payoutsEnabled);

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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
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
                color={isFullySetUp ? '#fff' : Colors.light.textMuted}
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

            <Pressable
              style={[styles.actionButton, working && styles.buttonDisabled]}
              onPress={isFullySetUp ? handleViewDashboard : handleSetUpPayouts}
              disabled={working}>
              {working ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {isFullySetUp ? 'View payout details' : status?.accountId ? 'Continue setup' : 'Connect your bank account'}
                </Text>
              )}
            </Pressable>
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
    borderRadius: 14,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
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
    color: '#fff',
  },
  statusSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textMuted,
  },
  actionButton: {
    marginTop: 20,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
