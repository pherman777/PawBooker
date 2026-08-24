import { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PasswordInput } from '@/components/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import { useLightStatusBar } from '@/hooks/useLightStatusBar';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import { notify } from '@/utils/confirm';
import { formatPhoneAsTyped, formatPhoneForDisplay } from '@/utils/phone';

export default function AccountScreen() {
  useLightStatusBar();
  const { session } = useAuth();
  const currentEmail = session?.user.email ?? '';

  const [name, setName] = useState('');
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
        .select('name, phone')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!cancelled) {
        setName(data?.name ?? '');
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
      // Name and phone live in profiles; upsert them every save.
      const { error: profileError } = await supabase.from('profiles').upsert({
        user_id: session.user.id,
        name: name.trim() || null,
        phone: phone.trim() || null,
        updated_at: new Date().toISOString(),
      });
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
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Contact info</Text>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={Colors.light.textMuted}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
            value={name}
            onChangeText={setName}
          />
          <Text style={styles.hint}>Shown to your groomer so they know who&apos;s booking.</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={Colors.light.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            textContentType="username"
            autoComplete="email"
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

          <Button
            label="Save contact info"
            onPress={handleSaveContact}
            disabled={!canSaveContact}
            loading={savingContact}
            style={styles.primaryButton}
          />

          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Change password</Text>

          <Text style={styles.label}>New password</Text>
          <PasswordInput
            style={styles.input}
            placeholder="At least 8 characters"
            placeholderTextColor={Colors.light.textMuted}
            textContentType="newPassword"
            autoComplete="password-new"
            value={newPassword}
            onChangeText={setNewPassword}
          />

          <Text style={styles.label}>Confirm new password</Text>
          <PasswordInput
            style={styles.input}
            placeholder="Re-enter new password"
            placeholderTextColor={Colors.light.textMuted}
            textContentType="newPassword"
            autoComplete="password-new"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <Button
            label="Update password"
            onPress={handleUpdatePassword}
            disabled={!canSavePassword}
            loading={savingPassword}
            style={styles.primaryButton}
          />
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
    marginTop: 4,
    width: '100%',
  },
});
