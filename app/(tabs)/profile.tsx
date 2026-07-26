import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Colors } from '@/constants/theme';
import { useStripePayments } from '@/hooks/useStripePayments';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import { getSignedUrl } from '@/services/storage';
import { createSetupIntent, finalizePaymentMethod } from '@/services/stripe';
import type { CustomerBilling, Pet } from '@/types';
import { notify } from '@/utils/confirm';

type PetRow = Pet & { photoUrl: string | null };

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripePayments();
  const [pets, setPets] = useState<PetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<CustomerBilling | null>(null);
  const [savingCard, setSavingCard] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadData() {
        if (!session) return;
        setLoading(true);

        const [petsResult, billingResult] = await Promise.all([
          supabase
            .from('pets')
            .select('id, owner_id, name, species, breed, photo_path')
            .eq('owner_id', session.user.id)
            .order('name'),
          supabase
            .from('customer_billing')
            .select('stripe_customer_id, default_payment_method_id, card_brand, card_last4')
            .eq('user_id', session.user.id)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const rows = await Promise.all(
          (petsResult.data ?? []).map(async (p) => ({
            id: p.id,
            ownerId: p.owner_id,
            name: p.name,
            species: p.species,
            breed: p.breed ?? undefined,
            photoPath: p.photo_path ?? undefined,
            photoUrl: p.photo_path ? await getSignedUrl('pet-photos', p.photo_path) : null,
          }))
        );

        if (!cancelled) {
          setPets(rows);
          setBilling(
            billingResult.data
              ? {
                  stripeCustomerId: billingResult.data.stripe_customer_id,
                  defaultPaymentMethodId: billingResult.data.default_payment_method_id,
                  cardBrand: billingResult.data.card_brand ?? undefined,
                  cardLast4: billingResult.data.card_last4 ?? undefined,
                }
              : null
          );
          setLoading(false);
        }
      }

      loadData();
      return () => {
        cancelled = true;
      };
    }, [session])
  );

  async function handleAddPaymentMethod() {
    setSavingCard(true);
    try {
      const { customerId, ephemeralKey, setupIntentClientSecret } = await createSetupIntent();

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'PawBooker',
        customerId,
        customerEphemeralKeySecret: ephemeralKey,
        setupIntentClientSecret,
        allowsDelayedPaymentMethods: false,
      });
      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          notify('Payment method not saved', presentError.message);
        }
        return;
      }

      const setupIntentId = setupIntentClientSecret.split('_secret_')[0];
      const result = await finalizePaymentMethod(setupIntentId);
      setBilling({
        stripeCustomerId: customerId,
        defaultPaymentMethodId: '',
        cardBrand: result.brand ?? undefined,
        cardLast4: result.last4 ?? undefined,
      });
    } catch (err) {
      notify('Something went wrong', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingCard(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppHeader title="Profile" />
        <Text style={styles.email}>{session?.user.email}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Your pets</Text>
        </View>

        {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}

        {!loading && pets.length === 0 && <Text style={styles.emptyText}>No pets added yet.</Text>}

        {!loading &&
          pets.map((item) => (
            <Pressable
              key={item.id}
              style={styles.petRow}
              onPress={() => router.push({ pathname: '/pet/[id]', params: { id: item.id } })}>
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.petPhoto} contentFit="cover" />
              ) : (
                <View style={[styles.petPhoto, styles.petPhotoPlaceholder]}>
                  <Text style={styles.petPhotoPlaceholderText}>{item.name[0]?.toUpperCase()}</Text>
                </View>
              )}
              <View>
                <Text style={styles.petName}>{item.name}</Text>
                <Text style={styles.petMeta}>
                  {item.species[0].toUpperCase() + item.species.slice(1)}
                  {item.breed ? ` · ${item.breed}` : ''}
                </Text>
              </View>
            </Pressable>
          ))}

        <Pressable style={styles.addPetButton} onPress={() => router.push('/pet/new')}>
          <Text style={styles.addPetText}>+ Add pet</Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Payment method</Text>
        </View>

        {!loading && billing && (
          <View style={styles.cardRow}>
            <Text style={styles.cardText}>
              {billing.cardBrand ? billing.cardBrand[0].toUpperCase() + billing.cardBrand.slice(1) : 'Card'} ····{' '}
              {billing.cardLast4}
            </Text>
          </View>
        )}
        {!loading && !billing && <Text style={styles.emptyText}>No payment method on file.</Text>}

        <Pressable
          style={[styles.addPetButton, savingCard && styles.buttonDisabled]}
          onPress={handleAddPaymentMethod}
          disabled={savingCard}>
          {savingCard ? (
            <ActivityIndicator color={Colors.light.tint} />
          ) : (
            <Text style={styles.addPetText}>{billing ? 'Update card' : '+ Add payment method'}</Text>
          )}
        </Pressable>

        <Pressable style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  email: {
    marginTop: 6,
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  section: {
    marginTop: 24,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.textMuted,
  },
  loading: {
    marginTop: 16,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  petPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  petPhotoPlaceholder: {
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petPhotoPlaceholderText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.textMuted,
  },
  petName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  petMeta: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  cardRow: {
    marginTop: 8,
    paddingVertical: 10,
  },
  cardText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  addPetButton: {
    marginTop: 12,
    height: 46,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPetText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  signOutButton: {
    marginTop: 16,
    height: 46,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.danger,
  },
});
