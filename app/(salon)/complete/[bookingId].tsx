import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { PetCareSummary, type PetCareInfo } from '@/components/PetCareSummary';
import { Colors } from '@/constants/theme';
import { supabase } from '@/services/supabase';
import { chargeBooking, markBookingPaidCash } from '@/services/stripe';
import { notify } from '@/utils/confirm';

type LineItem = {
  description: string;
  amountCents: number;
};

export default function CompleteBookingScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();

  const [petName, setPetName] = useState('');
  const [petCare, setPetCare] = useState<PetCareInfo>({});
  const [serviceName, setServiceName] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [charging, setCharging] = useState(false);
  const [markingCash, setMarkingCash] = useState(false);
  const [cashBlocked, setCashBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [bookingResult, existingItemsResult] = await Promise.all([
        supabase
          .from('bookings')
          .select(
            'customer_id, groomer_id, pets(name, is_anxious, is_matted, needs_extra_care, care_notes, is_microchipped, microchip_number, vet_name, vet_phone), groomer_services(name, price_cents), groomers(plan)'
          )
          .eq('id', bookingId)
          .single(),
        supabase.from('booking_line_items').select('description, amount_cents').eq('booking_id', bookingId),
      ]);

      if (cancelled) return;

      if (bookingResult.error || !bookingResult.data) {
        setLoadError(bookingResult.error?.message ?? 'Booking not found');
        setLoading(false);
        return;
      }

      const pet = bookingResult.data.pets as unknown as {
        name: string;
        is_anxious?: boolean;
        is_matted?: boolean;
        needs_extra_care?: boolean;
        care_notes?: string | null;
        is_microchipped?: boolean;
        microchip_number?: string | null;
        vet_name?: string | null;
        vet_phone?: string | null;
      };
      const service = bookingResult.data.groomer_services as unknown as {
        name: string;
        price_cents: number;
      };
      const groomer = bookingResult.data.groomers as unknown as { plan: string };
      setPetName(pet?.name ?? 'Pet');
      setPetCare({
        isAnxious: pet?.is_anxious ?? false,
        isMatted: pet?.is_matted ?? false,
        needsExtraCare: pet?.needs_extra_care ?? false,
        careNotes: pet?.care_notes ?? undefined,
        isMicrochipped: pet?.is_microchipped ?? false,
        microchipNumber: pet?.microchip_number ?? undefined,
        vetName: pet?.vet_name ?? undefined,
        vetPhone: pet?.vet_phone ?? undefined,
      });
      setServiceName(service?.name ?? 'Service');

      // An app-acquired customer's first booking must be paid by card so the 5%
      // acquisition fee is collectible. Mirror the server's rule so we can
      // disable the cash button up front rather than failing on submit.
      if (groomer?.plan !== 'pro') {
        const { data: pairing } = await supabase
          .from('groomer_customers')
          .select('origin, acquisition_settled')
          .eq('groomer_id', bookingResult.data.groomer_id)
          .eq('customer_id', bookingResult.data.customer_id)
          .maybeSingle();
        if (!cancelled) {
          setCashBlocked((pairing?.origin ?? 'search') === 'search' && !(pairing?.acquisition_settled ?? false));
        }
      }

      if (existingItemsResult.data && existingItemsResult.data.length > 0) {
        setLineItems(
          existingItemsResult.data.map((item) => ({
            description: item.description,
            amountCents: item.amount_cents,
          }))
        );
      } else {
        setLineItems([{ description: service?.name ?? 'Service', amountCents: service?.price_cents ?? 0 }]);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  function handleAddLineItem() {
    const amountCents = Math.round(Number(newAmount) * 100);
    if (!newDescription.trim() || !Number.isFinite(amountCents) || amountCents <= 0) return;

    setLineItems((prev) => [...prev, { description: newDescription.trim(), amountCents }]);
    setNewDescription('');
    setNewAmount('');
  }

  function handleRemoveLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  const totalCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);

  async function handleChargeAndComplete() {
    if (lineItems.length === 0 || totalCents <= 0) return;
    setCharging(true);

    try {
      await supabase.from('booking_line_items').delete().eq('booking_id', bookingId);
      const { error: insertError } = await supabase.from('booking_line_items').insert(
        lineItems.map((item) => ({
          booking_id: bookingId,
          description: item.description,
          amount_cents: item.amountCents,
        }))
      );
      if (insertError) throw new Error(insertError.message);

      await chargeBooking(bookingId);
      router.back();
    } catch (err) {
      notify('Charge failed', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setCharging(false);
    }
  }

  async function handleMarkPaidCash() {
    if (lineItems.length === 0 || totalCents <= 0) return;
    setMarkingCash(true);

    try {
      await supabase.from('booking_line_items').delete().eq('booking_id', bookingId);
      const { error: insertError } = await supabase.from('booking_line_items').insert(
        lineItems.map((item) => ({
          booking_id: bookingId,
          description: item.description,
          amount_cents: item.amountCents,
        }))
      );
      if (insertError) throw new Error(insertError.message);

      await markBookingPaidCash(bookingId);
      router.back();
    } catch (err) {
      notify('Could not record payment', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setMarkingCash(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>{loadError}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backLink}>← Back</Text>
          </Pressable>
          <Pressable onPress={() => supabase.auth.signOut()}>
            <Text style={styles.signOutLink}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.titleRow}>
          <Logo size={28} />
          <Text style={styles.title}>Complete & invoice</Text>
        </View>
        <Text style={styles.subtitle}>
          {serviceName} for {petName}
        </Text>

        <PetCareSummary info={petCare} />

        <Text style={styles.sectionTitle}>Invoice items</Text>
        {lineItems.map((item, index) => (
          <View key={`${item.description}-${index}`} style={styles.lineItemRow}>
            <Text style={styles.lineItemDescription}>{item.description}</Text>
            <Text style={styles.lineItemAmount}>${(item.amountCents / 100).toFixed(2)}</Text>
            <Pressable onPress={() => handleRemoveLineItem(index)}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.addItemForm}>
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            placeholder="Item description"
            placeholderTextColor={Colors.light.textMuted}
            value={newDescription}
            onChangeText={setNewDescription}
          />
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="0.00"
            placeholderTextColor={Colors.light.textMuted}
            keyboardType="decimal-pad"
            value={newAmount}
            onChangeText={setNewAmount}
          />
          <Pressable style={styles.addButton} onPress={handleAddLineItem}>
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalAmount}>${(totalCents / 100).toFixed(2)}</Text>
        </View>
        <Text style={styles.taxNote}>Sales tax (if applicable) is calculated and added at checkout.</Text>

        {cashBlocked && totalCents > 0 && (
          <View style={styles.feeCard}>
            <Text style={styles.feeCardTitle}>New customer from PawBooker</Text>
            <View style={styles.feeRow}>
              <Text style={styles.feeRowLabel}>One-time acquisition fee (5%)</Text>
              <Text style={styles.feeRowValue}>−${(Math.round(totalCents * 0.05) / 100).toFixed(2)}</Text>
            </View>
            <View style={styles.feeRow}>
              <Text style={styles.feeRowLabelBold}>You receive</Text>
              <Text style={styles.feeRowValueBold}>
                ${((totalCents - Math.round(totalCents * 0.05)) / 100).toFixed(2)}
              </Text>
            </View>
            <Text style={styles.feeCardNote}>
              Applies only to this first booking. Future visits from this customer have no fee.
            </Text>
          </View>
        )}

        <Pressable
          style={[styles.chargeButton, (charging || markingCash || totalCents <= 0) && styles.buttonDisabled]}
          onPress={handleChargeAndComplete}
          disabled={charging || markingCash || totalCents <= 0}>
          {charging ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.chargeButtonText}>Charge & complete</Text>
          )}
        </Pressable>

        {cashBlocked ? (
          <Text style={styles.cashBlockedNote}>
            This customer&apos;s first booking came through PawBooker, so it must be paid by card. You can
            mark cash on their future visits.
          </Text>
        ) : (
          <>
            <Pressable
              style={[styles.cashButton, (charging || markingCash || totalCents <= 0) && styles.buttonDisabled]}
              onPress={handleMarkPaidCash}
              disabled={charging || markingCash || totalCents <= 0}>
              {markingCash ? (
                <ActivityIndicator color={Colors.light.tint} />
              ) : (
                <Text style={styles.cashButtonText}>Mark as paid (cash)</Text>
              )}
            </Pressable>
            <Text style={styles.cashNote}>Use this if your customer paid you directly in cash.</Text>
          </>
        )}
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
  loading: {
    marginTop: 40,
  },
  error: {
    margin: 20,
    fontSize: 15,
    color: Colors.light.danger,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backLink: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  signOutLink: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.danger,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
  },
  lineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
    gap: 10,
  },
  lineItemDescription: {
    flex: 1,
    fontSize: 15,
    color: Colors.light.text,
  },
  lineItemAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  removeText: {
    fontSize: 13,
    color: Colors.light.danger,
  },
  addItemForm: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.light.text,
  },
  descriptionInput: {
    flex: 2,
  },
  amountInput: {
    flex: 1,
  },
  addButton: {
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.light.border,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
  },
  totalAmount: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.light.text,
  },
  taxNote: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  feeCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  feeCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  feeRowLabel: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  feeRowValue: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  feeRowLabelBold: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  feeRowValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
  },
  feeCardNote: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.light.textMuted,
  },
  chargeButton: {
    marginTop: 24,
    height: 50,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chargeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cashButton: {
    marginTop: 12,
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashButtonText: {
    color: Colors.light.tint,
    fontSize: 16,
    fontWeight: '600',
  },
  cashNote: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
  cashBlockedNote: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
