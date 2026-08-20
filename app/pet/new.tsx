import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BreedPicker } from '@/components/BreedPicker';
import {
  EMPTY_PET_IDENTITY,
  PetIdEmergencyFields,
  PetIdentity,
} from '@/components/PetIdEmergencyFields';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import type { Pet } from '@/types';
import { sanitizeDecimalInput } from '@/utils/number';

const PET_SPECIES: Pet['species'][] = ['dog', 'cat', 'other'];

export default function NewPetScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [name, setName] = useState('');
  const [species, setSpecies] = useState<Pet['species']>('dog');
  const [dogBreed, setDogBreed] = useState('');
  const [otherBreed, setOtherBreed] = useState('');
  const [color, setColor] = useState('');
  const [weight, setWeight] = useState('');
  const [identity, setIdentity] = useState<PetIdentity>(EMPTY_PET_IDENTITY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSpeciesChange(next: Pet['species']) {
    setSpecies(next);
    setDogBreed('');
    setColor('');
    setWeight('');
    setIdentity(EMPTY_PET_IDENTITY);
  }

  const isDog = species === 'dog';
  const weightValue = Number(weight);
  const isValidWeight = weight.trim().length > 0 && Number.isFinite(weightValue) && weightValue > 0;

  // Dogs must have a breed, color, and weight. Cats/other keep the lighter,
  // optional form.
  const canSave =
    name.trim().length > 0 && (!isDog || (dogBreed.length > 0 && color.trim().length > 0 && isValidWeight));

  async function handleSave() {
    if (!canSave || !session) return;
    setSaving(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('pets')
      .insert({
        owner_id: session.user.id,
        name: name.trim(),
        species,
        breed: isDog ? dogBreed : otherBreed.trim() || null,
        color: isDog ? color.trim() : null,
        weight_lbs: isDog ? weightValue : null,
        is_microchipped: identity.isMicrochipped,
        microchip_number: identity.isMicrochipped ? identity.microchipNumber.trim() || null : null,
        vet_name: identity.vetName.trim() || null,
        vet_phone: identity.vetPhone.trim() || null,
      })
      .select('id')
      .single();

    setSaving(false);

    if (insertError || !data) {
      setError(insertError?.message ?? 'Something went wrong');
      return;
    }

    router.replace({ pathname: '/pet/[id]', params: { id: data.id } });
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.flex}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Add a pet</Text>
        <Text style={styles.subtitle}>
          You&apos;ll be able to add vaccination records right after you save.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Pet's name"
          placeholderTextColor={Colors.light.textMuted}
          value={name}
          onChangeText={setName}
        />

        <View style={styles.speciesRow}>
          {PET_SPECIES.map((option) => {
            const isSelected = species === option;
            return (
              <Pressable
                key={option}
                style={[styles.speciesChip, isSelected && styles.chipSelected]}
                onPress={() => handleSpeciesChange(option)}>
                <Text style={[styles.speciesChipText, isSelected && styles.chipTextSelected]}>
                  {option[0].toUpperCase() + option.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isDog ? (
          <>
            <Text style={styles.label}>Breed</Text>
            <BreedPicker value={dogBreed} onChange={setDogBreed} />

            <Text style={styles.label}>Color</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Golden"
              placeholderTextColor={Colors.light.textMuted}
              value={color}
              onChangeText={setColor}
            />
            <Text style={styles.label}>Weight (lbs)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 45"
              placeholderTextColor={Colors.light.textMuted}
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={(text) => setWeight(sanitizeDecimalInput(text))}
            />

            <PetIdEmergencyFields value={identity} onChange={setIdentity} />
          </>
        ) : (
          <TextInput
            style={styles.input}
            placeholder="Breed (optional)"
            placeholderTextColor={Colors.light.textMuted}
            value={otherBreed}
            onChangeText={setOtherBreed}
          />
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Button label="Save pet" onPress={handleSave} disabled={!canSave} loading={saving} style={styles.saveButton} />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textMuted,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textMuted,
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Colors.light.text,
    marginBottom: 14,
  },
  speciesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  speciesChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  speciesChipText: {
    fontSize: 14,
    color: Colors.light.text,
  },
  chipSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  chipTextSelected: {
    color: Colors.light.text,
  },
  error: {
    marginBottom: 12,
    fontSize: 14,
    color: Colors.light.danger,
  },
  saveButton: {
    marginTop: 8,
    width: '100%',
  },
});
