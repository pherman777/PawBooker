import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  visible: boolean;
  submitting: boolean;
  onDismiss: () => void;
  onConfirm: (reason: string) => void;
};

export function CancelBookingModal({ visible, submitting, onDismiss, onConfirm }: Props) {
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
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Cancel booking</Text>
            <Text style={styles.subtitle}>Please provide a reason for the cancellation.</Text>

            <TextInput
              style={styles.input}
              placeholder="Reason for cancelling"
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
                  <Text style={styles.confirmButtonText}>Cancel booking</Text>
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
