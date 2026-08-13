import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';

export type PetIdentity = {
  isMicrochipped: boolean;
  microchipNumber: string;
  vetName: string;
  vetPhone: string;
};

export const EMPTY_PET_IDENTITY: PetIdentity = {
  isMicrochipped: false,
  microchipNumber: '',
  vetName: '',
  vetPhone: '',
};

type Props = {
  value: PetIdentity;
  onChange: (next: PetIdentity) => void;
};

export function PetIdEmergencyFields({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ID &amp; emergency info</Text>
      <Text style={styles.subtitle}>Optional, but handy for your groomer if something comes up.</Text>

      <Pressable
        style={styles.row}
        onPress={() => onChange({ ...value, isMicrochipped: !value.isMicrochipped })}>
        <View style={[styles.checkbox, value.isMicrochipped && styles.checkboxChecked]}>
          {value.isMicrochipped && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.rowLabel}>My pet is microchipped</Text>
      </Pressable>

      {value.isMicrochipped && (
        <TextInput
          style={styles.input}
          placeholder="Microchip number (optional)"
          placeholderTextColor={Colors.light.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          value={value.microchipNumber}
          onChangeText={(text) => onChange({ ...value, microchipNumber: text })}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Vet name or clinic (optional)"
        placeholderTextColor={Colors.light.textMuted}
        value={value.vetName}
        onChangeText={(text) => onChange({ ...value, vetName: text })}
      />
      <TextInput
        style={styles.input}
        placeholder="Vet phone (optional)"
        placeholderTextColor={Colors.light.textMuted}
        keyboardType="phone-pad"
        value={value.vetPhone}
        onChangeText={(text) => onChange({ ...value, vetPhone: text })}
      />
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
    marginBottom: 4,
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
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
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
});
