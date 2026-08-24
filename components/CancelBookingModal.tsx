import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
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
  submitting: boolean;
  onDismiss: () => void;
  onConfirm: (reason: string) => void;
  // Defaults keep the original cancel-booking wording; the decline flow overrides
  // these to ask for a note that suggests another time.
  title?: string;
  subtitle?: string;
  placeholder?: string;
  confirmLabel?: string;
};

export function CancelBookingModal({
  visible,
  submitting,
  onDismiss,
  onConfirm,
  title = 'Cancel booking',
  subtitle = 'Please provide a reason for the cancellation.',
  placeholder = 'Reason for cancelling',
  confirmLabel = 'Cancel booking',
}: Props) {
  const [reason, setReason] = useState('');

  function handleDismiss() {
    setReason('');
    onDismiss();
  }

  function handleConfirm() {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason('');
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleDismiss}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            <TextInput
              style={styles.input}
              placeholder={placeholder}
              placeholderTextColor={Colors.light.textMuted}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
              blurOnSubmit
              returnKeyType="done"
            />

            <View style={styles.actions}>
              <Pressable style={styles.dismissButton} onPress={handleDismiss} disabled={submitting}>
                <Text style={styles.dismissButtonText}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, (!reason.trim() || submitting) && styles.buttonDisabled]}
                onPress={handleConfirm}
                disabled={!reason.trim() || submitting}>
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
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
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  input: {
    minHeight: 90,
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
  confirmButton: {
    flex: 2,
    height: 46,
    borderRadius: 10,
    backgroundColor: Colors.light.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
