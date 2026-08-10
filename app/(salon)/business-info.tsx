import { useRouter } from 'expo-router';
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

import { AddressSearchInput, type SelectedLocation } from '@/components/AddressSearchInput';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import { notify } from '@/utils/confirm';

export default function BusinessInfoScreen() {
  const router = useRouter();
  const { groomerProfile, refreshGroomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [address, setAddress] = useState('');
  const [newLocation, setNewLocation] = useState<SelectedLocation | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!groomerProfile) return;
      const { data } = await supabase
        .from('groomers')
        .select('name, phone, email, bio, address')
        .eq('id', groomerProfile.id)
        .single();
      if (cancelled || !data) return;
      setName(data.name ?? '');
      setPhone(data.phone ?? '');
      setEmail(data.email ?? '');
      setBio(data.bio ?? '');
      setAddress(data.address ?? '');
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  async function handleSave() {
    if (!groomerProfile) return;
    if (!name.trim()) {
      notify('Name required', 'Enter your business name.');
      return;
    }

    setSaving(true);
    const update: Record<string, unknown> = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      bio: bio.trim() || null,
    };
    if (newLocation) {
      update.address = newLocation.label;
      update.latitude = newLocation.latitude;
      update.longitude = newLocation.longitude;
    }

    const { error } = await supabase.from('groomers').update(update).eq('id', groomerProfile.id);
    setSaving(false);

    if (error) {
      notify('Could not save', error.message);
      return;
    }
    await refreshGroomerProfile();
    notify('Saved', 'Your business info has been updated.');
    router.back();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topRow}>
          <Text style={styles.backLink} onPress={() => router.back()}>
            ← Back
          </Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Business info</Text>

          <Text style={styles.label}>Business name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Contact email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>About your salon</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={bio}
            onChangeText={setBio}
            placeholder="A short description customers will see"
            placeholderTextColor={Colors.light.textMuted}
            multiline
          />

          <Text style={styles.label}>Address</Text>
          {editingAddress ? (
            newLocation ? (
              <Pressable
                style={styles.selectedAddress}
                onPress={() => {
                  setNewLocation(null);
                }}>
                <Text style={styles.selectedAddressText}>{newLocation.label}</Text>
                <Text style={styles.changeText}>Change</Text>
              </Pressable>
            ) : (
              <View>
                <AddressSearchInput onSelect={setNewLocation} />
                <Pressable onPress={() => setEditingAddress(false)}>
                  <Text style={styles.cancelAddress}>Keep current address</Text>
                </Pressable>
              </View>
            )
          ) : (
            <Pressable style={styles.selectedAddress} onPress={() => setEditingAddress(true)}>
              <Text style={styles.selectedAddressText}>{address}</Text>
              <Text style={styles.changeText}>Change</Text>
            </Pressable>
          )}

          <Pressable
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
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
    padding: 20,
  },
  flex: {
    flex: 1,
  },
  loading: {
    marginTop: 60,
  },
  topRow: {
    flexDirection: 'row',
  },
  backLink: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.text,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
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
  cancelAddress: {
    marginTop: 10,
    fontSize: 14,
    color: Colors.light.tint,
  },
  button: {
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
