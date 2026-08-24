import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { Colors } from '@/constants/theme';

type Props = {
  visible: boolean;
  subtotalCents: number;
  submitting: boolean;
  onDismiss: () => void;
  onSubmit: (tipAmountCents: number) => void;
};

const PRESET_PERCENTAGES = [15, 20, 25];

export function TipModal({ visible, subtotalCents, submitting, onDismiss, onSubmit }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom' | null>(null);
  const [customAmount, setCustomAmount] = useState('');

  useEffect(() => {
    if (visible) {
      setSelectedPreset(null);
      setCustomAmount('');
    }
  }, [visible]);

  const tipAmountCents =
    selectedPreset === 'custom'
      ? Math.round((parseFloat(customAmount) || 0) * 100)
      : selectedPreset != null
        ? Math.round((subtotalCents * selectedPreset) / 100)
        : 0;

  function handleSubmit() {
    if (tipAmountCents <= 0) return;
    onSubmit(tipAmountCents);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Leave a tip</Text>
            <Text style={styles.subtitle}>100% goes to your groomer.</Text>

            <View style={styles.presetRow}>
              {PRESET_PERCENTAGES.map((pct) => (
                <Pressable
                  key={pct}
                  style={[styles.presetChip, selectedPreset === pct && styles.presetChipSelected]}
                  onPress={() => setSelectedPreset(pct)}>
                  <Text
                    style={[styles.presetChipText, selectedPreset === pct && styles.presetChipTextSelected]}>
                    {pct}%
                  </Text>
                  <Text
                    style={[
                      styles.presetChipAmount,
                      selectedPreset === pct && styles.presetChipTextSelected,
                    ]}>
                    ${((subtotalCents * pct) / 100 / 100).toFixed(2)}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.presetChip, selectedPreset === 'custom' && styles.presetChipSelected]}
                onPress={() => setSelectedPreset('custom')}>
                <Text
                  style={[
                    styles.presetChipText,
                    selectedPreset === 'custom' && styles.presetChipTextSelected,
                  ]}>
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
                  autoFocus
                />
              </View>
            )}

            <View style={styles.actions}>
              <Pressable style={styles.dismissButton} onPress={onDismiss} disabled={submitting}>
                <Text style={styles.dismissButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitButton, (tipAmountCents <= 0 || submitting) && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={tipAmountCents <= 0 || submitting}>
                {submitting ? (
                  <ActivityIndicator color={Colors.light.text} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {tipAmountCents > 0 ? `Tip $${(tipAmountCents / 100).toFixed(2)}` : 'Tip'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
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
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  dismissButton: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.textMuted,
  },
  submitButton: {
    flex: 2,
    height: 46,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: Colors.light.text,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
