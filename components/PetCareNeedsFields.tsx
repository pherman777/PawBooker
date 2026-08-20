import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';

export type CareNeeds = {
  isAnxious: boolean;
  isMatted: boolean;
  needsExtraCare: boolean;
  careNotes: string;
};

export const EMPTY_CARE_NEEDS: CareNeeds = {
  isAnxious: false,
  isMatted: false,
  needsExtraCare: false,
  careNotes: '',
};

const CARE_FLAGS: { key: keyof Omit<CareNeeds, 'careNotes'>; label: string }[] = [
  { key: 'isAnxious', label: 'Gets nervous or may nip during grooming' },
  { key: 'isMatted', label: 'Has matting or a very tangled coat' },
  { key: 'needsExtraCare', label: 'Needs extra time or special care (senior, health condition, very large)' },
];

/** True when at least one care flag is set, which makes notes mandatory. */
export function careNeedsAnyFlag(value: CareNeeds): boolean {
  return value.isAnxious || value.isMatted || value.needsExtraCare;
}

/** Valid when no flags are set, or when flags are set and notes are filled in. */
export function careNeedsValid(value: CareNeeds): boolean {
  return !careNeedsAnyFlag(value) || value.careNotes.trim().length > 0;
}

type Props = {
  value: CareNeeds;
  onChange: (next: CareNeeds) => void;
};

export function PetCareNeedsFields({ value, onChange }: Props) {
  const anyFlag = careNeedsAnyFlag(value);

  function toggle(key: keyof Omit<CareNeeds, 'careNotes'>) {
    onChange({ ...value, [key]: !value[key] });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Does your dog need any special care this visit?</Text>
      <Text style={styles.subtitle}>Check all that apply so your groomer can plan for a safe, comfortable visit.</Text>

      {CARE_FLAGS.map((flag) => {
        const checked = value[flag.key];
        return (
          <Pressable key={flag.key} style={styles.row} onPress={() => toggle(flag.key)}>
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.rowLabel}>{flag.label}</Text>
          </Pressable>
        );
      })}

      {anyFlag && (
        <>
          <TextInput
            style={styles.notes}
            placeholder="Tell your groomer what helps keep your dog calm and safe, and describe any matting or special needs…"
            placeholderTextColor={Colors.light.textMuted}
            value={value.careNotes}
            onChangeText={(text) => onChange({ ...value, careNotes: text })}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.priceHint}>
            Your groomer may adjust the final price based on your dog&apos;s needs.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.light.textMuted,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  checkmark: {
    color: Colors.light.text,
    fontSize: 15,
    fontWeight: '700',
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
  },
  notes: {
    marginTop: 8,
    minHeight: 96,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: Colors.light.text,
  },
  priceHint: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
});
