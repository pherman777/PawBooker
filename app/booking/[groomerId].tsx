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

import {
  CareNeeds,
  EMPTY_CARE_NEEDS,
  PetCareNeedsFields,
  careNeedsValid,
} from '@/components/PetCareNeedsFields';
import { SearchablePicker } from '@/components/SearchablePicker';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import { fetchActiveStaff, fetchBusyIntervals, fetchClosures, type SalonStaff } from '@/services/availability';
import { useAuth } from '@/services/auth-context';
import { createGroupBooking, type PetBookingInput } from '@/services/bookings';
import { notifyGroomer, sendBookingEmail } from '@/services/notifications';
import { skipPaymentMethodRequirement } from '@/services/stripe';
import { supabase } from '@/services/supabase';
import type { GroomerHours, Pet } from '@/types';
import { closureForDate, computeAvailableTimes, type BusyInterval, type ClosedRange, type StaffSelection } from '@/utils/availability';
import { notify } from '@/utils/confirm';
import {
  computeGroupDiscountCents,
  describeMultiPetDiscount,
  parseMultiPetDiscount,
  type MultiPetDiscount,
} from '@/utils/discount';
import { hasCurrentRabiesVaccination } from '@/utils/vaccination';
import { formatTime } from '@/utils/hours';
import { useLightStatusBar } from '@/hooks/useLightStatusBar';

type ServiceInfo = {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  groomerName: string;
};

const DAYS_AHEAD = 14;
const PET_SPECIES: Pet['species'][] = ['dog', 'cat', 'other'];

function careNeedsToRow(care: CareNeeds | undefined) {
  const c = care ?? EMPTY_CARE_NEEDS;
  return {
    is_anxious: c.isAnxious,
    is_matted: c.isMatted,
    needs_extra_care: c.needsExtraCare,
    care_notes: c.careNotes.trim() || null,
  };
}

function nextDays(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);
    return date;
  });
}

