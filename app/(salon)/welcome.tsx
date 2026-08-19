import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

type StepState = {
  hasServices: boolean;
  hasHours: boolean;
  hasSupplies: boolean;
  hasStaff: boolean;
};

type SalonRoute =
  | '/(salon)/business-info'
  | '/(salon)/services'
  | '/(salon)/hours'
  | '/(salon)/payouts'
  | '/(salon)/supplies'
  | '/(salon)/staff'
  | '/(salon)/vaccination';

type Step = {
  key: string;
  title: string;
  subtitle: string;
  done: boolean;
  required: boolean;
  route: SalonRoute;
};

export default function SalonWelcomeScreen() {
  const router = useRouter();
  const { groomerProfile, refreshGroomerProfile } = useAuth();
  const [state, setState] = useState<StepState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);
    await refreshGroomerProfile();

    const [servicesResult, suppliesResult, staffResult, groomerResult] = await Promise.all([
      supabase
        .from('groomer_services')
        .select('id', { count: 'exact', head: true })
        .eq('groomer_id', groomerProfile.id),
      supabase
        .from('groomer_supplies')
        .select('id', { count: 'exact', head: true })
        .eq('groomer_id', groomerProfile.id),
      supabase
        .from('salon_staff')
        .select('id', { count: 'exact', head: true })
        .eq('salon_id', groomerProfile.id)
        .eq('active', true),
      supabase.from('groomers').select('hours').eq('id', groomerProfile.id).single(),
    ]);

    const hours = groomerResult.data?.hours as Record<string, unknown> | null;
    const hasHours = Boolean(hours && Object.values(hours).some((day) => day != null));

    setState({
      hasServices: (servicesResult.count ?? 0) > 0,
      hasSupplies: (suppliesResult.count ?? 0) > 0,
      hasStaff: (staffResult.count ?? 0) > 0,
      hasHours,
    });
    setLoading(false);
  }, [groomerProfile, refreshGroomerProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const payoutsEnabled = Boolean(groomerProfile?.payoutsEnabled);

  const steps: Step[] = [
    {
      key: 'business',
      title: 'Create your business',
      subtitle: 'Name and address added',
      done: true,
      required: true,
      route: '/(salon)/business-info',
    },
    {
      key: 'services',
      title: 'Add your services',
      subtitle: 'What you offer, with prices and durations',
      done: Boolean(state?.hasServices),
      required: true,
      route: '/(salon)/services',
    },
    {
      key: 'hours',
      title: 'Set your hours',
      subtitle: 'When customers can book you',
      done: Boolean(state?.hasHours),
      required: true,
      route: '/(salon)/hours',
    },
    {
      key: 'payouts',
      title: 'Connect payouts',
      subtitle: 'Get paid for bookings via Stripe',
      done: payoutsEnabled,
      required: true,
      route: '/(salon)/payouts',
    },
    {
      key: 'staff',
      title: 'Add your groomers',
      subtitle: "Let customers book a specific groomer (skip if it's just you)",
      done: Boolean(state?.hasStaff),
      required: false,
      route: '/(salon)/staff',
    },
    {
      key: 'supplies',
      title: 'Add your supplies',
      subtitle: 'Track inventory and get low-stock reminders',
      done: Boolean(state?.hasSupplies),
      required: false,
      route: '/(salon)/supplies',
    },
    {
      key: 'vaccination',
      title: 'Vaccination requirement',
      subtitle: 'Require a current rabies vaccination on file to book (on by default)',
      done: true,
      required: false,
      route: '/(salon)/vaccination',
    },
  ];

  const requiredDone = steps.filter((s) => s.required && s.done).length;
  const requiredTotal = steps.filter((s) => s.required).length;
  const isLive = requiredDone === requiredTotal;
  const totalDone = steps.filter((s) => s.done).length;
  const totalSteps = steps.length;
  const progressPct = totalSteps > 0 ? Math.round((totalDone / totalSteps) * 100) : 0;

  return (
    <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
      <ScrollView style={webFlushScroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, webContentWidth('form')]}>
        <Text style={styles.title}>Welcome to PawBooker</Text>
        <Text style={styles.subtitle}>
          Finish these steps so customers can book you and you get paid. You&apos;re listed as soon as
          you add a service.
        </Text>

        <View style={[styles.statusBanner, isLive ? styles.statusLive : styles.statusPending]}>
          <View style={styles.statusHeaderRow}>
            <Ionicons
              name={isLive ? 'checkmark-circle' : 'time-outline'}
              size={20}
              color={isLive ? Colors.light.success : Colors.light.warning}
            />
            <Text style={styles.statusText}>
              {isLive
                ? "You're all set — ready to take bookings and get paid."
                : `${requiredDone} of ${requiredTotal} required steps done`}
            </Text>
          </View>

          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${progressPct}%` },
                isLive ? styles.progressBarFillLive : styles.progressBarFillPending,
              ]}
            />
          </View>
          <Text style={styles.progressCaption}>
            {totalDone} of {totalSteps} steps completed
          </Text>
        </View>

        {loading && !state ? (
          <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
        ) : (
          steps.map((step) => (
            <Pressable key={step.key} style={styles.stepRow} onPress={() => router.push(step.route)}>
              <Ionicons
                name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={26}
                color={step.done ? Colors.light.success : Colors.light.textMuted}
              />
              <View style={styles.stepBody}>
                <View style={styles.stepTitleRow}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  {!step.required && <Text style={styles.optionalTag}>Optional</Text>}
                </View>
                <Text style={styles.stepSubtitle}>{step.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.light.textMuted} />
            </Pressable>
          ))
        )}

        <Pressable style={styles.dashboardButton} onPress={() => router.replace('/(salon)')}>
          <Text style={styles.dashboardButtonText}>Go to dashboard</Text>
        </Pressable>
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
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
    marginTop: 8,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.light.textMuted,
  },
  statusBanner: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  statusLive: {
    backgroundColor: 'rgba(169,203,173,0.18)',
  },
  statusPending: {
    backgroundColor: 'rgba(208,142,123,0.16)',
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    marginTop: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressBarFillLive: {
    backgroundColor: Colors.light.success,
  },
  progressBarFillPending: {
    backgroundColor: Colors.light.warning,
  },
  progressCaption: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    color: Colors.light.textMuted,
  },
  loading: {
    marginTop: 24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    marginBottom: 12,
  },
  stepBody: {
    flex: 1,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  optionalTag: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.textMuted,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  stepSubtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textMuted,
  },
  dashboardButton: {
    marginTop: 12,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  dashboardButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
});
