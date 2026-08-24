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
  reasons: string[];
  submitting: boolean;
  onDismiss: () => void;
  onSubmit: (reason: string, details: string) => void;
};

export function ReportModal({ visible, reasons, submitting, onDismiss, onSubmit }: Props) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (visible) {
      setSelectedReason(null);
      setDetails('');
    }
  }, [visible]);

  function handleSubmit() {
    if (!selectedReason) return;
    onSubmit(selectedReason, details.trim());
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Report an issue</Text>
            <Text style={styles.subtitle}>Our team reviews every report directly.</Text>

            <View style={styles.reasonList}>
              {reasons.map((reason) => (
                <Pressable
                  key={reason}
                  style={[styles.reasonRow, selectedReason === reason && styles.reasonRowSelected]}
                  onPress={() => setSelectedReason(reason)}>
                  <Text style={[styles.reasonText, selectedReason === reason && styles.reasonTextSelected]}>
                    {reason}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Anything else we should know? (optional)"
              placeholderTextColor={Colors.light.textMuted}
              value={details}
              onChangeText={setDetails}
              multiline
              numberOfLines={3}
              blurOnSubmit
              returnKeyType="done"
            />

            <View style={styles.actions}>
              <Pressable style={styles.dismissButton} onPress={onDismiss} disabled={submitting}>
                <Text style={styles.dismissButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitButton, (!selectedReason || submitting) && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={!selectedReason || submitting}>
                {submitting ? (
                  <ActivityIndicator color={Colors.light.text} />
                ) : (
                  <Text style={styles.submitButtonText}>Submit report</Text>
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
    marginBottom: 16,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  reasonList: {
    gap: 8,
  },
  reasonRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  reasonRowSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  reasonText: {
    fontSize: 15,
    color: Colors.light.text,
  },
  reasonTextSelected: {
    color: Colors.light.text,
    fontWeight: '600',
  },
  input: {
    marginTop: 14,
    minHeight: 70,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.light.text,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
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
