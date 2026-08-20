import { supabase } from '@/services/supabase';
import type { MultiPetDiscount } from '@/utils/discount';

type CareNeedsRow = {
  is_anxious: boolean;
  is_matted: boolean;
  needs_extra_care: boolean;
  care_notes: string | null;
};

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

// Creates a multi-pet group booking: one booking_groups row plus one bookings
// row per pet at sequential start times (arrival, arrival + previous pets'
// service durations, ...), all sharing the group id and assigned groomer. Each
// pet can have its own service - keeping each pet as its own booking row means
// availability, completion, invoicing, and payments all keep working per-pet
// unchanged. Returns the created booking ids ordered by start time - the first
// is the "lead" booking used for the single group notification.
export async function createGroupBooking(
  input: GroupBookingInput
): Promise<{ bookingIds: string[]; groupId: string }> {
  const discountApplies =
    input.discount != null && input.petIds.length >= input.discount.minPets;

  const { data: group, error: groupError } = await supabase
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

  const { data: inserted, error: bookingsError } = await supabase
    .from('bookings')
    .insert(rows)
    .select('id, starts_at')
    .order('starts_at', { ascending: true });

  if (bookingsError || !inserted) {
    throw new Error(bookingsError?.message ?? 'Could not create bookings');
  }

  return { bookingIds: inserted.map((b) => b.id), groupId: group.id };
}
