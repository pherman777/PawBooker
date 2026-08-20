import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import type { CustomerReminder } from '@/types';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import { notify } from '@/utils/confirm';
import { sendCustomerReminder } from '@/services/notifications';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

function monthsAgo(dateString: string): string {
  const months = Math.max(1, Math.round((Date.now() - new Date(dateString).getTime()) / (30 * 86400000)));
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export default function RemindersScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [reminders, setReminders] = useState<CustomerReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (groomerProfile && groomerProfile.plan !== 'pro') {
      router.replace('/(salon)/plan');
    }
  }, [groomerProfile, router]);

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    const { data, error: queryError } = await supabase
      .from('customer_reminders')
      .select('id, groomer_id, customer_id, customer_email, last_booking_at, draft_subject, draft_body, status, created_at, sent_at')
      .eq('groomer_id', groomerProfile.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
    } else {
      setReminders(
        (data ?? []).map((row) => ({
          id: row.id,
          groomerId: row.groomer_id,
          customerId: row.customer_id,
          customerEmail: row.customer_email,
          lastBookingAt: row.last_booking_at,
          draftSubject: row.draft_subject,
          draftBody: row.draft_body,
          status: row.status,
          createdAt: row.created_at,
          sentAt: row.sent_at ?? undefined,
        }))
      );
    }
    setLoading(false);
  }, [groomerProfile]);

  useEffect(() => {
    load();
  }, [load]);

  function updateLocal(id: string, field: 'draftSubject' | 'draftBody', value: string) {
    setReminders((current) => current.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function handleSend(reminder: CustomerReminder) {
    setBusyId(reminder.id);
    try {
      const { error: updateError } = await supabase
        .from('customer_reminders')
        .update({ draft_subject: reminder.draftSubject, draft_body: reminder.draftBody })
        .eq('id', reminder.id);
      if (updateError) throw updateError;

      await sendCustomerReminder(reminder.id);
      setReminders((current) => current.filter((r) => r.id !== reminder.id));
      notify('Reminder sent', `Emailed ${reminder.customerEmail}.`);
    } catch (err) {
      notify('Could not send reminder', err instanceof Error ? err.message : 'Something went wrong.');
    }
    setBusyId(null);
  }

  async function handleDismiss(reminder: CustomerReminder) {
    setBusyId(reminder.id);
    const { error: updateError } = await supabase
      .from('customer_reminders')
      .update({ status: 'dismissed' })
      .eq('id', reminder.id);
    setBusyId(null);

    if (updateError) {
      notify('Could not dismiss', updateError.message);
      return;
    }
    setReminders((current) => current.filter((r) => r.id !== reminder.id));
  }

  return (
    <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>
      <Text style={styles.title}>Win-back reminders</Text>
      <Text style={styles.subtitle}>
        Customers who haven&apos;t booked in a while. Edit the draft if you&apos;d like, then send.
      </Text>

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}
      {error && <Text style={styles.error}>Couldn&apos;t load reminders: {error}</Text>}

      {!loading && !error && (
        <ScrollView style={webFlushScroll} contentContainerStyle={[styles.content, webContentWidth('form')]} showsVerticalScrollIndicator={false}>
          {reminders.length === 0 && (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIllustration}>
                <Ionicons name="mail-outline" size={34} color={Colors.light.tint} />
              </View>
              <Text style={styles.emptyTitle}>No lapsed customers right now</Text>
              <Text style={styles.emptyBody}>
                Nice work staying booked up — we&apos;ll draft a reminder here the next time
                someone&apos;s overdue.
              </Text>
            </View>
          )}

          {reminders.map((reminder) => (
            <View key={reminder.id} style={styles.card}>
              <Text style={styles.cardMeta}>
                {reminder.customerEmail} · last booked {monthsAgo(reminder.lastBookingAt)}
              </Text>

              <Text style={styles.fieldLabel}>Subject</Text>
              <TextInput
                style={styles.subjectInput}
                value={reminder.draftSubject}
                onChangeText={(text) => updateLocal(reminder.id, 'draftSubject', text)}
                editable={busyId !== reminder.id}
              />

              <Text style={styles.fieldLabel}>Message</Text>
              <TextInput
                style={styles.bodyInput}
                value={reminder.draftBody}
                onChangeText={(text) => updateLocal(reminder.id, 'draftBody', text)}
                editable={busyId !== reminder.id}
                multiline
                textAlignVertical="top"
              />

              <View style={styles.actions}>
                <Button
                  label="Dismiss"
                  variant="danger"
                  onPress={() => handleDismiss(reminder)}
                  disabled={busyId === reminder.id}
                  style={styles.actionButton}
                />
                <Button
                  label="Send"
                  onPress={() => handleSend(reminder)}
                  loading={busyId === reminder.id}
                  disabled={busyId === reminder.id}
                  style={styles.actionButton}
                />
              </View>
            </View>
          ))}
        </ScrollView>
      )}
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
  title: {
    marginTop: 12,
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  loading: {
    marginTop: 40,
  },
  error: {
    marginTop: 24,
    fontSize: 15,
    color: Colors.light.danger,
  },
  content: {
    paddingTop: 24,
    paddingBottom: 40,
    gap: 16,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.light.border,
    borderRadius: 20,
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIllustration: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(107,143,114,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  cardMeta: {
    fontSize: 13,
    color: Colors.light.textMuted,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textMuted,
    marginBottom: 4,
  },
  subjectInput: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  bodyInput: {
    fontSize: 14,
    color: Colors.light.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 90,
    marginBottom: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
});
