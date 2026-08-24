import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { PasswordInput } from '@/components/PasswordInput';
import { Wordmark } from '@/components/Wordmark';
import { Colors } from '@/constants/theme';
import { supabase } from '@/services/supabase';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSignUp() {
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message);
    } else if (!data.session) {
      setConfirmationSent(true);
    } else if (name.trim()) {
      // Only savable right now if sign-up returned a session immediately
      // (no email confirmation required) - otherwise the name can still be
      // added later from Account, same fallback as phone.
      await supabase.from('profiles').upsert({ user_id: data.session.user.id, name: name.trim() });
    }
    setLoading(false);
  }

  if (confirmationSent) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.brand}>
            <Logo size={64} />
            <Wordmark size={20} style={styles.brandName} />
          </View>

          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a confirmation link to {email}. Confirm it, then sign in.
          </Text>
          <Link href="/(auth)/sign-in" style={styles.link}>
            <Text style={styles.linkText}>Back to sign in</Text>
          </Link>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Logo size={64} />
            <Wordmark size={20} style={styles.brandName} />
          </View>

          <Text style={styles.title}>Create an account</Text>
          <Text style={styles.subtitle}>Book grooming appointments for your pets.</Text>

          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={Colors.light.textMuted}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.light.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <PasswordInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.light.textMuted}
            textContentType="newPassword"
            autoComplete="password-new"
            value={password}
            onChangeText={setPassword}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.light.text} /> : <Text style={styles.buttonText}>Sign up</Text>}
          </Pressable>

          <Link href="/(auth)/sign-in" style={styles.link}>
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </Link>
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
    marginBottom: 32,
  },
  brandName: {
    marginTop: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 24,
    fontSize: 15,
    color: Colors.light.textMuted,
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
    marginBottom: 12,
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
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.light.text,
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    marginTop: 20,
    alignSelf: 'center',
  },
  linkText: {
    fontSize: 14,
    color: Colors.light.tint,
  },
});