export default function BookingScreen() {
  useLightStatusBar();
  const { groomerId, serviceId, petId, note } = useLocalSearchParams<{
    groomerId: string;
    serviceId: string;
    petId?: string;
    note?: string;
  }>();
  const router = useRouter();
  const { session } = useAuth();

  const [service, setService] = useState<ServiceInfo | null>(null);
  const [allServices, setAllServices] = useState<ServiceInfo[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [eligiblePetIds, setEligiblePetIds] = useState<Set<string>>(new Set());
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [customerName, setCustomerName] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [salonHours, setSalonHours] = useState<GroomerHours | null>(null);
  const [staff, setStaff] = useState<SalonStaff[]>([]);
  const [busy, setBusy] = useState<BusyInterval[]>([]);
  const [closures, setClosures] = useState<ClosedRange[]>([]);
  const [staffSelection, setStaffSelection] = useState<string>('any'); // 'any' or a staff id
  const [discountRule, setDiscountRule] = useState<MultiPetDiscount | null>(null);
  const [requiresVaccination, setRequiresVaccination] = useState(true);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<Set<string>>(new Set());
  const [petCareNeeds, setPetCareNeeds] = useState<Record<string, CareNeeds>>({});
  const [petServiceIds, setPetServiceIds] = useState<Record<string, string>>({});

  const [addingPet, setAddingPet] = useState(false);
  const [newPetName, setNewPetName] = useState('');
  const [newPetSpecies, setNewPetSpecies] = useState<Pet['species']>('dog');
  const [savingPet, setSavingPet] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const days = useMemo(() => nextDays(DAYS_AHEAD), []);

  function resolveServiceForPet(petId: string): ServiceInfo | undefined {
    const chosenId = petServiceIds[petId];
    const found = chosenId ? allServices.find((s) => s.id === chosenId) : undefined;
    return found ?? service ?? undefined;
  }

  const selectedPetServices = useMemo(
    () =>
      [...selectedPetIds]
        .map((petId) => ({ petId, service: resolveServiceForPet(petId) }))
        .filter((row): row is { petId: string; service: ServiceInfo } => row.service != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPetIds, petServiceIds, allServices, service]
  );

  // The whole group is one contiguous block: total time = the sum of each
  // selected pet's own service length, so we only offer arrival slots that fit
  // them all back-to-back. Before any pet is picked, fall back to the default
  // service so the time picker still shows something sensible.
  const totalDurationMinutes =
    selectedPetServices.length > 0
      ? selectedPetServices.reduce((sum, row) => sum + row.service.durationMinutes, 0)
      : (service?.durationMinutes ?? 0);

  const availableTimes = useMemo(() => {
    if (!selectedDate || !service) return [];
    const selection: StaffSelection =
      staffSelection === 'any'
        ? { kind: 'any', capacity: Math.max(staff.length, 1) }
        : { kind: 'staff', staffId: staffSelection };
    return computeAvailableTimes({
      date: selectedDate,
      hours: salonHours,
      durationMinutes: totalDurationMinutes,
      busy,
      selection,
      closures,
    });
  }, [selectedDate, service, staffSelection, staff.length, salonHours, busy, closures, totalDurationMinutes]);

  // A change to the date, staff, or which pets/services are selected can
  // shift totalDurationMinutes and invalidate a previously chosen slot - but
  // only clear it when that's actually true, not on every change, so picking
  // a second pet doesn't blow away a time that still fits both.
  useEffect(() => {
    if (selectedTime && !availableTimes.includes(selectedTime)) {
      setSelectedTime(null);
    }
  }, [availableTimes, selectedTime]);

  const subtotalCents = selectedPetServices.reduce((sum, row) => sum + row.service.priceCents, 0);
  const discountCents = computeGroupDiscountCents(subtotalCents, selectedPetIds.size, discountRule);
  const totalCents = subtotalCents - discountCents;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!session) return;

      const windowStart = new Date();
      windowStart.setHours(0, 0, 0, 0);
      const windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + DAYS_AHEAD);

      const [serviceResult, allServicesResult, petsResult, billingResult, hoursResult, staffResult, busyResult, profileResult, closuresResult] =
        await Promise.all([
          supabase
            .from('groomer_services')
            .select('id, name, price_cents, duration_minutes, groomers(name)')
            .eq('id', serviceId)
            .single(),
          supabase
            .from('groomer_services')
            .select('id, name, price_cents, duration_minutes')
            .eq('groomer_id', groomerId),
          supabase
            .from('pets')
            .select('id, owner_id, name, species, breed, pet_documents(document_type, expires_at)')
            .eq('owner_id', session.user.id),
          supabase.from('customer_billing').select('user_id').eq('user_id', session.user.id).maybeSingle(),
          supabase
            .from('groomers')
            .select('hours, multi_pet_discount, requires_rabies_vaccination')
            .eq('id', groomerId)
            .single(),
          fetchActiveStaff(groomerId),
          fetchBusyIntervals(groomerId, windowStart, windowEnd),
          supabase.from('profiles').select('name').eq('user_id', session.user.id).maybeSingle(),
          fetchClosures(groomerId, windowStart, windowEnd),
        ]);

      if (!cancelled) {
        setHasPaymentMethod(billingResult.data != null);
        setSalonHours((hoursResult.data?.hours ?? null) as GroomerHours | null);
        setDiscountRule(parseMultiPetDiscount(hoursResult.data?.multi_pet_discount));
        setRequiresVaccination(hoursResult.data?.requires_rabies_vaccination ?? true);
        setStaff(staffResult);
        setBusy(busyResult);
        setClosures(closuresResult);
        setCustomerName(profileResult.data?.name ?? undefined);
      }

      if (cancelled) return;

      if (serviceResult.error || !serviceResult.data) {
        setLoadError(serviceResult.error?.message ?? 'Service not found');
      } else {
        const row = serviceResult.data;
        const groomerName = (row.groomers as unknown as { name: string })?.name ?? '';
        setService({
          id: row.id,
          name: row.name,
          priceCents: row.price_cents,
          durationMinutes: row.duration_minutes,
          groomerName,
        });

        if (allServicesResult.data) {
          setAllServices(
            allServicesResult.data.map((s) => ({
              id: s.id,
              name: s.name,
              priceCents: s.price_cents,
              durationMinutes: s.duration_minutes,
              groomerName,
            }))
          );
        }
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
        const vaccinationRequired = hoursResult.data?.requires_rabies_vaccination ?? true;
        const eligible = new Set(
          petsResult.data
            .filter(
              (p) =>
                !vaccinationRequired ||
                hasCurrentRabiesVaccination(
                  p.pet_documents.map((d) => ({
                    documentType: d.document_type,
                    expiresAt: d.expires_at ?? undefined,
                  }))
                )
            )
            .map((p) => p.id)
        );
        setEligiblePetIds(eligible);

        // On a rebook we're handed the original pet - preselect it if it's still
        // eligible so the customer only has to pick a new time.
        if (petId && eligible.has(petId)) {
          setSelectedPetIds(new Set([petId]));
        }
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [serviceId, session, petId]);

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
      if (requiresVaccination) {
        notify(
          'Rabies vaccination required',
          `${pet.name} needs a current rabies vaccination on file before they can be booked. Add one from ${pet.name}'s profile in the Profile tab.`
        );
      } else {
        setEligiblePetIds((prev) => new Set(prev).add(pet.id));
      }
    }
  }

  async function handleConfirm() {
    if (!selectedDate || !selectedTime || selectedPetIds.size === 0 || !service || !session) return;

    setSubmitting(true);
    setSubmitError(null);

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const startsAt = new Date(selectedDate);
    startsAt.setHours(hours, minutes, 0, 0);

    const staffId = staffSelection === 'any' ? null : staffSelection;
    const petIds = [...selectedPetIds];

    // A single pet stays a plain standalone booking (no group wrapper); two or
    // more become a group of sequential bookings the salon handles together.
    if (petIds.length === 1) {
      const petService = resolveServiceForPet(petIds[0]) ?? service;
      const { data: inserted, error } = await supabase
        .from('bookings')
        .insert({
          customer_id: session.user.id,
          customer_email: session.user.email,
          customer_name: customerName,
          groomer_id: groomerId,
          pet_id: petIds[0],
          service_id: petService.id,
          staff_id: staffId,
          starts_at: startsAt.toISOString(),
          status: 'pending',
          ...careNeedsToRow(petCareNeeds[petIds[0]]),
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
      return;
    }

    try {
      const careNeedsByPet = Object.fromEntries(
        petIds.map((id) => [id, careNeedsToRow(petCareNeeds[id])])
      );
      const petServices: Record<string, PetBookingInput> = Object.fromEntries(
        petIds.map((id) => {
          const petService = resolveServiceForPet(id) ?? service;
          return [id, { serviceId: petService.id, durationMinutes: petService.durationMinutes }];
        })
      );
      const { bookingIds } = await createGroupBooking({
        customerId: session.user.id,
        customerEmail: session.user.email,
        customerName,
        groomerId,
        staffId,
        petIds,
        petServices,
        arrivalAt: startsAt,
        discount: discountRule,
        careNeedsByPet,
      });

      setSubmitting(false);

      // One notification for the whole group, keyed on the lead booking.
      notifyGroomer(groomerId, bookingIds[0], 'booking_requested');
      sendBookingEmail(bookingIds[0], 'booking_requested');
      router.replace('/(tabs)/bookings');
    } catch (err) {
      setSubmitting(false);
      setSubmitError(err instanceof Error ? err.message : 'Booking failed');
    }
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

  const selectedCareNeedsValid = [...selectedPetIds].every((id) => {
    const pet = pets.find((p) => p.id === id);
    if (pet?.species !== 'dog' && pet?.species !== 'cat') return true;
    return careNeedsValid(petCareNeeds[id] ?? EMPTY_CARE_NEEDS);
  });

  const canConfirm =
    Boolean(selectedDate && selectedTime && selectedPetIds.size > 0) &&
    selectedCareNeedsValid &&
    (hasPaymentMethod || skipPaymentMethodRequirement) &&
    !submitting;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.serviceName}>{service.name}</Text>
        <Text style={styles.serviceMeta}>
          {service.groomerName} · {service.durationMinutes} min · ${(service.priceCents / 100).toFixed(0)}
        </Text>

        {note ? (
          <View style={styles.noteBanner}>
            <Text style={styles.noteBannerLabel}>Note from {service.groomerName}</Text>
            <Text style={styles.noteBannerText}>{note}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Choose a date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
          {days.map((day) => {
            const isSelected = selectedDate?.toDateString() === day.toDateString();
            const isClosed = closureForDate(closures, day) != null;
            return (
              <Pressable
                key={day.toISOString()}
                style={[styles.dayChip, isSelected && styles.chipSelected, isClosed && styles.dayChipClosed]}
                onPress={() => setSelectedDate(day)}>
                <Text style={[styles.dayChipWeekday, isSelected && styles.chipTextSelected]}>
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </Text>
                <Text style={[styles.dayChipDate, isSelected && styles.chipTextSelected]}>
                  {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
                {isClosed && <Text style={styles.dayChipClosedLabel}>Closed</Text>}
              </Pressable>
            );
          })}
        </ScrollView>

        {staff.length >= 2 && (
          <>
            <Text style={styles.sectionTitle}>Choose your groomer</Text>
            <SearchablePicker
              title="Choose your groomer"
              placeholder="First available"
              searchPlaceholder="Search groomers"
              value={staffSelection}
              options={[
                { id: 'any', label: 'First available' },
                ...staff.map((member) => ({ id: member.id, label: member.name })),
              ]}
              onChange={(id) => setStaffSelection(id)}
            />
          </>
        )}

        <Text style={styles.sectionTitle}>Which pets?</Text>
        {discountRule ? (
          <Text style={styles.discountHint}>
            Bringing more than one? This salon offers {describeMultiPetDiscount(discountRule)}.
          </Text>
        ) : (
          <Text style={styles.discountHint}>Select every pet coming in - they&apos;ll be booked as one visit.</Text>
        )}
        <View style={styles.petRow}>
          {pets.map((pet) => {
            const isSelected = selectedPetIds.has(pet.id);
            const isEligible = eligiblePetIds.has(pet.id);
            return (
              <Pressable
                key={pet.id}
                style={[styles.petChip, isSelected && styles.chipSelected, !isEligible && styles.petChipDisabled]}
                onPress={() => {
                  if (!isEligible) {
                    notify(
                      'Rabies vaccination required',
                      `${pet.name} needs a current rabies vaccination on file before they can be booked. Add one from ${pet.name}'s profile in the Profile tab.`
                    );
                    return;
                  }
                  const wasSelected = selectedPetIds.has(pet.id);
                  setSelectedPetIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(pet.id)) next.delete(pet.id);
                    else next.add(pet.id);
                    return next;
                  });
                  setPetCareNeeds((prev) => {
                    if (!prev[pet.id]) return prev;
                    const next = { ...prev };
                    delete next[pet.id];
                    return next;
                  });
                  setPetServiceIds((prev) => {
                    const next = { ...prev };
                    if (wasSelected) {
                      delete next[pet.id];
                    } else if (service) {
                      next[pet.id] = service.id;
                    }
                    return next;
                  });
                }}>
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

        {pets
          .filter((pet) => selectedPetIds.has(pet.id))
          .map((pet) => {
            const showServicePicker = allServices.length > 1;
            const showCareNeeds = pet.species === 'dog' || pet.species === 'cat';
            if (!showServicePicker && !showCareNeeds) return null;
            const chosenServiceId = petServiceIds[pet.id] ?? service?.id;

            return (
              <View key={pet.id} style={styles.careNeedsBlock}>
                <Text style={styles.careNeedsPetLabel}>{pet.name}</Text>

                {showServicePicker && (
                  <View style={styles.petServiceWrap}>
                    <Text style={styles.petServiceLabel}>Service</Text>
                    <SearchablePicker
                      title={`Service for ${pet.name}`}
                      placeholder="Select a service..."
                      searchPlaceholder="Search services"
                      value={chosenServiceId ?? null}
                      options={allServices.map((svc) => ({
                        id: svc.id,
                        label: `${svc.name} · $${(svc.priceCents / 100).toFixed(0)}`,
                      }))}
                      onChange={(id) => setPetServiceIds((prev) => ({ ...prev, [pet.id]: id }))}
                    />
                  </View>
                )}

                {showCareNeeds && (
                  <PetCareNeedsFields
                    value={petCareNeeds[pet.id] ?? EMPTY_CARE_NEEDS}
                    onChange={(next) => setPetCareNeeds((prev) => ({ ...prev, [pet.id]: next }))}
                    petType={pet.species as 'dog' | 'cat'}
                  />
                )}
              </View>
            );
          })}

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
                <ActivityIndicator color={Colors.light.text} />
              ) : (
                <Text style={styles.saveButtonText}>Save pet</Text>
              )}
            </Pressable>
          </View>
        )}

        {selectedPetIds.size > 0 && (
          <>
            <Text style={styles.sectionTitle}>Choose a time</Text>
            {!selectedDate ? (
              <Text style={styles.timeHint}>Pick a date to see available times.</Text>
            ) : availableTimes.length === 0 ? (
              <Text style={styles.timeHint}>
                {(() => {
                  const closure = closureForDate(closures, selectedDate);
                  if (closure) return `Closed that day${closure.note ? ` - ${closure.note}` : ''}. Try another date.`;
                  return `No open times on this day${staffSelection === 'any' ? '' : ' for this groomer'}. Try another date.`;
                })()}
              </Text>
            ) : (
              <View style={styles.timeGrid}>
                {availableTimes.map((slot) => {
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
            )}
          </>
        )}

        {selectedPetIds.size > 0 && (
          <View style={styles.summaryCard}>
            {selectedPetServices.map(({ petId, service: petService }) => {
              const pet = pets.find((p) => p.id === petId);
              return (
                <View key={petId} style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {pet?.name ?? 'Pet'} · {petService.name}
                  </Text>
                  <Text style={styles.summaryValue}>${(petService.priceCents / 100).toFixed(2)}</Text>
                </View>
              );
            })}
            {discountCents > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryDiscountLabel}>Multi-pet discount</Text>
                <Text style={styles.summaryDiscountValue}>−${(discountCents / 100).toFixed(2)}</Text>
              </View>
            )}
            <View style={[styles.summaryRow, styles.summaryTotalRow]}>
              <Text style={styles.summaryTotalLabel}>
                Estimated total{selectedPetIds.size > 1 ? ` · ${totalDurationMinutes} min` : ''}
              </Text>
              <Text style={styles.summaryTotalValue}>${(totalCents / 100).toFixed(2)}</Text>
            </View>
            <Text style={styles.summaryNote}>
              Final price is set by the groomer when your appointment is complete.
            </Text>
          </View>
        )}

        {!hasPaymentMethod && !skipPaymentMethodRequirement && (
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

        <Button
          label="Confirm booking"
          onPress={handleConfirm}
          disabled={!canConfirm}
          loading={submitting}
          style={styles.confirmButton}
        />
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
  noteBanner: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  noteBannerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.textMuted,
    marginBottom: 4,
  },
  noteBannerText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
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
  dayChipClosed: {
    opacity: 0.5,
  },
  dayChipClosedLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '600',
    color: Colors.light.danger,
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
  timeHint: {
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  discountHint: {
    marginTop: -4,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textMuted,
  },
  petRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  careNeedsBlock: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  careNeedsPetLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  petServiceWrap: {
    marginBottom: 14,
  },
  petServiceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 8,
  },
  summaryCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  summaryDiscountLabel: {
    fontSize: 14,
    color: Colors.light.tint,
  },
  summaryDiscountValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  summaryTotalRow: {
    marginBottom: 0,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.light.border,
  },
  summaryTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  summaryTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  summaryNote: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.light.textMuted,
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
    color: Colors.light.text,
    fontSize: 14,
    fontWeight: '600',
  },
  chipSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  chipTextSelected: {
    color: Colors.light.text,
  },
  confirmButton: {
    marginTop: 28,
    width: '100%',
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
