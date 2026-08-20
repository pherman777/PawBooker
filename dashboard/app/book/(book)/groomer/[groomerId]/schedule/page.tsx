'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/Button';
import { PetCareNeedsFields } from '@/components/PetCareNeedsFields';
import { computeAvailableTimes, type BusyInterval, type StaffSelection } from '@/lib/availability';
import { careNeedsToRow, careNeedsValid, createGroupBooking, createSingleBooking, EMPTY_CARE_NEEDS, type CareNeeds, type PetBookingInput } from '@/lib/customerBookings';
import { useCustomerAuth } from '@/lib/customerAuth';
import { customerSupabase } from '@/lib/customerSupabase';
import { computeGroupDiscountCents, describeMultiPetDiscount, parseMultiPetDiscount, type MultiPetDiscount } from '@/lib/discount';
import { formatTime, type GroomerHours } from '@/lib/hours';
import { fetchActiveStaff, fetchBusyIntervals, notifyGroomer, sendBookingEmail, type SalonStaff } from '@/lib/customerNotifications';
import { hasCurrentRabiesVaccination } from '@/lib/vaccination';

import styles from './page.module.css';

type ServiceInfo = {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  groomerName: string;
};

type PetRow = {
  id: string;
  ownerId: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed?: string;
};

const DAYS_AHEAD = 14;
const PET_SPECIES: PetRow['species'][] = ['dog', 'cat', 'other'];

function nextDays(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);
    return date;
  });
}

export default function SchedulePage() {
  return (
    <Suspense>
      <SchedulePageContent />
    </Suspense>
  );
}

