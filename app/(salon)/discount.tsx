import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import { parseMultiPetDiscount } from '@/utils/discount';
import { notify } from '@/utils/confirm';

const MIN_PET_OPTIONS = [2, 3, 4, 5];

export default function DiscountScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [minPets, setMinPets] = useState(3);
  const [type, setType] = useState<'percent' | 'flat'>('percent');
  const [value, setValue] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!groomerProfile) return;
      const { data } = await supabase
        .from('groomers')
        .select('multi_pet_discount')
        .eq('id', groomerProfile.id)
        .single();
      if (cancelled) return;

      const rule = parseMultiPetDiscount(data?.multi_pet_discount);
      if (rule) {
        setEnabled(true);
        setMinPets(rule.minPets);
        setType(rule.type);
        // Flat is stored in cents; show it in dollars.
        setValue(rule.type === 'percent' ? String(rule.value) : (rule.value / 100).toFixed(0));
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  async function handleSave() {
    if (!groomerProfile) return;

    let payload: { min_pets: number; type: 'percent' | 'flat'; value: number } | null = null;

    if (enabled) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        notify('Check your discount', 'Enter a discount amount greater than zero.');
        return;
      }
      if (type === 'percent' && numeric > 100) {
        notify('Check your discount', "A percentage discount can't be more than 100%.");
        return;
      }
      payload = {
        min_pets: minPets,
        type,
        // Store flat discounts in cents to match the rest of our money handling.
        value: type === 'percent' ? Math.round(numeric) : Math.round(numeric * 100),
      };
    }

    setSaving(true);
    const { error } = await supabase
      .from('groomers')
      .update({ multi_pet_discount: payload })
      .eq('id', groomerProfile.id);
    setSaving(false);

    if (error) {
      notify('Could not save', error.message);
      return;
    }
    notify('Saved', enabled ? 'Your multi-pet discount is live.' : 'Multi-pet discount turned off.');
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Multi-pet discount</Text>
        <Text style={styles.subtitle}>
          Reward customers who bring more than one pet at once. You set the rule — it applies
          automatically when they book a group, and you can still adjust any invoice at checkout.
        </Text>

        <View style={styles.enableRow}>
          <Text style={styles.enableLabel}>Offer a multi-pet discount</Text>
          <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: Colors.light.tint }} />
        </View>

        {enabled && (
          <>
            <Text style={styles.sectionTitle}>Applies when a customer books at least</Text>
            <View style={styles.chipRow}>
              {MIN_PET_OPTIONS.map((count) => {
                const isSelected = minPets === count;
                return (
                  <Pressable
                    key={count}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setMinPets(count)}>
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {count} pets
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Discount type</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, type === 'percent' && styles.chipSelected]}
                onPress={() => setType('percent')}>
                <Text style={[styles.chipText, type === 'percent' && styles.chipTextSelected]}>
                  Percentage off
                </Text>
              </Pressable>
              <Pressable
                style={[styles.chip, type === 'flat' && styles.chipSelected]}
                onPress={() => setType('flat')}>
                <Text style={[styles.chipText, type === 'flat' && styles.chipTextSelected]}>
                  Dollar amount off
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Amount</Text>
            <View style={styles.amountRow}>
              {type === 'flat' && <Text style={styles.amountAffix}>$</Text>}
              <TextInput
                style={styles.amountInput}
                placeholder={type === 'percent' ? '10' : '15'}
                placeholderTextColor={Colors.light.textMuted}
                keyboardType="number-pad"
                value={value}
                onChangeText={setValue}
              />
              {type === 'percent' && <Text style={styles.amountAffix}>%</Text>}
            </View>
            <Text style={styles.helper}>
              {type === 'percent'
                ? `e.g. 10% off the whole visit when ${minPets}+ pets come in.`
                : `e.g. $15 off the whole visit when ${minPets}+ pets come in.`}
            </Text>
          </>
        )}

        <Pressable
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
        </Pressable>
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
    marginBottom: 20,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textMuted,
  },
  enableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  enableLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  chipSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  chipText: {
    fontSize: 14,
    color: Colors.light.text,
  },
  chipTextSelected: {
    color: '#fff',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountAffix: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.light.text,
  },
  amountInput: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Colors.light.text,
  },
  helper: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textMuted,
  },
  button: {
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
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
