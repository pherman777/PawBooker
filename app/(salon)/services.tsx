import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import { confirmAsync, notify } from '@/utils/confirm';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

type Service = {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  description: string;
};

function dollarsToCents(text: string): number {
  const n = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function toInt(text: string): number {
  const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export default function ServicesScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    const { data, error: queryError } = await supabase
      .from('groomer_services')
      .select('id, name, price_cents, duration_minutes, description')
      .eq('groomer_id', groomerProfile.id)
      .order('name', { ascending: true });

    if (queryError) {
      setError(queryError.message);
    } else {
      setServices(
        (data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          priceCents: row.price_cents,
          durationMinutes: row.duration_minutes,
          description: row.description ?? '',
        }))
      );
    }
    setLoading(false);
  }, [groomerProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function updateLocal(id: string, field: 'priceCents' | 'durationMinutes', value: number) {
    setServices((current) => current.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }

  function updateLocalDescription(id: string, value: string) {
    setServices((current) => current.map((s) => (s.id === id ? { ...s, description: value } : s)));
  }

  async function persistField(id: string, field: 'price_cents' | 'duration_minutes', value: number) {
    const { error: updateError } = await supabase
      .from('groomer_services')
      .update({ [field]: value })
      .eq('id', id);
    if (updateError) {
      notify('Could not save', updateError.message);
    }
  }

  async function persistDescription(id: string, value: string) {
    const { error: updateError } = await supabase
      .from('groomer_services')
      .update({ description: value.trim() || null })
      .eq('id', id);
    if (updateError) {
      notify('Could not save', updateError.message);
    }
  }

  async function handleDelete(service: Service) {
    const confirmed = await confirmAsync('Remove service', `Remove "${service.name}" from your services?`);
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from('groomer_services').delete().eq('id', service.id);
    if (deleteError) {
      notify('Could not remove', deleteError.message);
      return;
    }
    setServices((current) => current.filter((s) => s.id !== service.id));
  }

  async function handleAdd() {
    if (!groomerProfile || !newName.trim()) {
      notify('Name required', 'Give the service a name first.');
      return;
    }
    const priceCents = dollarsToCents(newPrice);
    const durationMinutes = toInt(newDuration);
    if (priceCents <= 0) {
      notify('Price required', 'Enter a price greater than $0.');
      return;
    }
    if (durationMinutes <= 0) {
      notify('Duration required', 'Enter how long the service takes, in minutes.');
      return;
    }

    setAdding(true);
    const { data, error: insertError } = await supabase
      .from('groomer_services')
      .insert({
        groomer_id: groomerProfile.id,
        name: newName.trim(),
        price_cents: priceCents,
        duration_minutes: durationMinutes,
        description: newDescription.trim() || null,
      })
      .select('id, name, price_cents, duration_minutes, description')
      .single();
    setAdding(false);

    if (insertError || !data) {
      notify('Could not add service', insertError?.message ?? 'Something went wrong.');
      return;
    }

    setServices((current) => [
      ...current,
      {
        id: data.id,
        name: data.name,
        priceCents: data.price_cents,
        durationMinutes: data.duration_minutes,
        description: data.description ?? '',
      },
    ]);
    setNewName('');
    setNewPrice('');
    setNewDuration('');
    setNewDescription('');
    setShowAddForm(false);
  }

  return (
    <SafeAreaView style={[styles.container, webContentWidth('content')]} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>
      <Text style={styles.title}>Services</Text>
      <Text style={styles.subtitle}>
        The services customers can book, with prices and how long each takes. You can update prices
        any time.
      </Text>

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}
      {error && <Text style={styles.error}>Couldn&apos;t load services: {error}</Text>}

      {!loading && !error && (
        <ScrollView style={webFlushScroll} contentContainerStyle={[styles.content, webContentWidth('content')]} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.addToggle} onPress={() => setShowAddForm((v) => !v)}>
            <Text style={styles.addToggleText}>{showAddForm ? 'Cancel' : '+ Add service'}</Text>
          </Pressable>

          {showAddForm && (
            <View style={styles.addForm}>
              <TextInput
                style={styles.input}
                placeholder="Name (e.g. Full groom - small dog)"
                placeholderTextColor={Colors.light.textMuted}
                value={newName}
                onChangeText={setNewName}
              />
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Price ($)"
                  placeholderTextColor={Colors.light.textMuted}
                  value={newPrice}
                  onChangeText={setNewPrice}
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Minutes"
                  placeholderTextColor={Colors.light.textMuted}
                  value={newDuration}
                  onChangeText={setNewDuration}
                  keyboardType="numeric"
                />
              </View>
              <TextInput
                style={[styles.input, styles.descriptionInput]}
                placeholder="Description (optional) — what this service includes"
                placeholderTextColor={Colors.light.textMuted}
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
              />
              <Button label="Save" onPress={handleAdd} loading={adding} style={styles.saveButton} />
            </View>
          )}

          {services.length === 0 && !showAddForm && (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIllustration}>
                <Ionicons name="cut-outline" size={34} color={Colors.light.tint} />
              </View>
              <Text style={styles.emptyTitle}>No services yet</Text>
              <Text style={styles.emptyBody}>
                Add your first one so customers have something to book — pricing and duration only take a
                minute.
              </Text>
              <Button label="+ Add service" onPress={() => setShowAddForm(true)} />
            </View>
          )}

          {services.map((service) => (
            <View key={service.id} style={styles.card}>
              <Text style={styles.cardName}>{service.name}</Text>
              <View style={styles.fieldsRow}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Price ($)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    defaultValue={centsToDollars(service.priceCents)}
                    keyboardType="decimal-pad"
                    onChangeText={(text) => updateLocal(service.id, 'priceCents', dollarsToCents(text))}
                    onBlur={() => persistField(service.id, 'price_cents', service.priceCents)}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Duration (min)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={String(service.durationMinutes)}
                    keyboardType="numeric"
                    onChangeText={(text) => updateLocal(service.id, 'durationMinutes', toInt(text))}
                    onBlur={() => persistField(service.id, 'duration_minutes', service.durationMinutes)}
                  />
                </View>
              </View>
              <Text style={[styles.fieldLabel, styles.descriptionLabel]}>Description (optional)</Text>
              <TextInput
                style={[styles.fieldInput, styles.descriptionInput]}
                defaultValue={service.description}
                placeholder="What this service includes"
                placeholderTextColor={Colors.light.textMuted}
                multiline
                onChangeText={(text) => updateLocalDescription(service.id, text)}
                onBlur={() => persistDescription(service.id, service.description)}
              />
              <Pressable style={styles.deleteLink} onPress={() => handleDelete(service)}>
                <Text style={styles.deleteLinkText}>Remove</Text>
              </Pressable>
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
    lineHeight: 20,
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
    gap: 12,
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
    marginBottom: 20,
  },
  addToggle: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  addToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  addForm: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  input: {
    fontSize: 14,
    color: Colors.light.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputHalf: {
    flex: 1,
  },
  saveButton: {
    width: '100%',
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
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 12,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  field: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.textMuted,
    marginBottom: 4,
  },
  fieldInput: {
    fontSize: 14,
    color: Colors.light.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  descriptionInput: {
    minHeight: 60,
    paddingTop: 8,
    textAlignVertical: 'top',
  },
  descriptionLabel: {
    marginTop: 12,
  },
  deleteLink: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  deleteLinkText: {
    fontSize: 12,
    color: Colors.light.textMuted,
    textDecorationLine: 'underline',
  },
});
