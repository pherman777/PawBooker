import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import type { GroomerSupply } from '@/types';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import { confirmAsync, notify } from '@/utils/confirm';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

function toNumber(text: string): number {
  const n = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export default function SuppliesScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [supplies, setSupplies] = useState<GroomerSupply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('unit');
  const [newQuantity, setNewQuantity] = useState('');
  const [newThreshold, setNewThreshold] = useState('');
  const [newReorderQuantity, setNewReorderQuantity] = useState('');

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    const { data, error: queryError } = await supabase
      .from('groomer_supplies')
      .select('id, groomer_id, name, unit, quantity_on_hand, reorder_threshold, reorder_quantity, created_at')
      .eq('groomer_id', groomerProfile.id)
      .order('name', { ascending: true });

    if (queryError) {
      setError(queryError.message);
    } else {
      setSupplies(
        (data ?? []).map((row) => ({
          id: row.id,
          groomerId: row.groomer_id,
          name: row.name,
          unit: row.unit,
          quantityOnHand: row.quantity_on_hand,
          reorderThreshold: row.reorder_threshold,
          reorderQuantity: row.reorder_quantity ?? undefined,
          createdAt: row.created_at,
        }))
      );
    }
    setLoading(false);
  }, [groomerProfile]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedSupplies = useMemo(
    () =>
      [...supplies].sort((a, b) => {
        const aLow = a.quantityOnHand <= a.reorderThreshold;
        const bLow = b.quantityOnHand <= b.reorderThreshold;
        if (aLow !== bLow) return aLow ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [supplies]
  );

  function updateLocal(id: string, field: 'quantityOnHand' | 'reorderThreshold' | 'reorderQuantity', value: number) {
    setSupplies((current) => current.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }

  async function persistField(
    supply: GroomerSupply,
    field: 'quantity_on_hand' | 'reorder_threshold' | 'reorder_quantity',
    value: number
  ) {
    const { error: updateError } = await supabase.from('groomer_supplies').update({ [field]: value }).eq('id', supply.id);
    if (updateError) {
      notify('Could not save', updateError.message);
    }
  }

  async function handleDelete(supply: GroomerSupply) {
    const confirmed = await confirmAsync('Remove supply', `Remove "${supply.name}" from your supply list?`);
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from('groomer_supplies').delete().eq('id', supply.id);
    if (deleteError) {
      notify('Could not remove', deleteError.message);
      return;
    }
    setSupplies((current) => current.filter((s) => s.id !== supply.id));
  }

  async function handleAdd() {
    if (!groomerProfile || !newName.trim()) {
      notify('Name required', 'Give the supply a name first.');
      return;
    }

    setAdding(true);
    const { data, error: insertError } = await supabase
      .from('groomer_supplies')
      .insert({
        groomer_id: groomerProfile.id,
        name: newName.trim(),
        unit: newUnit.trim() || 'unit',
        quantity_on_hand: toNumber(newQuantity),
        reorder_threshold: toNumber(newThreshold),
        reorder_quantity: newReorderQuantity ? toNumber(newReorderQuantity) : null,
      })
      .select('id, groomer_id, name, unit, quantity_on_hand, reorder_threshold, reorder_quantity, created_at')
      .single();
    setAdding(false);

    if (insertError || !data) {
      notify('Could not add supply', insertError?.message ?? 'Something went wrong.');
      return;
    }

    setSupplies((current) => [
      ...current,
      {
        id: data.id,
        groomerId: data.groomer_id,
        name: data.name,
        unit: data.unit,
        quantityOnHand: data.quantity_on_hand,
        reorderThreshold: data.reorder_threshold,
        reorderQuantity: data.reorder_quantity ?? undefined,
        createdAt: data.created_at,
      },
    ]);
    setNewName('');
    setNewUnit('unit');
    setNewQuantity('');
    setNewThreshold('');
    setNewReorderQuantity('');
    setShowAddForm(false);
  }

  return (
    <SafeAreaView style={[styles.container, webContentWidth('content')]} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>
      <Text style={styles.title}>Supplies</Text>
      <Text style={styles.subtitle}>Track what you have on hand and get flagged when it's time to reorder.</Text>

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}
      {error && <Text style={styles.error}>Couldn&apos;t load supplies: {error}</Text>}

      {!loading && !error && (
        <ScrollView style={webFlushScroll} contentContainerStyle={[styles.content, webContentWidth('content')]} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.addToggle} onPress={() => setShowAddForm((v) => !v)}>
            <Text style={styles.addToggleText}>{showAddForm ? 'Cancel' : '+ Add supply'}</Text>
          </Pressable>

          {showAddForm && (
            <View style={styles.addForm}>
              <TextInput style={styles.input} placeholder="Name (e.g. Shampoo)" value={newName} onChangeText={setNewName} />
              <TextInput style={styles.input} placeholder="Unit (e.g. bottles)" value={newUnit} onChangeText={setNewUnit} />
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputThird]}
                  placeholder="On hand"
                  value={newQuantity}
                  onChangeText={setNewQuantity}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, styles.inputThird]}
                  placeholder="Reorder at"
                  value={newThreshold}
                  onChangeText={setNewThreshold}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, styles.inputThird]}
                  placeholder="Reorder qty"
                  value={newReorderQuantity}
                  onChangeText={setNewReorderQuantity}
                  keyboardType="numeric"
                />
              </View>
              <Button label="Save" onPress={handleAdd} loading={adding} style={styles.saveButton} />
            </View>
          )}

          {sortedSupplies.length === 0 && !showAddForm && (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIllustration}>
                <Ionicons name="paw-outline" size={34} color={Colors.light.tint} />
              </View>
              <Text style={styles.emptyTitle}>No supplies tracked yet</Text>
              <Text style={styles.emptyBody}>
                Add what you keep on hand so you get flagged automatically when it's time to reorder.
              </Text>
              <Button label="+ Add supply" onPress={() => setShowAddForm(true)} />
            </View>
          )}

          {sortedSupplies.map((supply) => {
            const isLow = supply.quantityOnHand <= supply.reorderThreshold;
            return (
              <View key={supply.id} style={[styles.card, isLow && styles.cardLow]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardName}>{supply.name}</Text>
                  {isLow && (
                    <View style={styles.lowBadge}>
                      <Text style={styles.lowBadgeText}>Reorder</Text>
                    </View>
                  )}
                </View>

                <View style={styles.fieldsRow}>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>On hand ({supply.unit})</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={String(supply.quantityOnHand)}
                      keyboardType="numeric"
                      onChangeText={(text) => updateLocal(supply.id, 'quantityOnHand', toNumber(text))}
                      onBlur={() => persistField(supply, 'quantity_on_hand', supply.quantityOnHand)}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Reorder at</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={String(supply.reorderThreshold)}
                      keyboardType="numeric"
                      onChangeText={(text) => updateLocal(supply.id, 'reorderThreshold', toNumber(text))}
                      onBlur={() => persistField(supply, 'reorder_threshold', supply.reorderThreshold)}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Reorder qty</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={supply.reorderQuantity != null ? String(supply.reorderQuantity) : ''}
                      keyboardType="numeric"
                      placeholder="-"
                      onChangeText={(text) => updateLocal(supply.id, 'reorderQuantity', toNumber(text))}
                      onBlur={() => persistField(supply, 'reorder_quantity', supply.reorderQuantity ?? 0)}
                    />
                  </View>
                </View>

                <Pressable style={styles.deleteLink} onPress={() => handleDelete(supply)}>
                  <Text style={styles.deleteLinkText}>Remove</Text>
                </Pressable>
              </View>
            );
          })}
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
  inputThird: {
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
  cardLow: {
    borderColor: Colors.light.danger,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  lowBadge: {
    backgroundColor: Colors.light.danger,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lowBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
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
