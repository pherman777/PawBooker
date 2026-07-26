import { useEffect, useState } from 'react';
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
import { StarRating } from './StarRating';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  submitting: boolean;
  initialRating?: number;
  initialComment?: string;
  onDismiss: () => void;
  onSubmit: (rating: number, comment: string) => void;
};

export function ReviewModal({
  visible,
  title,
  subtitle,
  submitting,
  initialRating = 0,
  initialComment = '',
  onDismiss,
  onSubmit,
}: Props) {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);

  useEffect(() => {
    if (visible) {
      setRating(initialRating);
      setComment(initialComment);
    }
  }, [visible, initialRating, initialComment]);

  function handleSubmit() {
    if (rating === 0) return;
    onSubmit(rating, comment.trim());
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

            <View style={styles.starsWrapper}>
              <StarRating value={rating} onChange={setRating} size={32} />
            </View>

            <TextInput
              style={styles.input}
              placeholder="Share a few words (optional)"
              placeholderTextColor={Colors.light.textMuted}
              value={comment}
              onChangeText={setComment}
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
                style={[styles.submitButton, (rating === 0 || submitting) && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={rating === 0 || submitting}>
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit review</Text>
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
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  starsWrapper: {
    marginTop: 20,
    marginBottom: 16,
  },
  input: {
    minHeight: 80,
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
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
