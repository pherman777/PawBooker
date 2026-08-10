import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TimePickerModal } from '@/components/TimePickerModal';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import type { GroomerHours } from '@/types';
import { DAYS_OF_WEEK, dayLabel, formatTime } from '@/utils/hours';
import { notify } from '@/utils/confirm';

type DayDraft = {
  enabled: boolean;
  open: string;
  close: string;
};

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '17:00';

type PickerTarget = { day: string; field: 'open' | 'close' };

export default function HoursScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, DayDraft>>({});
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!groomerProfile) return;
      const { data } = await supabase
        .from('groomers')
        .select('hours')
        .eq('id', groomerProfile.id)
        .single();
      if (cancelled) return;

      const hours = (data?.hours ?? null) as GroomerHours | null;
      const initial: Record<string, DayDraft> = {};
      for (const day of DAYS_OF_WEEK) {
        const existing = hours?.[day];
        initial[day] = existing
          ? { enabled: true, open: existing.open, close: existing.close }
          : { enabled: false, open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
      }
      setDraft(initial);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  function setDay(day: string, patch: Partial<DayDraft>) {
    setDraft((current) => ({ ...current, [day]: { ...current[day], ...patch } }));
  }

  async function handleSave() {
    if (!groomerProfile) return;

    const hours: Record<string, { open: string; close: string } | null> = {};
    for (const day of DAYS_OF_WEEK) {
      const entry = draft[day];
      if (!entry?.enabled) {
        hours[day] = null;
        continue;
      }
      // Values come from the picker, so they're already valid HH:MM; just guard
      // that closing is after opening (string compare works for zero-padded 24h).
      if (entry.open >= entry.close) {
        notify('Check your times', `Closing time must be after opening time on ${dayLabel(day as keyof GroomerHours)}.`);
        return;
      }
      hours[day] = { open: entry.open, close: entry.close };
    }

    setSaving(true);
    const { error } = await supabase.from('groomers').update({ hours }).eq('id', groomerProfile.id);
    setSaving(false);

    if (error) {
      notify('Could not save', error.message);
      return;
    }
    notify('Saved', 'Your hours have been updated.');
    router.back();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Hours</Text>
        <Text style={styles.subtitle}>Turn on the days you&apos;re open and tap a time to set your hours.</Text>

        {DAYS_OF_WEEK.map((day) => {
          const entry = draft[day];
          return (
            <View key={day} style={styles.dayRow}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{dayLabel(day)}</Text>
                <Switch
                  value={entry?.enabled ?? false}
                  onValueChange={(value) => setDay(day, { enabled: value })}
                  trackColor={{ true: Colors.light.tint }}
                />
              </View>
              {entry?.enabled && (
                <View style={styles.timesRow}>
                  <Pressable style={styles.timeField} onPress={() => setPicker({ day, field: 'open' })}>
                    <Text style={styles.timeFieldText}>{formatTime(entry.open)}</Text>
                  </Pressable>
                  <Text style={styles.toLabel}>to</Text>
                  <Pressable style={styles.timeField} onPress={() => setPicker({ day, field: 'close' })}>
                    <Text style={styles.timeFieldText}>{formatTime(entry.close)}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        <Pressable
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
        </Pressable>
      </ScrollView>

      <TimePickerModal
        visible={picker != null}
        value={picker ? draft[picker.day]?.[picker.field] ?? DEFAULT_OPEN : DEFAULT_OPEN}
        title={
          picker
            ? `${dayLabel(picker.day as keyof GroomerHours)} ${picker.field === 'open' ? 'opening' : 'closing'} time`
            : undefined
        }
        onSelect={(value) => {
          if (picker) setDay(picker.day, { [picker.field]: value });
        }}
        onDismiss={() => setPicker(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: 20,
  },
  loading: {
    marginTop: 60,
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
    paddingTop: 12,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textMuted,
  },
  dayRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  timesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  timeField: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeFieldText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  toLabel: {
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  button: {
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
