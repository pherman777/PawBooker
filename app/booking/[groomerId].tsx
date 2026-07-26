import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { notifyGroomer, sendBookingEmail } from '@/services/notifications';
import { supabase } from '@/services/supabase';
import type { Pet } from '@/types';
import { notify } from '@/utils/confirm';
import { hasCurrentRabiesVaccination } from '@/utils/vaccination';
import { formatTime } from '@/utils/hours';

type ServiceInfo = {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  groomerName: string;
};

const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
const DAYS_AHEAD = 14;
const PET_SPECIES: Pet['species'][] = ['dog', 'cat', 'other'];

function nextDays(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);
    return date;
  });
}

export default function BookingScreen() {
  const { groomerId, serviceId } = useLocalSearchParams<{ groomerId: string; serviceId: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [service, setService] = useState<ServiceInfo | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [eligiblePetIds, setEligiblePetIds] = useState<Set<string>>(new Set());
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);

  const [addingPet, setAddingPet] = useState(false);
  const [newPetName, setNewPetName] = useState('');
  const [newPetSpecies, setNewPetSpecies] = useState<Pet['species']>('dog');
  const [savingPet, setSavingPet] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const days = useMemo(() => nextDays(DAYS_AHEAD), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!session) return;

      const [serviceResult, petsResult, billingResult] = await Promise.all([
        supabase
          .from('groomer_services')
          .select('id, name, price_cents, duration_minutes, groomers(name)')
          .eq('id', serviceId)
          .single(),
        supabase
          .from('pets')
          .select('id, owner_id, name, species, breed, pet_documents(document_type, expires_at)')
          .eq('owner_id', session.user.id),
        supabase.from('customer_billing').select('user_id').eq('user_id', session.user.id).maybeSingle(),
      ]);

      if (!cancelled) {
        setHasPaymentMethod(billingResult.data != null);
      }

      if (cancelled) return;

      if (serviceResult.error || !serviceResult.data) {
        setLoadError(serviceResult.error?.message ?? 'Service not found');
      } else {
        const row = serviceResult.data;
        setService({
          id: row.id,
          name: row.name,
          priceCents: row.price_cents,
          durationMinutes: row.duration_minutes,
          groomerName: (row.groomers as unknown as { name: string })?.name ?? '',
        });
      }

      if (!petsResult.error && petsResult.data) {
        setPets(
          petsResult.data.map((p) => ({
            id: p.id,
            ownerId: p.owner_id,
            name: p.name,
            species: p.species,
            breed: p.breed ?? undefined,
          }))
        );
        setEligiblePetIds(
          new Set(
            petsResult.data
              .filter((p) =>
                hasCurrentRabiesVaccination(
                  p.pet_documents.map((d) => ({
                    documentType: d.document_type,
                    expiresAt: d.expires_at ?? undefined,
                  }))
                )
              )
              .map((p) => p.id)
          )
        );
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [serviceId, session]);

  async function handleSavePet() {
    if (!newPetName.trim() || !session) return;
    setSavingPet(true);

    const { data, error } = await supabase
      .from('pets')
      .insert({ owner_id: session.user.id, name: newPetName.trim(), species: newPetSpecies })
      .select('id, owner_id, name, species, breed')
      .single();

    setSavingPet(false);

    if (!error && data) {
      const pet: Pet = {
        id: data.id,
        ownerId: data.owner_id,
        name: data.name,
        species: data.species,
        breed: data.breed ?? undefined,
      };
      setPets((prev) => [...prev, pet]);
      setAddingPet(false);
      setNewPetName('');
      notify(
        'Rabies vaccination required',
        `${pet.name} needs a current rabies vaccination on file before they can be booked. Add one from ${pet.name}'s profile in the Profile tab.`
      );
    }
  }

  async function handleConfirm() {
    if (!selectedDate || !selectedTime || !selectedPetId || !service || !session) return;

    setSubmitting(true);
    setSubmitError(null);

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const startsAt = new Date(selectedDate);
    startsAt.setHours(hours, minutes, 0, 0);

    const { data: inserted, error } = await supabase
      .from('bookings')
      .insert({
        customer_id: session.user.id,
        customer_email: session.user.email,
        groomer_id: groomerId,
        pet_id: selectedPetId,
        service_id: service.id,
        starts_at: startsAt.toISOString(),
        status: 'pending',
      })
      .select('id')
      .single();

    setSubmitting(false);

    if (error || !inserted) {
      setSubmitError(error?.message ?? 'Booking failed');
      return;
    }

    notifyGroomer(groomerId, inserted.id, 'booking_requested');
    sendBookingEmail(inserted.id, 'booking_requested');
    router.replace('/(tabs)/bookings');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  if (loadError || !service) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>Couldn&apos;t load this service{loadError ? `: ${loadError}` : ''}.</Text>
      </SafeAreaView>
    );
  }

  const canConfirm =
    Boolean(selectedDate && selectedTime && selectedPetId) && hasPaymentMethod && !submitting;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.serviceName}>{service.name}</Text>
        <Text style={styles.serviceMeta}>
          {service.groomerName} · {service.durationMinutes} min · ${(service.priceCents / 100).toFixed(0)}
        </Text>

        <Text style={styles.sectionTitle}>Choose a date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
          {days.map((day) => {
            const isSelected = selectedDate?.toDateString() === day.toDateString();
            return (
              <Pressable
                key={day.toISOString()}
                style={[styles.dayChip, isSelected && styles.chipSelected]}
                onPress={() => setSelectedDate(day)}>
                <Text style={[styles.dayChipWeekday, isSelected && styles.chipTextSelected]}>
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </Text>
                <Text style={[styles.dayChipDate, isSelected && styles.chipTextSelected]}>
                  {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionTitle}>Choose a time</Text>
        <View style={styles.timeGrid}>
          {TIME_SLOTS.map((slot) => {
            const isSelected = selectedTime === slot;
            return (
              <Pressable
                key={slot}
                style={[styles.timeChip, isSelected && styles.chipSelected]}
                onPress={() => setSelectedTime(slot)}>
                <Text style={[styles.timeChipText, isSelected && styles.chipTextSelected]}>
                  {formatTime(slot)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Which pet?</Text>
        <View style={styles.petRow}>
          {pets.map((pet) => {
            const isSelected = selectedPetId === pet.id;
            const isEligible = eligiblePetIds.has(pet.id);
            return (
              <Pressable
                key={pet.id}
                style={[styles.petChip, isSelected && styles.chipSelected, !isEligible && styles.petChipDisabled]}
                onPress={() =>
                  isEligible
                    ? setSelectedPetId(pet.id)
                    : notify(
                        'Rabies vaccination required',
                        `${pet.name} needs a current rabies vaccination on file before they can be booked. Add one from ${pet.name}'s profile in the Profile tab.`
                      )
                }>
                <Text style={[styles.petChipText, isSelected && styles.chipTextSelected]}>{pet.name}</Text>
                {!isEligible && <Text style={styles.petChipHint}>Vaccination required</Text>}
              </Pressable>
            );
          })}
          <Pressable
            style={[styles.petChip, styles.addPetChip]}
            onPress={() => setAddingPet((prev) => !prev)}>
            <Text style={styles.addPetChipText}>{addingPet ? 'Cancel' : '+ Add pet'}</Text>
          </Pressable>
        </View>

        {addingPet && (
          <View style={styles.addPetForm}>
            <TextInput
              style={styles.input}
              placeholder="Pet's name"
              placeholderTextColor={Colors.light.textMuted}
              value={newPetName}
              onChangeText={setNewPetName}
            />
            <View style={styles.speciesRow}>
              {PET_SPECIES.map((species) => {
                const isSelected = newPetSpecies === species;
                return (
                  <Pressable
                    key={species}
                    style={[styles.speciesChip, isSelected && styles.chipSelected]}
                    onPress={() => setNewPetSpecies(species)}>
                    <Text style={[styles.speciesChipText, isSelected && styles.chipTextSelected]}>
                      {species[0].toUpperCase() + species.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[styles.saveButton, (!newPetName.trim() || savingPet) && styles.buttonDisabled]}
              onPress={handleSavePet}
              disabled={!newPetName.trim() || savingPet}>
              {savingPet ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save pet</Text>
              )}
            </Pressable>
          </View>
        )}

        {!hasPaymentMethod && (
          <View style={styles.paymentNotice}>
            <Text style={styles.paymentNoticeText}>
              Add a payment method before booking. You&apos;ll be charged after your appointment is
              complete.
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/profile')}>
              <Text style={styles.paymentNoticeLink}>Go to Profile</Text>
            </Pressable>
          </View>
        )}

        {submitError && <Text style={styles.error}>{submitError}</Text>}

        <Pressable
          style={[styles.confirmButton, !canConfirm && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={!canConfirm}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmButtonText}>Confirm booking</Text>
          )}
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
  loading: {
    marginTop: 40,
  },
  error: {
    marginTop: 12,
    marginBottom: 12,
    fontSize: 14,
    color: Colors.light.danger,
  },
  serviceName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
  },
  serviceMeta: {
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
  dayScroll: {
    flexGrow: 0,
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    marginRight: 8,
    alignItems: 'center',
  },
  dayChipWeekday: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  dayChipDate: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  timeChipText: {
    fontSize: 14,
    color: Colors.light.text,
  },
  petRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  petChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  petChipText: {
    fontSize: 14,
    color: Colors.light.text,
  },
  petChipDisabled: {
    opacity: 0.5,
  },
  petChipHint: {
    marginTop: 2,
    fontSize: 11,
    color: Colors.light.danger,
  },
  addPetChip: {
    backgroundColor: Colors.light.background,
    borderStyle: 'dashed',
  },
  addPetChipText: {
    fontSize: 14,
    color: Colors.light.tint,
    fontWeight: '600',
  },
  addPetForm: {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    gap: 10,
  },
  input: {
    height: 46,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 12,
    fontSize: 15,
    color: Colors.light.text,
  },
  speciesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  speciesChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  speciesChipText: {
    fontSize: 13,
    color: Colors.light.text,
  },
  saveButton: {
    height: 42,
    borderRadius: 8,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  chipSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  chipTextSelected: {
    color: '#fff',
  },
  confirmButton: {
    marginTop: 28,
    height: 50,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  paymentNotice: {
    marginTop: 20,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  paymentNoticeText: {
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  paymentNoticeLink: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
  },
});