// Port of app/booking/[groomerId].tsx.
function SchedulePageContent() {
  const { groomerId } = useParams<{ groomerId: string }>();
  const searchParams = useSearchParams();
  const serviceId = searchParams.get('serviceId') ?? '';
  const rebookPetId = searchParams.get('petId') ?? undefined;
  const note = searchParams.get('note') ?? undefined;

  const router = useRouter();
  const { session } = useCustomerAuth();

  const [service, setService] = useState<ServiceInfo | null>(null);
  const [allServices, setAllServices] = useState<ServiceInfo[]>([]);
  const [pets, setPets] = useState<PetRow[]>([]);
  const [eligiblePetIds, setEligiblePetIds] = useState<Set<string>>(new Set());
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [customerName, setCustomerName] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [salonHours, setSalonHours] = useState<GroomerHours | null>(null);
  const [staff, setStaff] = useState<SalonStaff[]>([]);
  const [busy, setBusy] = useState<BusyInterval[]>([]);
  const [staffSelection, setStaffSelection] = useState<string>('any');
  const [discountRule, setDiscountRule] = useState<MultiPetDiscount | null>(null);
  const [requiresVaccination, setRequiresVaccination] = useState(true);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<Set<string>>(new Set());
  const [petCareNeeds, setPetCareNeeds] = useState<Record<string, CareNeeds>>({});
  const [petServiceIds, setPetServiceIds] = useState<Record<string, string>>({});

  const [addingPet, setAddingPet] = useState(false);
  const [newPetName, setNewPetName] = useState('');
  const [newPetSpecies, setNewPetSpecies] = useState<PetRow['species']>('dog');
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

  const totalDurationMinutes = selectedPetServices.length > 0 ? selectedPetServices.reduce((sum, row) => sum + row.service.durationMinutes, 0) : service?.durationMinutes ?? 0;

  const availableTimes = useMemo(() => {
    if (!selectedDate || !service) return [];
    const selection: StaffSelection = staffSelection === 'any' ? { kind: 'any', capacity: Math.max(staff.length, 1) } : { kind: 'staff', staffId: staffSelection };
    return computeAvailableTimes({ date: selectedDate, hours: salonHours, durationMinutes: totalDurationMinutes, busy, selection });
  }, [selectedDate, service, staffSelection, staff.length, salonHours, busy, totalDurationMinutes]);

  const subtotalCents = selectedPetServices.reduce((sum, row) => sum + row.service.priceCents, 0);
  const discountCents = computeGroupDiscountCents(subtotalCents, selectedPetIds.size, discountRule);
  const totalCents = subtotalCents - discountCents;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!session || !serviceId) return;

      const windowStart = new Date();
      windowStart.setHours(0, 0, 0, 0);
      const windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + DAYS_AHEAD);

      const [serviceResult, allServicesResult, petsResult, billingResult, hoursResult, staffResult, busyResult, profileResult] = await Promise.all([
        customerSupabase.from('groomer_services').select('id, name, price_cents, duration_minutes, groomers(name)').eq('id', serviceId).single(),
        customerSupabase.from('groomer_services').select('id, name, price_cents, duration_minutes').eq('groomer_id', groomerId),
        customerSupabase.from('pets').select('id, owner_id, name, species, breed, pet_documents(document_type, expires_at)').eq('owner_id', session.user.id),
        customerSupabase.from('customer_billing').select('user_id').eq('user_id', session.user.id).maybeSingle(),
        customerSupabase.from('groomers').select('hours, multi_pet_discount, requires_rabies_vaccination').eq('id', groomerId).single(),
        fetchActiveStaff(groomerId),
        fetchBusyIntervals(groomerId, windowStart, windowEnd),
        customerSupabase.from('profiles').select('name').eq('user_id', session.user.id).maybeSingle(),
      ]);

      if (cancelled) return;

      setHasPaymentMethod(billingResult.data != null);
      setSalonHours((hoursResult.data?.hours ?? null) as GroomerHours | null);
      setDiscountRule(parseMultiPetDiscount(hoursResult.data?.multi_pet_discount));
      setRequiresVaccination(hoursResult.data?.requires_rabies_vaccination ?? true);
      setStaff(staffResult);
      setBusy(busyResult);
      setCustomerName(profileResult.data?.name ?? undefined);

      if (serviceResult.error || !serviceResult.data) {
        setLoadError(serviceResult.error?.message ?? 'Service not found');
      } else {
        const row = serviceResult.data;
        const groomerName = (row.groomers as unknown as { name: string })?.name ?? '';
        setService({ id: row.id, name: row.name, priceCents: row.price_cents, durationMinutes: row.duration_minutes, groomerName });

        if (allServicesResult.data) {
          setAllServices(allServicesResult.data.map((s) => ({ id: s.id, name: s.name, priceCents: s.price_cents, durationMinutes: s.duration_minutes, groomerName })));
        }
      }

      if (!petsResult.error && petsResult.data) {
        setPets(petsResult.data.map((p) => ({ id: p.id, ownerId: p.owner_id, name: p.name, species: p.species, breed: p.breed ?? undefined })));
        const vaccinationRequired = hoursResult.data?.requires_rabies_vaccination ?? true;
        const eligible = new Set(
          petsResult.data
            .filter((p) => !vaccinationRequired || hasCurrentRabiesVaccination(p.pet_documents.map((d) => ({ documentType: d.document_type, expiresAt: d.expires_at ?? undefined }))))
            .map((p) => p.id)
        );
        setEligiblePetIds(eligible);

        if (rebookPetId && eligible.has(rebookPetId)) {
          setSelectedPetIds(new Set([rebookPetId]));
        }
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [serviceId, session, rebookPetId, groomerId]);

  async function handleSavePet() {
    if (!newPetName.trim() || !session) return;
    setSavingPet(true);

    const { data, error } = await customerSupabase.from('pets').insert({ owner_id: session.user.id, name: newPetName.trim(), species: newPetSpecies }).select('id, owner_id, name, species, breed').single();

    setSavingPet(false);

    if (!error && data) {
      const pet: PetRow = { id: data.id, ownerId: data.owner_id, name: data.name, species: data.species, breed: data.breed ?? undefined };
      setPets((prev) => [...prev, pet]);
      setAddingPet(false);
      setNewPetName('');
      if (!requiresVaccination) {
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

    if (petIds.length === 1) {
      const petService = resolveServiceForPet(petIds[0]) ?? service;
      try {
        const bookingId = await createSingleBooking({
          customerId: session.user.id,
          customerEmail: session.user.email,
          customerName,
          groomerId,
          petId: petIds[0],
          serviceId: petService.id,
          staffId,
          startsAt,
          careNeeds: careNeedsToRow(petCareNeeds[petIds[0]]),
        });
        setSubmitting(false);
        notifyGroomer(groomerId, bookingId, 'booking_requested');
        sendBookingEmail(bookingId, 'booking_requested');
        router.replace('/book/bookings');
      } catch (err) {
        setSubmitting(false);
        setSubmitError(err instanceof Error ? err.message : 'Booking failed');
      }
      return;
    }

    try {
      const careNeedsByPet = Object.fromEntries(petIds.map((id) => [id, careNeedsToRow(petCareNeeds[id])]));
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
      notifyGroomer(groomerId, bookingIds[0], 'booking_requested');
      sendBookingEmail(bookingIds[0], 'booking_requested');
      router.replace('/book/bookings');
    } catch (err) {
      setSubmitting(false);
      setSubmitError(err instanceof Error ? err.message : 'Booking failed');
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" aria-hidden />
      </div>
    );
  }

  if (loadError || !service) {
    return <p className="sign-in-error">Couldn&apos;t load this service{loadError ? `: ${loadError}` : ''}.</p>;
  }

  const selectedCareNeedsValid = [...selectedPetIds].every((id) => {
    const pet = pets.find((p) => p.id === id);
    if (pet?.species !== 'dog') return true;
    return careNeedsValid(petCareNeeds[id] ?? EMPTY_CARE_NEEDS);
  });

  const canConfirm = Boolean(selectedDate && selectedTime && selectedPetIds.size > 0) && selectedCareNeedsValid && hasPaymentMethod && !submitting;

  function togglePet(pet: PetRow) {
    const isEligible = eligiblePetIds.has(pet.id);
    if (!isEligible) {
      setLoadError(`${pet.name} needs a current rabies vaccination on file before they can be booked. Add one from ${pet.name}'s profile.`);
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
      if (wasSelected) delete next[pet.id];
      else if (service) next[pet.id] = service.id;
      return next;
    });
    setSelectedTime(null);
  }

  return (
    <div>
      <div className={styles.serviceName}>{service.name}</div>
      <div className={styles.serviceMeta}>
        {service.groomerName} · {service.durationMinutes} min · ${(service.priceCents / 100).toFixed(0)}
      </div>

      {note && (
        <div className={`card ${styles.noteBanner}`}>
          <div className={styles.noteBannerLabel}>Note from {service.groomerName}</div>
          <div className={styles.noteBannerText}>{note}</div>
        </div>
      )}

      <p className={styles.sectionTitle}>Choose a date</p>
      <div className={styles.dayScroll}>
        {days.map((day) => {
          const isSelected = selectedDate?.toDateString() === day.toDateString();
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={`${styles.chip} ${isSelected ? styles.chipSelected : ''}`}
              onClick={() => {
                setSelectedDate(day);
                setSelectedTime(null);
              }}>
              <div className={styles.dayChipWeekday}>{day.toLocaleDateString(undefined, { weekday: 'short' })}</div>
              <div className={styles.dayChipDate}>{day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
            </button>
          );
        })}
      </div>

      {staff.length >= 2 && (
        <>
          <p className={styles.sectionTitle}>Choose your groomer</p>
          <select
            className={`field-input ${styles.select}`}
            value={staffSelection}
            onChange={(e) => {
              setStaffSelection(e.target.value);
              setSelectedTime(null);
            }}>
            <option value="any">First available</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </>
      )}

      <p className={styles.sectionTitle}>Choose a time</p>
      {!selectedDate ? (
        <p className={styles.hint}>Pick a date to see available times.</p>
      ) : availableTimes.length === 0 ? (
        <p className={styles.hint}>No open times on this day{staffSelection === 'any' ? '' : ' for this groomer'}. Try another date.</p>
      ) : (
        <div className={styles.timeGrid}>
          {availableTimes.map((slot) => (
            <button key={slot} type="button" className={`${styles.timeChip} ${selectedTime === slot ? styles.chipSelected : ''}`} onClick={() => setSelectedTime(slot)}>
              {formatTime(slot)}
            </button>
          ))}
        </div>
      )}

      <p className={styles.sectionTitle}>Which pets?</p>
      <p className={styles.discountHint}>
        {discountRule ? `Bringing more than one? This salon offers ${describeMultiPetDiscount(discountRule)}.` : "Select every pet coming in - they'll be booked as one visit."}
      </p>
      <div className={styles.petRow}>
        {pets.map((pet) => {
          const isSelected = selectedPetIds.has(pet.id);
          const isEligible = eligiblePetIds.has(pet.id);
          return (
            <button
              key={pet.id}
              type="button"
              className={`${styles.chip} ${styles.petChip} ${isSelected ? styles.chipSelected : ''} ${!isEligible ? styles.petChipDisabled : ''}`}
              onClick={() => togglePet(pet)}>
              <span>{pet.name}</span>
              {!isEligible && <span className={styles.petChipHint}>Vaccination required</span>}
            </button>
          );
        })}
        <button type="button" className={`${styles.chip} ${styles.addPetChip}`} onClick={() => setAddingPet((prev) => !prev)}>
          {addingPet ? 'Cancel' : '+ Add pet'}
        </button>
      </div>

      {pets
        .filter((pet) => selectedPetIds.has(pet.id))
        .map((pet) => {
          const showServicePicker = allServices.length > 1;
          const showCareNeeds = pet.species === 'dog';
          if (!showServicePicker && !showCareNeeds) return null;
          const chosenServiceId = petServiceIds[pet.id] ?? service?.id;

          return (
            <div key={pet.id} className={styles.careNeedsBlock}>
              <div className={styles.careNeedsPetLabel}>{pet.name}</div>

              {showServicePicker && (
                <div className={styles.petServiceWrap}>
                  <div className={styles.petServiceLabel}>Service</div>
                  <select
                    className="field-input"
                    value={chosenServiceId ?? ''}
                    onChange={(e) => {
                      setPetServiceIds((prev) => ({ ...prev, [pet.id]: e.target.value }));
                      setSelectedTime(null);
                    }}>
                    {allServices.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name} · ${(svc.priceCents / 100).toFixed(0)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {showCareNeeds && <PetCareNeedsFields value={petCareNeeds[pet.id] ?? EMPTY_CARE_NEEDS} onChange={(next) => setPetCareNeeds((prev) => ({ ...prev, [pet.id]: next }))} />}
            </div>
          );
        })}

      {addingPet && (
        <div className={styles.addPetForm}>
          <input className="field-input" placeholder="Pet's name" value={newPetName} onChange={(e) => setNewPetName(e.target.value)} />
          <div className={styles.speciesRow}>
            {PET_SPECIES.map((sp) => (
              <button key={sp} type="button" className={`${styles.chip} ${newPetSpecies === sp ? styles.chipSelected : ''}`} onClick={() => setNewPetSpecies(sp)}>
                {sp[0].toUpperCase() + sp.slice(1)}
              </button>
            ))}
          </div>
          <Button label="Save pet" onClick={handleSavePet} disabled={!newPetName.trim()} loading={savingPet} />
        </div>
      )}

      {selectedPetIds.size > 0 && (
        <div className={`card ${styles.summaryCard}`}>
          {selectedPetServices.map(({ petId, service: petService }) => {
            const pet = pets.find((p) => p.id === petId);
            return (
              <div key={petId} className={styles.summaryRow}>
                <span>
                  {pet?.name ?? 'Pet'} · {petService.name}
                </span>
                <span>${(petService.priceCents / 100).toFixed(2)}</span>
              </div>
            );
          })}
          {discountCents > 0 && (
            <div className={`${styles.summaryRow} ${styles.summaryDiscount}`}>
              <span>Multi-pet discount</span>
              <span>−${(discountCents / 100).toFixed(2)}</span>
            </div>
          )}
          <div className={`${styles.summaryRow} ${styles.summaryTotalRow}`}>
            <span>
              Estimated total{selectedPetIds.size > 1 ? ` · ${totalDurationMinutes} min` : ''}
            </span>
            <span className={styles.summaryTotalValue}>${(totalCents / 100).toFixed(2)}</span>
          </div>
          <p className={styles.summaryNote}>Final price is set by the groomer when your appointment is complete.</p>
        </div>
      )}

      {!hasPaymentMethod && (
        <div className={`card ${styles.paymentNotice}`}>
          <p className={styles.paymentNoticeText}>Add a payment method before booking. You&apos;ll be charged after your appointment is complete.</p>
          <button type="button" className="sign-in-footer-link" onClick={() => router.push('/book/account')}>
            Go to Account
          </button>
        </div>
      )}

      {submitError && <p className="sign-in-error">{submitError}</p>}
      {loadError && <p className="sign-in-error">{loadError}</p>}

      <Button label="Confirm booking" onClick={handleConfirm} disabled={!canConfirm} loading={submitting} block />
    </div>
  );
}
