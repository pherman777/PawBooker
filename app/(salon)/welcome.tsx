import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
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
  icon: keyof typeof Ionicons.glyphMap;
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
      icon: 'briefcase-outline',
    },
    {
      key: 'services',
      title: 'Add your services',
      subtitle: 'What you offer, with prices and durations',
      done: Boolean(state?.hasServices),
      required: true,
      route: '/(salon)/services',
      icon: 'cut-outline',
    },
    {
      key: 'hours',
      title: 'Set your hours',
      subtitle: 'When customers can book you',
      done: Boolean(state?.hasHours),
      required: true,
      route: '/(salon)/hours',
      icon: 'calendar-outline',
    },
    {
      key: 'payouts',
      title: 'Connect payouts',
      subtitle: 'Get paid for bookings via Stripe',
      done: payoutsEnabled,
      required: true,
      route: '/(salon)/payouts',
      icon: 'card-outline',
    },
    {
      key: 'staff',
      title: 'Add your groomers',
      subtitle: "Let customers book a specific groomer (skip if it's just you)",
      done: Boolean(state?.hasStaff),
      required: false,
      route: '/(salon)/staff',
      icon: 'people-outline',
    },
    {
      key: 'supplies',
      title: 'Add your supplies',
      subtitle: 'Track inventory and get low-stock reminders',
      done: Boolean(state?.hasSupplies),
      required: false,
      route: '/(salon)/supplies',
      icon: 'paw-outline',
    },
    {
      key: 'vaccination',
      title: 'Vaccination requirement',
      subtitle: 'Require a current rabies vaccination on file to book (on by default)',
      done: true,
      required: false,
      route: '/(salon)/vaccination',
      icon: 'shield-checkmark-outline',
    },
  ];

  const requiredSteps = steps.filter((s) => s.required);
  const optionalSteps = steps.filter((s) => !s.required);

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

        {isLive ? (
          <View style={styles.celebrateCard}>
            <View style={styles.seal}>
              <Ionicons name="paw" size={28} color={Colors.light.bandText} />
            </View>
            <Text style={styles.celebrateTitle}>You&rsquo;re live!</Text>
            <Text style={styles.celebrateText}>Customers can find and book you now. Nice work.</Text>
          </View>
        ) : (
          <View style={[styles.statusBanner, styles.statusPending]}>
            <View style={styles.statusHeaderRow}>
              <Ionicons name="time-outline" size={20} color={Colors.light.warning} />
              <Text style={styles.statusText}>{`${requiredDone} of ${requiredTotal} required steps done`}</Text>
            </View>

            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, styles.progressBarFillPending, { width: `${progressPct}%` }]} />
            </View>
            <Text style={styles.progressCaption}>
              {totalDone} of {totalSteps} steps completed
            </Text>
          </View>
        )}

        {loading && !state ? (
          <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>Required to go live</Text>
            {requiredSteps.map((step) => (
              <Pressable key={step.key} style={styles.stepRow} onPress={() => router.push(step.route)}>
                <View style={[styles.iconBadge, step.done ? styles.iconBadgeDone : styles.iconBadgePending]}>
                  <Ionicons name={step.icon} size={19} color={step.done ? Colors.light.tint : Colors.light.textMuted} />
                  {step.done && (
                    <View style={styles.badgeCheck}>
                      <Ionicons name="checkmark" size={9} color={Colors.light.bandText} />
                    </View>
                  )}
                </View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepSubtitle}>{step.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.light.textMuted} />
              </Pressable>
            ))}

            <Text style={styles.sectionLabel}>Optional</Text>
            {optionalSteps.map((step) => (
              <Pressable key={step.key} style={styles.stepRow} onPress={() => router.push(step.route)}>
                <View style={[styles.iconBadge, step.done ? styles.iconBadgeDone : styles.iconBadgePending]}>
                  <Ionicons name={step.icon} size={19} color={step.done ? Colors.light.tint : Colors.light.textMuted} />
                  {step.done && (
                    <View style={styles.badgeCheck}>
                      <Ionicons name="checkmark" size={9} color={Colors.light.bandText} />
                    </View>
                  )}
                </View>
                <View style={styles.stepBody}>
                  <View style={styles.stepTitleRow}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.optionalTag}>Optional</Text>
                  </View>
                  <Text style={styles.stepSubtitle}>{step.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.light.textMuted} />
              </Pressable>
            ))}
          </>
        )}

        <Button label="Go to dashboard" onPress={() => router.replace('/(salon)')} style={styles.dashboardButton} />
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
  celebrateCard: {
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 26,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 2,
  },
  seal: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  celebrateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 6,
  },
  celebrateText: {
    fontSize: 14,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
  statusPending: {
    // Matches dashboard's .statusPending (warning-tinted).
    backgroundColor: 'rgba(185,133,46,0.14)',
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
    // Was a white-alpha overlay for the old dark surface - now a solid
    // light recessed fill, matching dashboard's .progressTrack.
    backgroundColor: Colors.light.surfaceElevated,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
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
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.light.textMuted,
    marginTop: 18,
    marginBottom: 10,
    marginLeft: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 1,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBadgeDone: {
    backgroundColor: 'rgba(107,143,114,0.18)',
  },
  iconBadgePending: {
    backgroundColor: Colors.light.surfaceElevated,
  },
  badgeCheck: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.light.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.light.surface,
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
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  optionalTag: {
    fontSize: 10.5,
    fontWeight: '700',
    color: Colors.light.bandTextMuted,
    backgroundColor: Colors.light.band,
    paddingHorizontal: 7,
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
    width: '100%',
  },
});
