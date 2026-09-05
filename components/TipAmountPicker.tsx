import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  subtotalCents: number;
  onChange: (tipAmountCents: number) => void;
};

const PRESET_PERCENTAGES = [15, 20, 25];

export function TipAmountPicker({ subtotalCents, onChange }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom' | null>(null);
  const [customAmount, setCustomAmount] = useState('');

  const tipAmountCents =
    selectedPreset === 'custom'
      ? Math.round((parseFloat(customAmount) || 0) * 100)
      : selectedPreset != null
        ? Math.round((subtotalCents * selectedPreset) / 100)
        : 0;

  useEffect(() => {
    onChange(tipAmountCents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipAmountCents]);

  return (
    <View>
      <View style={styles.presetRow}>
        {PRESET_PERCENTAGES.map((pct) => (
          <Pressable
            key={pct}
            style={[styles.presetChip, selectedPreset === pct && styles.presetChipSelected]}
            onPress={() => setSelectedPreset(pct)}>
            <Text style={[styles.presetChipText, selectedPreset === pct && styles.presetChipTextSelected]}>
              {pct}%
            </Text>
            <Text style={[styles.presetChipAmount, selectedPreset === pct && styles.presetChipTextSelected]}>
              ${((subtotalCents * pct) / 100 / 100).toFixed(2)}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.presetChip, selectedPreset === 'custom' && styles.presetChipSelected]}
          onPress={() => setSelectedPreset('custom')}>
          <Text style={[styles.presetChipText, selectedPreset === 'custom' && styles.presetChipTextSelected]}>
            Custom
          </Text>
        </Pressable>
      </View>

      {selectedPreset === 'custom' && (
        <View style={styles.customRow}>
          <Text style={styles.customDollarSign}>$</Text>
          <TextInput
            style={styles.customInput}
            placeholder="0.00"
            placeholderTextColor={Colors.light.textMuted}
            keyboardType="decimal-pad"
            value={customAmount}
            onChangeText={setCustomAmount}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
  },
  presetChipSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  presetChipText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
  },
  presetChipAmount: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  presetChipTextSelected: {
    color: Colors.light.text,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
  },
  customDollarSign: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
    marginRight: 4,
  },
  customInput: {
    flex: 1,
    height: 48,
    fontSize: 18,
    color: Colors.light.text,
  },
});
