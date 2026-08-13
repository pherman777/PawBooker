import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import { notify } from '@/utils/confirm';
import { formatPhoneAsTyped, formatPhoneForDisplay } from '@/utils/phone';

export default function AccountScreen() {
  const { session } = useAuth();
  const currentEmail = session?.user.email ?? '';

  const [email, setEmail] = useState(currentEmail);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingContact, setSavingContact] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!session) return;
      const { data } = await supabase
        .from('profiles')
        .select('phone')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!cancelled) {
        setPhone(formatPhoneForDisplay(data?.phone));
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const emailChanged = email.trim().length > 0 && email.trim() !== currentEmail;
  // Phone is always editable, so the contact form is saveable once loaded.
  const canSaveContact = !loading;

  async function handleSaveContact() {
    if (!session) return;
    const trimmedEmail = email.trim();
    if (trimmedEmail.length === 0) {
      notify('Email required', 'Enter a valid email address.');
      return;
    }

    setSavingContact(true);
    try {
      // Phone lives in profiles; upsert it every save.
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ user_id: session.user.id, phone: phone.trim() || null, updated_at: new Date().toISOString() });
      if (profileError) throw profileError;

      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email: trimmedEmail });
        if (emailError) throw emailError;
        notify(
          'Confirm your new email',
          `We sent a confirmation link to ${trimmedEmail}. Your email updates once you tap it.`
        );
      } else {
        notify('Saved', 'Your contact info has been updated.');
      }
    } catch (err) {
      notify('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingContact(false);
    }
  }

  const canSavePassword =
    newPassword.length >= 8 && newPassword === confirmPassword && !savingPassword;

  async function handleUpdatePassword() {
    if (newPassword.length < 8) {
      notify('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify('Passwords don’t match', 'Re-enter the same password in both fields.');
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      notify('Password updated', 'Your password has been changed.');
    } catch (err) {
      notify('Could not update password', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Contact info</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={Colors.light.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />
          {emailChanged && (
            <Text style={styles.hint}>Changing your email requires confirming a link we send to the new address.</Text>
          )}

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            placeholder="(555) 123-4567"
            placeholderTextColor={Colors.light.textMuted}
            keyboardType="phone-pad"
            maxLength={14}
            value={phone}
            onChangeText={(text) => setPhone(formatPhoneAsTyped(text))}
          />

          <Pressable
            style={[styles.primaryButton, (!canSaveContact || savingContact) && styles.buttonDisabled]}
            onPress={handleSaveContact}
            disabled={!canSaveContact || savingContact}>
            {savingContact ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Save contact info</Text>
            )}
          </Pressable>

          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Change password</Text>

          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 8 characters"
            placeholderTextColor={Colors.light.textMuted}
            secureTextEntry
            autoCapitalize="none"
            value={newPassword}
            onChangeText={setNewPassword}
          />

          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter new password"
            placeholderTextColor={Colors.light.textMuted}
            secureTextEntry
            autoCapitalize="none"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <Pressable
            style={[styles.primaryButton, !canSavePassword && styles.buttonDisabled]}
            onPress={handleUpdatePassword}
            disabled={!canSavePassword}>
            {savingPassword ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Update password</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 12,
  },
  sectionSpacing: {
    marginTop: 32,
  },
  label: {
    fontSize: 14,
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
  hint: {
    marginTop: -6,
    marginBottom: 14,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  primaryButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
