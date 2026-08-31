import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { DatePickerModal } from '@/components/DatePickerModal';
import { Colors } from '@/constants/theme';
import { notify, confirmAsync } from '@/utils/confirm';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

type Closure = { id: string; start_date: string; end_date: string; note: string | null };

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(key: string): string {
  return fromDateKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClosuresScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [closures, setClosures] = useState<Closure[]>([]);

  const [adding, setAdding] = useState(false);
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!groomerProfile) return;
      const { data } = await supabase
        .from('groomer_closures')
        .select('id, start_date, end_date, note')
        .eq('groomer_id', groomerProfile.id)
        .gte('end_date', toDateKey(new Date()))
        .order('start_date', { ascending: true });
      if (cancelled) return;
      setClosures(data ?? []);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  async function handleAdd() {
    if (!groomerProfile || !draftStart) return;
    const end = draftEnd ?? draftStart;
    if (end < draftStart) {
      notify('Check your dates', 'The end date must be on or after the start date.');
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('groomer_closures')
      .insert({
        groomer_id: groomerProfile.id,
        start_date: toDateKey(draftStart),
        end_date: toDateKey(end),
        note: draftNote.trim() || null,
      })
      .select('id, start_date, end_date, note')
      .single();
    setSaving(false);

    if (error || !data) {
      notify('Could not add closure', error?.message ?? 'Please try again.');
      return;
    }

    setClosures((prev) => [...prev, data].sort((a, b) => a.start_date.localeCompare(b.start_date)));
    setAdding(false);
    setDraftStart(null);
    setDraftEnd(null);
    setDraftNote('');
  }

  async function handleDelete(closure: Closure) {
    const confirmed = await confirmAsync(
      'Remove this closure?',
      `${formatDate(closure.start_date)}${closure.end_date !== closure.start_date ? ` – ${formatDate(closure.end_date)}` : ''} will show as open again.`
    );
    if (!confirmed) return;

    const { error } = await supabase.from('groomer_closures').delete().eq('id', closure.id);
    if (error) {
      notify('Could not remove closure', error.message);
      return;
    }
    setClosures((prev) => prev.filter((c) => c.id !== closure.id));
  }

  return (
    <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>
      <ScrollView style={webFlushScroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, webContentWidth('form')]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Closures</Text>
        <Text style={styles.subtitle}>
          Mark holidays, vacation, or other days off. These override your regular hours - customers won&apos;t be able to book, and the AI assistants won&apos;t offer these dates.
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
        ) : (
          <>
            {closures.length === 0 && !adding && <Text style={styles.emptyText}>No upcoming closures.</Text>}

            {closures.map((closure) => (
              <View key={closure.id} style={styles.closureRow}>
                <View style={styles.closureInfo}>
                  <Text style={styles.closureDates}>
                    {formatDate(closure.start_date)}
                    {closure.end_date !== closure.start_date ? ` – ${formatDate(closure.end_date)}` : ''}
                  </Text>
                  {closure.note && <Text style={styles.closureNote}>{closure.note}</Text>}
                </View>
                <Pressable onPress={() => handleDelete(closure)} hitSlop={8}>
                  <Text style={styles.removeLink}>Remove</Text>
                </Pressable>
              </View>
            ))}

            {adding ? (
              <View style={styles.addForm}>
                <Text style={styles.fieldLabel}>From</Text>
                <Pressable style={styles.dateField} onPress={() => setPicker('start')}>
                  <Text style={styles.dateFieldText}>
                    {draftStart ? draftStart.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Select a date'}
                  </Text>
                </Pressable>

                <Text style={styles.fieldLabel}>To</Text>
                <Pressable style={styles.dateField} onPress={() => draftStart && setPicker('end')} disabled={!draftStart}>
                  <Text style={styles.dateFieldText}>
                    {(draftEnd ?? draftStart)
                      ? (draftEnd ?? draftStart)!.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Select a start date first'}
                  </Text>
                </Pressable>

                <Text style={styles.fieldLabel}>Note (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Vacation, Holiday"
                  placeholderTextColor={Colors.light.textMuted}
                  value={draftNote}
                  onChangeText={setDraftNote}
                />

                <View style={styles.addFormButtons}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onPress={() => {
                      setAdding(false);
                      setDraftStart(null);
                      setDraftEnd(null);
                      setDraftNote('');
                    }}
                    style={styles.addFormButton}
                  />
                  <Button
                    label="Save"
                    onPress={handleAdd}
                    loading={saving}
                    disabled={!draftStart}
                    style={styles.addFormButton}
                  />
                </View>
              </View>
            ) : (
              <Button label="+ Add a closure" variant="secondary" onPress={() => setAdding(true)} style={styles.addButton} />
            )}
          </>
        )}
      </ScrollView>

      <DatePickerModal
        visible={picker === 'start'}
        value={draftStart}
        title="Closed from"
        onSelect={(date) => {
          setDraftStart(date);
          if (!draftEnd || draftEnd < date) setDraftEnd(date);
        }}
        onDismiss={() => setPicker(null)}
      />
      <DatePickerModal
        visible={picker === 'end'}
        value={draftEnd ?? draftStart}
        minDate={draftStart ?? undefined}
        title="Closed through"
        onSelect={(date) => setDraftEnd(date)}
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
  emptyText: {
    fontSize: 14,
    color: Colors.light.textMuted,
    marginBottom: 16,
  },
  closureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 10,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  closureInfo: {
    flex: 1,
    marginRight: 12,
  },
  closureDates: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  closureNote: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  removeLink: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.danger,
  },
  addButton: {
    marginTop: 8,
  },
  addForm: {
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 8,
    marginTop: 12,
  },
  dateField: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  dateFieldText: {
    fontSize: 15,
    color: Colors.light.text,
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 12,
    fontSize: 15,
    color: Colors.light.text,
  },
  addFormButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  addFormButton: {
    flex: 1,
  },
});
