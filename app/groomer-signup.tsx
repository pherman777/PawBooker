import { useRouter } from 'expo-router';
import { useState } from 'react';
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

import { AddressSearchInput, type SelectedLocation } from '@/components/AddressSearchInput';
import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { createGroomer } from '@/services/groomer';

export default function GroomerSignupScreen() {
  const router = useRouter();
  const { session, refreshGroomerProfile } = useAuth();

  const [name, setName] = useState('');
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listing a business writes a groomers row keyed to the account, so a signed-in
  // user is required. Anyone who taps through while logged out is sent to create
  // or sign in to a normal account first, then comes back here.
  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.brand}>
            <Logo size={64} />
            <Wordmark size={20} style={styles.brandName} />
          </View>
          <Text style={styles.title}>List your grooming business</Text>
          <Text style={styles.subtitle}>
            To add your salon, first create a PawBooker account or sign in. Then you can set up your
            services, hours, and payouts.
          </Text>
          <Pressable style={styles.button} onPress={() => router.replace('/(auth)/sign-up')}>
            <Text style={styles.buttonText}>Create an account</Text>
          </Pressable>
          <Pressable style={styles.secondaryLink} onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
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

    setSubmitting(true);
    setError(null);
    try {
      await createGroomer({
        name: name.trim(),
        address: location.label,
        latitude: location.latitude,
        longitude: location.longitude,
        phone: phone.trim(),
        email: email.trim(),
      });
      await refreshGroomerProfile();
      router.replace('/(salon)/welcome');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not list your business.');
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Logo size={64} />
            <Wordmark size={20} style={styles.brandName} />
          </View>

          <Text style={styles.title}>List your grooming business</Text>
          <Text style={styles.subtitle}>
            Tell us the basics. You&apos;ll add services, hours, and payouts next — your salon stays
            private until it&apos;s ready.
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
            value={phone}
            onChangeText={setPhone}
          />

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

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </Pressable>

          <Pressable style={styles.secondaryLink} onPress={() => router.back()}>
            <Text style={styles.linkText}>Cancel</Text>
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
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
