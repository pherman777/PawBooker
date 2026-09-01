import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressSearchInput, type SelectedLocation } from '@/components/AddressSearchInput';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/Wordmark';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { createGroomer, savePendingGroomer, type CreateGroomerInput } from '@/services/groomer';
import { supabase } from '@/services/supabase';
import { isValidEmail } from '@/utils/email';
import { formatPhoneAsTyped, isValidPhone } from '@/utils/phone';

export default function GroomerSignupScreen() {
  const router = useRouter();
  const { session, refreshGroomerProfile } = useAuth();
  const loggedIn = Boolean(session);

  const [name, setName] = useState('');
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  // Apple's guideline 3.1.1 treats in-app business/organization account
  // registration as access to an external (non-IAP) purchase mechanism,
  // since a groomer account leads to the Pro subscription sold on the web
  // (see (salon)/plan.tsx). Registration has to happen on paw-booker.com
  // instead - this screen only exists for Android/web, so bounce iOS away
  // regardless of how it was reached (link, deep link, or already signed in).
  useEffect(() => {
    if (Platform.OS === 'ios') {
      router.replace('/(auth)/sign-in');
    }
  }, [router]);

  if (Platform.OS === 'ios') {
    return null;
  }

  function pendingFrom(): CreateGroomerInput {
    return {
      name: name.trim(),
      address: location!.label,
      latitude: location!.latitude,
      longitude: location!.longitude,
      phone: phone.trim(),
      email: email.trim(),
    };
  }

  async function finishAndGoToSalon(details: CreateGroomerInput) {
    await createGroomer(details);
    await refreshGroomerProfile();
    router.replace('/(salon)/welcome');
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Enter your business name.');
      return;
    }
    if (!location) {
      setError('Search for and select your business address.');
      return;
    }
    if (phone.trim() && !isValidPhone(phone)) {
      setError('Enter a complete 10-digit phone number, or leave it blank.');
      return;
    }
    if (email.trim() && !isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!loggedIn && (!email.trim() || password.length < 6)) {
      setError('Enter an email and a password of at least 6 characters to create your account.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (loggedIn) {
        await finishAndGoToSalon(pendingFrom());
        return;
      }

      // Not logged in: create the account, then create the salon. If sign-up
      // returns a session right away, finish now. If email confirmation is
      // required (no session yet), save the details so we can finish
      // automatically the moment they confirm and sign in.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        setSubmitting(false);
        return;
      }

      if (data.session) {
        await finishAndGoToSalon(pendingFrom());
      } else {
        await savePendingGroomer(pendingFrom());
        setConfirmSent(true);
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not list your business.');
      setSubmitting(false);
    }
  }

  if (confirmSent) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.brand}>
            <Logo size={64} />
            <Wordmark size={20} style={styles.brandName} />
          </View>
          <Text style={styles.title}>Confirm your email</Text>
          <Text style={styles.subtitle}>
            We sent a confirmation link to {email.trim()}. Confirm it, then sign in — we&apos;ll
            finish setting up {name.trim() || 'your salon'} automatically.
          </Text>
          <Button label="Go to sign in" onPress={() => router.replace('/(auth)/sign-in')} style={styles.button} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.flex}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Logo size={64} />
            <Wordmark size={20} style={styles.brandName} />
          </View>

          <Text style={styles.title}>List your grooming business</Text>
          <Text style={styles.subtitle}>
            Set up your salon in one step. You&apos;ll add services, hours, and payouts next — your
            salon stays private until it&apos;s ready.
          </Text>

          <Text style={styles.label}>Business name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Happy Tails Grooming"
            placeholderTextColor={Colors.light.textMuted}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Business address</Text>
          {location ? (
            <Pressable style={styles.selectedAddress} onPress={() => setLocation(null)}>
              <Text style={styles.selectedAddressText}>{location.label}</Text>
              <Text style={styles.changeText}>Change</Text>
            </Pressable>
          ) : (
            <AddressSearchInput onSelect={setLocation} />
          )}

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            placeholder="Contact number for customers"
            placeholderTextColor={Colors.light.textMuted}
            keyboardType="phone-pad"
            maxLength={14}
            value={phone}
            onChangeText={(text) => setPhone(formatPhoneAsTyped(text))}
          />

          {loggedIn ? (
            <>
              <Text style={styles.label}>Contact email</Text>
              <TextInput
                style={styles.input}
                placeholder="Where bookings should reach you"
                placeholderTextColor={Colors.light.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </>
          ) : (
            <>
              <Text style={styles.sectionHeader}>Create your account</Text>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@business.com"
                placeholderTextColor={Colors.light.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="At least 6 characters"
                placeholderTextColor={Colors.light.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              <Pressable style={styles.inlineLink} onPress={() => router.replace('/(auth)/sign-in')}>
                <Text style={styles.linkText}>Already have an account? Sign in first</Text>
              </Pressable>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            label={loggedIn ? 'Create my salon' : 'Create account & salon'}
            onPress={handleSubmit}
            loading={submitting}
            style={styles.button}
          />

          <Pressable style={styles.secondaryLink} onPress={() => router.back()}>
            <Text style={styles.linkText}>Cancel</Text>
          </Pressable>
      </KeyboardAwareScrollView>
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
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 28,
  },
  brandName: {
    marginTop: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.light.textMuted,
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 4,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 6,
    marginTop: 4,
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
  selectedAddress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  selectedAddressText: {
    flex: 1,
    fontSize: 15,
    color: Colors.light.text,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  error: {
    marginBottom: 12,
    fontSize: 14,
    color: Colors.light.danger,
  },
  button: {
    marginTop: 8,
    width: '100%',
  },
  inlineLink: {
    marginTop: 2,
    marginBottom: 4,
  },
  secondaryLink: {
    marginTop: 20,
    alignSelf: 'center',
  },
  linkText: {
    fontSize: 14,
    color: Colors.light.tint,
  },
});
