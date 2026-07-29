import { LinkDisplay, PlatformPay } from '@stripe/stripe-react-native';
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
import { createSetupIntent, finalizePaymentMethod, isStripeTestMode, removePaymentMethod } from '@/services/stripe';
import type { Pet, SavedPaymentMethod } from '@/types';
import { confirmAsync, notify } from '@/utils/confirm';

type PetRow = Pet & { photoUrl: string | null };

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripePayments();
  const [pets, setPets] = useState<PetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [savingCard, setSavingCard] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadPaymentMethods = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('customer_payment_methods')
      .select('id, card_brand, card_last4, wallet_type, is_default')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true });

    setPaymentMethods(
      (data ?? []).map((row) => ({
        id: row.id,
        cardBrand: row.card_brand ?? undefined,
        cardLast4: row.card_last4 ?? undefined,
        walletType: row.wallet_type ?? undefined,
        isDefault: row.is_default,
      }))
    );
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadData() {
        if (!session) return;
        setLoading(true);

        const [petsResult] = await Promise.all([
          supabase
            .from('pets')
            .select('id, owner_id, name, species, breed, photo_path')
            .eq('owner_id', session.user.id)
            .order('name'),
          loadPaymentMethods(),
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
          setLoading(false);
        }
      }

      loadData();
      return () => {
        cancelled = true;
      };
    }, [session, loadPaymentMethods])
  );

  async function handleAddPaymentMethod() {
    setSavingCard(true);
    try {
      const { setupIntentClientSecret } = await createSetupIntent();

      // Deliberately not passing customerId/customerEphemeralKeySecret: this
      // sheet is only ever for adding a brand new method (the Profile screen
      // is where existing saved methods get managed), and providing them
      // makes the sheet pre-select an existing saved card, which enables the
      // confirm button before the customer has actually chosen anything new.
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'PawBooker',
        setupIntentClientSecret,
        allowsDelayedPaymentMethods: false,
        link: { display: LinkDisplay.NEVER },
        applePay: {
          merchantCountryCode: 'US',
          buttonType: PlatformPay.ButtonType.SetUp,
          cartItems: [{ paymentType: 'Immediate', label: 'No charge today', amount: '0.00' }],
        },
        googlePay: { merchantCountryCode: 'US', currencyCode: 'USD', testEnv: isStripeTestMode },
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
      await finalizePaymentMethod(setupIntentId);
      await loadPaymentMethods();
    } catch (err) {
      notify('Something went wrong', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingCard(false);
    }
  }

  async function handleMakeDefault(id: string) {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('customer_payment_methods')
        .update({ is_default: true })
        .eq('id', id);
      if (error) throw new Error(error.message);
      await loadPaymentMethods();
    } catch (err) {
      notify('Could not update default', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleRemove(id: string) {
    const confirmed = await confirmAsync('Remove payment method?', 'This cannot be undone.');
    if (!confirmed) return;

    setUpdatingId(id);
    try {
      await removePaymentMethod(id);
      await loadPaymentMethods();
    } catch (err) {
      notify('Could not remove payment method', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUpdatingId(null);
    }
  }

  function paymentMethodLabel(method: SavedPaymentMethod) {
    const brand = method.cardBrand ? method.cardBrand[0].toUpperCase() + method.cardBrand.slice(1) : 'Card';
    const walletPrefix =
      method.walletType === 'apple_pay' ? 'Apple Pay · ' : method.walletType === 'google_pay' ? 'Google Pay · ' : '';
    return `${walletPrefix}${brand} ···· ${method.cardLast4 ?? '????'}`;
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
          <Text style={styles.sectionLabel}>Payment methods</Text>
        </View>

        {!loading && paymentMethods.length === 0 && (
          <Text style={styles.emptyText}>No payment methods on file.</Text>
        )}

        {!loading &&
          paymentMethods.map((method) => (
            <View key={method.id} style={styles.cardRow}>
              <View style={styles.cardTextWrap}>
                <Text style={styles.cardText}>{paymentMethodLabel(method)}</Text>
                {method.isDefault && <Text style={styles.defaultPill}>Default</Text>}
              </View>
              {updatingId === method.id ? (
                <ActivityIndicator color={Colors.light.tint} />
              ) : (
                <View style={styles.cardActions}>
                  {!method.isDefault && (
                    <Pressable onPress={() => handleMakeDefault(method.id)} hitSlop={6}>
                      <Text style={styles.cardActionText}>Make default</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => handleRemove(method.id)} hitSlop={6}>
                    <Text style={styles.cardActionTextDanger}>Remove</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}

        <Pressable
          style={[styles.addPetButton, savingCard && styles.buttonDisabled]}
          onPress={handleAddPaymentMethod}
          disabled={savingCard}>
          {savingCard ? (
            <ActivityIndicator color={Colors.light.tint} />
          ) : (
            <Text style={styles.addPetText}>
              {paymentMethods.length > 0 ? '+ Add another payment method' : '+ Add payment method'}
            </Text>
          )}
        </Pressable>

        <Pressable style={styles.helpButton} onPress={() => router.push('/help')}>
          <Text style={styles.helpButtonText}>Help &amp; support</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  cardTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  cardText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  defaultPill: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.tint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.tint,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 14,
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  cardActionTextDanger: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.danger,
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
  helpButton: {
    marginTop: 24,
    height: 46,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  signOutButton: {
    marginTop: 12,
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
