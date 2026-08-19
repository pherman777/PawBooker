import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { Logo } from '@/components/Logo';
import { PetCareSummary, type PetCareInfo } from '@/components/PetCareSummary';
import { chargeBookingGroup, markBookingPaidCash } from '@/services/stripe';
import { notify } from '@/utils/confirm';
import { perBookingDiscountCents, type GroupDiscountSnapshot } from '@/utils/discount';
import { supabase } from '@/services/supabase';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

type LineItem = { description: string; amountCents: number };

type PetInvoice = {
  bookingId: string;
  petName: string;
  petCare: PetCareInfo;
  serviceName: string;
  lineItems: LineItem[];
};

type PetRow = {
  name: string;
  is_microchipped?: boolean;
  microchip_number?: string | null;
  vet_name?: string | null;
  vet_phone?: string | null;
};

export default function CompleteGroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();

  const [pets, setPets] = useState<PetInvoice[]>([]);
  const [newDesc, setNewDesc] = useState<Record<string, string>>({});
  const [newAmt, setNewAmt] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [charging, setCharging] = useState(false);
  const [markingCash, setMarkingCash] = useState(false);
  const [cashBlocked, setCashBlocked] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);

    // Billable pets in this group: the groomer has marked the service done and
    // they haven't been charged yet (still 'confirmed', not 'completed').
    const { data: bookingRows, error } = await supabase
      .from('bookings')
      .select(
        'id, customer_id, groomer_id, starts_at, service_completed_at, status, is_anxious, is_matted, needs_extra_care, care_notes, pets(name, is_microchipped, microchip_number, vet_name, vet_phone), groomer_services(name, price_cents), groomers(plan)'
      )
      .eq('group_id', groupId)
      .eq('status', 'confirmed')
      .order('starts_at', { ascending: true });

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    const billable = (bookingRows ?? []).filter((b) => b.service_completed_at);
    if (billable.length === 0) {
      setLoadError('No pets are ready to bill in this visit yet.');
      setPets([]);
      setLoading(false);
      return;
    }

    const ids = billable.map((b) => b.id);
    const [groupResult, siblingsResult, existingItemsResult] = await Promise.all([
      supabase.from('booking_groups').select('discount_type, discount_value').eq('id', groupId).single(),
      supabase.from('bookings').select('groomer_services(price_cents)').eq('group_id', groupId),
      supabase.from('booking_line_items').select('booking_id, description, amount_cents').in('booking_id', ids),
    ]);

    const snapshot: GroupDiscountSnapshot | null =
      groupResult.data?.discount_type && groupResult.data?.discount_value != null
        ? { type: groupResult.data.discount_type, value: groupResult.data.discount_value }
        : null;
    // Prorate a flat group discount against the full group's service total, so
    // each pet's share matches what it would have been billed individually.
    const groupServiceTotalCents = (siblingsResult.data ?? []).reduce(
      (sum, row) => sum + ((row.groomer_services as unknown as { price_cents: number } | null)?.price_cents ?? 0),
      0
    );

    const itemsByBooking = new Map<string, LineItem[]>();
    for (const item of existingItemsResult.data ?? []) {
      const list = itemsByBooking.get(item.booking_id) ?? [];
      list.push({ description: item.description, amountCents: item.amount_cents });
      itemsByBooking.set(item.booking_id, list);
    }

    const invoices: PetInvoice[] = billable.map((b) => {
      const pet = b.pets as unknown as PetRow | null;
      const service = b.groomer_services as unknown as { name: string; price_cents: number };
      const existing = itemsByBooking.get(b.id);

      let lineItems: LineItem[];
      if (existing && existing.length > 0) {
        lineItems = existing;
      } else {
        lineItems = [{ description: service?.name ?? 'Service', amountCents: service?.price_cents ?? 0 }];
        const discountCents = perBookingDiscountCents(service?.price_cents ?? 0, groupServiceTotalCents, snapshot);
        if (discountCents > 0) lineItems.push({ description: 'Multi-pet discount', amountCents: -discountCents });
      }

      return {
        bookingId: b.id,
        petName: pet?.name ?? 'Pet',
        petCare: {
          isAnxious: b.is_anxious ?? false,
          isMatted: b.is_matted ?? false,
          needsExtraCare: b.needs_extra_care ?? false,
          careNotes: b.care_notes ?? undefined,
          isMicrochipped: pet?.is_microchipped ?? false,
          microchipNumber: pet?.microchip_number ?? undefined,
          vetName: pet?.vet_name ?? undefined,
          vetPhone: pet?.vet_phone ?? undefined,
        },
        serviceName: service?.name ?? 'Service',
        lineItems,
      };
    });
    setPets(invoices);

    // Cash-block check (one customer for the whole visit): an app-acquired
    // customer's first booking must be paid by card so the 5% fee is collectible.
    const lead = billable[0];
    const groomerPlan = (lead.groomers as unknown as { plan: string })?.plan;
    if (groomerPlan !== 'pro') {
      const { data: pairing } = await supabase
        .from('groomer_customers')
        .select('origin, acquisition_settled')
        .eq('groomer_id', lead.groomer_id)
        .eq('customer_id', lead.customer_id)
        .maybeSingle();
      setCashBlocked((pairing?.origin ?? 'search') === 'search' && !(pairing?.acquisition_settled ?? false));
    } else {
      setCashBlocked(false);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  function updatePet(bookingId: string, updater: (items: LineItem[]) => LineItem[]) {
    setPets((prev) =>
      prev.map((p) => (p.bookingId === bookingId ? { ...p, lineItems: updater(p.lineItems) } : p))
    );
  }

  function handleAddLineItem(bookingId: string) {
    const amountCents = Math.round(Number(newAmt[bookingId]) * 100);
    const description = (newDesc[bookingId] ?? '').trim();
    if (!description || !Number.isFinite(amountCents) || amountCents <= 0) return;

    updatePet(bookingId, (items) => [...items, { description, amountCents }]);
    setNewDesc((s) => ({ ...s, [bookingId]: '' }));
    setNewAmt((s) => ({ ...s, [bookingId]: '' }));
  }

  function handleRemoveLineItem(bookingId: string, index: number) {
    updatePet(bookingId, (items) => items.filter((_, i) => i !== index));
  }

  function petTotal(pet: PetInvoice): number {
    return pet.lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  }

  const grandTotalCents = pets.reduce((sum, p) => sum + petTotal(p), 0);

  async function saveLineItems(pet: PetInvoice) {
    await supabase.from('booking_line_items').delete().eq('booking_id', pet.bookingId);
    const { error } = await supabase.from('booking_line_items').insert(
      pet.lineItems.map((item) => ({
        booking_id: pet.bookingId,
        description: item.description,
        amount_cents: item.amountCents,
      }))
    );
    if (error) throw new Error(error.message);
  }

  // Saves every pet's line items, then charges the whole visit as ONE payment.
  // If the charge fails, nothing is marked paid - the groomer can just retry.
  async function handleChargeAll() {
    for (const pet of pets) {
      if (petTotal(pet) <= 0) {
        notify('Check the invoice', `${pet.petName}'s total must be greater than zero.`);
        return;
      }
    }

    setCharging(true);
    try {
      for (const pet of pets) await saveLineItems(pet);
      await chargeBookingGroup(groupId);
      router.back();
    } catch (err) {
      notify('Charge failed', err instanceof Error ? err.message : 'Something went wrong');
      await load();
    } finally {
      setCharging(false);
    }
  }

  async function handleMarkAllCash() {
    for (const pet of pets) {
      if (petTotal(pet) <= 0) {
        notify('Check the invoice', `${pet.petName}'s total must be greater than zero.`);
        return;
      }
    }

    setMarkingCash(true);
    let failure: string | null = null;
    for (const pet of pets) {
      try {
        await saveLineItems(pet);
        await markBookingPaidCash(pet.bookingId);
      } catch (err) {
        failure = `${pet.petName}: ${err instanceof Error ? err.message : 'could not record'}`;
        break;
      }
    }
    setMarkingCash(false);

    if (failure) {
      notify('Could not record every payment', `${failure}\n\nReopen to finish the rest.`);
      await load();
      return;
    }
    router.back();
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, webContentWidth('form')]}>
        <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backLink}>← Back</Text>
          </Pressable>
        </View>
        <Text style={styles.error}>{loadError}</Text>
      </SafeAreaView>
    );
  }

  const busy = charging || markingCash;

  return (
    <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
      <ScrollView style={webFlushScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, webContentWidth('form')]}
        keyboardShouldPersistTaps="handled">
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
          {pets.length} {pets.length === 1 ? 'pet' : 'pets'} in this visit · adjust each pet&apos;s
          services below.
        </Text>

        {pets.map((pet) => (
          <View key={pet.bookingId} style={styles.petCard}>
            <Text style={styles.petName}>{pet.petName}</Text>
            <PetCareSummary info={pet.petCare} />

            {pet.lineItems.map((item, index) => (
              <View key={`${item.description}-${index}`} style={styles.lineItemRow}>
                <Text style={styles.lineItemDescription}>{item.description}</Text>
                <Text style={styles.lineItemAmount}>
                  {item.amountCents < 0 ? '−' : ''}${(Math.abs(item.amountCents) / 100).toFixed(2)}
                </Text>
                <Pressable onPress={() => handleRemoveLineItem(pet.bookingId, index)}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}

            <View style={styles.addItemForm}>
              <TextInput
                style={[styles.input, styles.descriptionInput]}
                placeholder="Add a service or fee"
                placeholderTextColor={Colors.light.textMuted}
                value={newDesc[pet.bookingId] ?? ''}
                onChangeText={(t) => setNewDesc((s) => ({ ...s, [pet.bookingId]: t }))}
              />
              <TextInput
                style={[styles.input, styles.amountInput]}
                placeholder="0.00"
                placeholderTextColor={Colors.light.textMuted}
                keyboardType="decimal-pad"
                value={newAmt[pet.bookingId] ?? ''}
                onChangeText={(t) => setNewAmt((s) => ({ ...s, [pet.bookingId]: t }))}
              />
              <Pressable style={styles.addButton} onPress={() => handleAddLineItem(pet.bookingId)}>
                <Text style={styles.addButtonText}>Add</Text>
              </Pressable>
            </View>

            <View style={styles.petTotalRow}>
              <Text style={styles.petTotalLabel}>{pet.petName}&apos;s subtotal</Text>
              <Text style={styles.petTotalAmount}>${(petTotal(pet) / 100).toFixed(2)}</Text>
            </View>
          </View>
        ))}

        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>Visit subtotal</Text>
          <Text style={styles.grandTotalAmount}>${(grandTotalCents / 100).toFixed(2)}</Text>
        </View>
        <Text style={styles.taxNote}>
          Charged as one payment for the whole visit. Sales tax (if applicable) is added at checkout.
        </Text>

        {cashBlocked && (
          <View style={styles.feeCard}>
            <Text style={styles.feeCardTitle}>New customer from PawBooker</Text>
            <Text style={styles.feeCardNote}>
              This customer&apos;s first visit came through PawBooker, so it must be paid by card — a
              one-time 5% acquisition fee applies to their first appointment only.
            </Text>
          </View>
        )}

        <Pressable
          style={[styles.chargeButton, (busy || grandTotalCents <= 0) && styles.buttonDisabled]}
          onPress={handleChargeAll}
          disabled={busy || grandTotalCents <= 0}>
          {charging ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.chargeButtonText}>
              Charge all &amp; complete ({pets.length} {pets.length === 1 ? 'pet' : 'pets'})
            </Text>
          )}
        </Pressable>

        {cashBlocked ? (
          <Text style={styles.cashBlockedNote}>
            You can mark cash on this customer&apos;s future visits.
          </Text>
        ) : (
          <>
            <Pressable
              style={[styles.cashButton, (busy || grandTotalCents <= 0) && styles.buttonDisabled]}
              onPress={handleMarkAllCash}
              disabled={busy || grandTotalCents <= 0}>
              {markingCash ? (
                <ActivityIndicator color={Colors.light.tint} />
              ) : (
                <Text style={styles.cashButtonText}>Mark all as paid (cash)</Text>
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
  petCard: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  petName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 4,
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
    marginTop: 12,
  },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
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
  petTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.light.border,
  },
  petTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.textMuted,
  },
  petTotalAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  grandTotalLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.light.text,
  },
  grandTotalAmount: {
    fontSize: 18,
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
  feeCardNote: {
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
