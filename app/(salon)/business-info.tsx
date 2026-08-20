import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';
import { useAuth } from '@/services/auth-context';
import { uploadGroomerAvatar } from '@/services/storage';
import { supabase } from '@/services/supabase';
import { notify } from '@/utils/confirm';
import { isValidEmail } from '@/utils/email';
import { formatPhoneAsTyped, formatPhoneForDisplay, isValidPhone } from '@/utils/phone';

export default function BusinessInfoScreen() {
  const router = useRouter();
  const { session, groomerProfile, refreshGroomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
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
      setPhone(formatPhoneForDisplay(data.phone));
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
    if (phone.trim() && !isValidPhone(phone)) {
      notify('Check your phone number', 'Enter a complete 10-digit phone number, or leave it blank.');
      return;
    }
    if (email.trim() && !isValidEmail(email)) {
      notify('Check your email', 'Enter a valid email address, or leave it blank.');
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

  async function handleChangePhoto() {
    if (!session || !groomerProfile) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      await uploadGroomerAvatar(session.user.id, groomerProfile.id, asset.uri, asset.mimeType ?? 'image/jpeg');
      await refreshGroomerProfile();
    } catch (err) {
      notify('Could not upload photo', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
        <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topRow}>
          <Text style={styles.backLink} onPress={() => router.back()}>
            ← Back
          </Text>
        </View>
        <ScrollView style={webFlushScroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, webContentWidth('form')]} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Business info</Text>

          <View style={styles.photoRow}>
            <Pressable style={styles.photoCircle} onPress={handleChangePhoto} disabled={uploadingPhoto}>
              {uploadingPhoto ? (
                <ActivityIndicator color={Colors.light.tint} />
              ) : groomerProfile?.avatarUrl ? (
                <Image source={{ uri: groomerProfile.avatarUrl }} style={styles.photoImg} />
              ) : (
                <Ionicons name="paw" size={30} color={Colors.light.tint} />
              )}
              <View style={styles.photoEditBadge}>
                <Ionicons name="pencil" size={12} color={Colors.light.bandText} />
              </View>
            </Pressable>
            <View style={styles.photoTextWrap}>
              <Text style={styles.photoTitle}>Business photo</Text>
              <Text style={styles.photoSubtitle}>Shown to customers on your profile</Text>
            </View>
          </View>

          <Text style={styles.label}>Business name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={(text) => setPhone(formatPhoneAsTyped(text))}
            keyboardType="phone-pad"
            maxLength={14}
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

          <Button label="Save" onPress={handleSave} loading={saving} style={styles.button} />
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
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 26,
  },
  photoCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(107,143,114,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  photoImg: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  photoEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.light.band,
    borderWidth: 2,
    borderColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTextWrap: {
    flex: 1,
  },
  photoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  photoSubtitle: {
    fontSize: 12.5,
    color: Colors.light.textMuted,
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
    marginTop: 28,
    width: '100%',
  },
});
