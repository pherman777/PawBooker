import { supabase } from '@/lib/supabase';

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'declined';
export type PaymentStatus = 'unpaid' | 'paid' | 'failed';

export type PetCareInfo = {
  isAnxious?: boolean;
  isMatted?: boolean;
  needsExtraCare?: boolean;
  careNotes?: string;
  isMicrochipped?: boolean;
  microchipNumber?: string;
  vetName?: string;
  vetPhone?: string;
};

export type SalonBookingRow = {
  id: string;
  groupId?: string;
  customerId: string;
  startsAt: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  serviceCompletedAt?: string;
  serviceName: string;
  // Lives on groomer_services, not the booking row itself - joined in below.
  // Used to size/position blocks on the schedule grid (components/Schedule).
  durationMinutes: number;
  petName: string;
  petCare: PetCareInfo;
  staffName?: string;
  staffId?: string;
  cancellationReason?: string;
  invoiceTotalCents?: number;
  platformFeeCents?: number;
};

// A multi-pet visit (same group_id) shown as one card; standalone bookings
// are an entry of one. `bookings` is earliest-first; `lead` is the earliest.
// Ported from app/(salon)/index.tsx.
export type SalonEntry = {
  key: string;
  bookings: SalonBookingRow[];
  lead: SalonBookingRow;
};

export type ViewMode = 'list' | 'calendar';
export type StatFilter = 'pending' | 'upcoming' | 'ready_to_bill' | null;

type PetRow = {
  name: string;
  is_microchipped?: boolean;
  microchip_number?: string | null;
  vet_name?: string | null;
  vet_phone?: string | null;
};

export async function fetchSalonBookings(groomerId: string): Promise<SalonBookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, group_id, customer_id, starts_at, status, payment_status, service_completed_at, cancellation_reason, invoice_total_cents, platform_fee_cents, staff_id, is_anxious, is_matted, needs_extra_care, care_notes, pets(name, is_microchipped, microchip_number, vet_name, vet_phone), groomer_services(name, duration_minutes), salon_staff(name)'
    )
    .eq('groomer_id', groomerId)
    .order('starts_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const petRow = row.pets as unknown as PetRow | null;
    return {
      id: row.id,
      groupId: row.group_id ?? undefined,
      customerId: row.customer_id,
      startsAt: row.starts_at,
      status: row.status,
      paymentStatus: row.payment_status,
      serviceCompletedAt: row.service_completed_at ?? undefined,
      cancellationReason: row.cancellation_reason ?? undefined,
      invoiceTotalCents: row.invoice_total_cents ?? undefined,
      platformFeeCents: row.platform_fee_cents ?? undefined,
      serviceName: (row.groomer_services as unknown as { name: string })?.name ?? 'Service',
      durationMinutes: (row.groomer_services as unknown as { duration_minutes: number })?.duration_minutes ?? 60,
      petName: petRow?.name ?? 'Pet',
      petCare: {
        isAnxious: row.is_anxious ?? false,
        isMatted: row.is_matted ?? false,
        needsExtraCare: row.needs_extra_care ?? false,
        careNotes: row.care_notes ?? undefined,
        isMicrochipped: petRow?.is_microchipped ?? false,
        microchipNumber: petRow?.microchip_number ?? undefined,
        vetName: petRow?.vet_name ?? undefined,
        vetPhone: petRow?.vet_phone ?? undefined,
      },
      staffName: (row.salon_staff as unknown as { name: string } | null)?.name ?? undefined,
      staffId: row.staff_id ?? undefined,
    };
  });
}

export function groupSalonEntries(rows: SalonBookingRow[]): SalonEntry[] {
  const entries: SalonEntry[] = [];
  const indexByGroup = new Map<string, number>();
  for (const row of rows) {
    if (row.groupId) {
      const at = indexByGroup.get(row.groupId);
      if (at != null) {
        entries[at].bookings.push(row);
        continue;
      }
      indexByGroup.set(row.groupId, entries.length);
      entries.push({ key: row.groupId, bookings: [row], lead: row });
    } else {
      entries.push({ key: row.id, bookings: [row], lead: row });
    }
  }
  for (const entry of entries) {
    entry.bookings.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    entry.lead = entry.bookings[0];
  }
  return entries;
}

export function groupSalonStatus(rows: SalonBookingRow[]): BookingStatus {
  if (rows.every((b) => b.status === 'completed')) return 'completed';
  const order: BookingStatus[] = ['pending', 'confirmed', 'cancelled', 'declined', 'completed'];
  for (const status of order) {
    if (rows.some((b) => b.status === status)) return status;
  }
  return rows[0].status;
}

// A group is "ready to bill" once the groomer has marked the service done on
// every pet; "upcoming" while any pet still needs the service performed.
export function matchesStatFilterEntry(entry: SalonEntry, filter: StatFilter): boolean {
  const status = groupSalonStatus(entry.bookings);
  const allServiceCompleted = entry.bookings.every((b) => b.serviceCompletedAt);
  if (filter === 'pending') return status === 'pending';
  if (filter === 'upcoming') return status === 'confirmed' && !allServiceCompleted;
  if (filter === 'ready_to_bill') return status === 'confirmed' && allServiceCompleted;
  return true;
}
