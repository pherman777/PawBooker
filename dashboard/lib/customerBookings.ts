import { customerSupabase } from '@/lib/customerSupabase';
import type { MultiPetDiscount } from '@/lib/discount';

export type CareNeeds = {
  isAnxious: boolean;
  isMatted: boolean;
  needsExtraCare: boolean;
  careNotes: string;
};

export const EMPTY_CARE_NEEDS: CareNeeds = {
  isAnxious: false,
  isMatted: false,
  needsExtraCare: false,
  careNotes: '',
};

export function careNeedsAnyFlag(value: CareNeeds): boolean {
  return value.isAnxious || value.isMatted || value.needsExtraCare;
}

export function careNeedsValid(value: CareNeeds): boolean {
  return !careNeedsAnyFlag(value) || value.careNotes.trim().length > 0;
}

export function careNeedsToRow(care: CareNeeds | undefined) {
  const c = care ?? EMPTY_CARE_NEEDS;
  return {
    is_anxious: c.isAnxious,
    is_matted: c.isMatted,
    needs_extra_care: c.needsExtraCare,
    care_notes: c.careNotes.trim() || null,
  };
}

type CareNeedsRow = ReturnType<typeof careNeedsToRow>;

export type PetBookingInput = {
  serviceId: string;
  durationMinutes: number;
};

export type GroupBookingInput = {
  customerId: string;
  customerEmail?: string;
  customerName?: string;
  groomerId: string;
  staffId: string | null;
  petIds: string[];
  petServices: Record<string, PetBookingInput>;
  arrivalAt: Date;
  discount: MultiPetDiscount | null;
  careNeedsByPet: Record<string, CareNeedsRow>;
};

// Port of services/bookings.ts's createGroupBooking, verbatim except for the
// client it runs against.
export async function createGroupBooking(input: GroupBookingInput): Promise<{ bookingIds: string[]; groupId: string }> {
  const discountApplies = input.discount != null && input.petIds.length >= input.discount.minPets;

  const { data: group, error: groupError } = await customerSupabase
    .from('booking_groups')
    .insert({
      customer_id: input.customerId,
      groomer_id: input.groomerId,
      staff_id: input.staffId,
      arrival_at: input.arrivalAt.toISOString(),
      discount_type: discountApplies ? input.discount!.type : null,
      discount_value: discountApplies ? input.discount!.value : null,
    })
    .select('id')
    .single();

  if (groupError || !group) {
    throw new Error(groupError?.message ?? 'Could not create booking group');
  }

  let elapsedMinutes = 0;
  const rows = input.petIds.map((petId) => {
    const petService = input.petServices[petId];
    const startsAt = new Date(input.arrivalAt);
    startsAt.setMinutes(startsAt.getMinutes() + elapsedMinutes);
    elapsedMinutes += petService.durationMinutes;
    return {
      customer_id: input.customerId,
      customer_email: input.customerEmail,
      customer_name: input.customerName,
      groomer_id: input.groomerId,
      pet_id: petId,
      service_id: petService.serviceId,
      staff_id: input.staffId,
      group_id: group.id,
      starts_at: startsAt.toISOString(),
      status: 'pending',
      ...input.careNeedsByPet[petId],
    };
  });

  const { data: inserted, error: bookingsError } = await customerSupabase
    .from('bookings')
    .insert(rows)
    .select('id, starts_at')
    .order('starts_at', { ascending: true });

  if (bookingsError || !inserted) {
    throw new Error(bookingsError?.message ?? 'Could not create bookings');
  }

  return { bookingIds: inserted.map((b) => b.id), groupId: group.id };
}

// Port of app/booking/[groomerId].tsx's single-pet path (no group wrapper).
export async function createSingleBooking(input: {
  customerId: string;
  customerEmail?: string;
  customerName?: string;
  groomerId: string;
  petId: string;
  serviceId: string;
  staffId: string | null;
  startsAt: Date;
  careNeeds: CareNeedsRow;
}): Promise<string> {
  const { data: inserted, error } = await customerSupabase
    .from('bookings')
    .insert({
      customer_id: input.customerId,
      customer_email: input.customerEmail,
      customer_name: input.customerName,
      groomer_id: input.groomerId,
      pet_id: input.petId,
      service_id: input.serviceId,
      staff_id: input.staffId,
      starts_at: input.startsAt.toISOString(),
      status: 'pending',
      ...input.careNeeds,
    })
    .select('id')
    .single();

  if (error || !inserted) throw new Error(error?.message ?? 'Booking failed');
  return inserted.id;
}
