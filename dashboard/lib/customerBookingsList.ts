import { customerSupabase } from '@/lib/customerSupabase';

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'declined';
export type PaymentStatus = 'unpaid' | 'paid' | 'failed';

export type BookingReview = {
  rating: number;
  comment: string;
};

export type BookingRow = {
  id: string;
  groupId?: string;
  groomerId: string;
  serviceId: string;
  petId: string;
  startsAt: string;
  status: BookingStatus;
  groomerName: string;
  groomerAddress?: string;
  groomerLatitude?: number;
  groomerLongitude?: number;
  serviceName: string;
  serviceDurationMinutes: number;
  petName: string;
  cancellationReason?: string;
  review?: BookingReview;
  invoiceTotalCents?: number;
  taxAmountCents?: number;
  tipAmountCents?: number;
  paymentStatus?: PaymentStatus;
};

export type BookingEntry = {
  key: string;
  bookings: BookingRow[];
  lead: BookingRow;
};

// Port of app/(tabs)/bookings.tsx's groupEntries/groupStatus (pure functions).
export function groupEntries(rows: BookingRow[]): BookingEntry[] {
  const entries: BookingEntry[] = [];
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

export function groupStatus(rows: BookingRow[]): BookingStatus {
  if (rows.every((b) => b.status === 'completed')) return 'completed';
  const order: BookingStatus[] = ['pending', 'confirmed', 'cancelled', 'declined', 'completed'];
  for (const status of order) {
    if (rows.some((b) => b.status === status)) return status;
  }
  return rows[0].status;
}

export async function fetchCustomerBookings(customerId: string): Promise<BookingRow[]> {
  const [bookingsResult, reviewsResult] = await Promise.all([
    customerSupabase
      .from('bookings')
      .select(
        'id, group_id, groomer_id, service_id, pet_id, starts_at, status, payment_status, cancellation_reason, invoice_total_cents, tax_amount_cents, tip_amount_cents, groomers(name, address, latitude, longitude), groomer_services(name, duration_minutes), pets(name)'
      )
      .eq('customer_id', customerId)
      .order('starts_at', { ascending: false }),
    customerSupabase.from('salon_reviews').select('booking_id, rating, comment').eq('customer_id', customerId),
  ]);

  if (bookingsResult.error) throw bookingsResult.error;

  const reviewsByBooking = new Map((reviewsResult.data ?? []).map((r) => [r.booking_id, { rating: r.rating, comment: r.comment ?? '' }]));

  return (bookingsResult.data ?? []).map((row) => ({
    id: row.id,
    groupId: row.group_id ?? undefined,
    groomerId: row.groomer_id,
    serviceId: row.service_id,
    petId: row.pet_id,
    startsAt: row.starts_at,
    status: row.status,
    cancellationReason: row.cancellation_reason ?? undefined,
    groomerName: (row.groomers as unknown as { name: string } | null)?.name ?? 'Unknown groomer',
    groomerAddress: (row.groomers as unknown as { address: string | null } | null)?.address ?? undefined,
    groomerLatitude: (row.groomers as unknown as { latitude: number | null } | null)?.latitude ?? undefined,
    groomerLongitude: (row.groomers as unknown as { longitude: number | null } | null)?.longitude ?? undefined,
    serviceName: (row.groomer_services as unknown as { name: string } | null)?.name ?? 'Service',
    serviceDurationMinutes: (row.groomer_services as unknown as { duration_minutes: number | null } | null)?.duration_minutes ?? 60,
    petName: (row.pets as unknown as { name: string } | null)?.name ?? 'Pet',
    review: reviewsByBooking.get(row.id),
    invoiceTotalCents: row.invoice_total_cents ?? undefined,
    taxAmountCents: row.tax_amount_cents ?? undefined,
    tipAmountCents: row.tip_amount_cents ?? undefined,
    paymentStatus: row.payment_status ?? undefined,
  }));
}

export async function cancelBookings(ids: string[], reason: string): Promise<void> {
  const { error } = await customerSupabase.from('bookings').update({ status: 'cancelled', cancellation_reason: reason, cancelled_by: 'customer' }).in('id', ids);
  if (error) throw error;
}

export async function submitBookingReview(input: { bookingId: string; groomerId: string; customerId: string; rating: number; comment: string }): Promise<void> {
  const { error } = await customerSupabase
    .from('salon_reviews')
    .upsert({ booking_id: input.bookingId, groomer_id: input.groomerId, customer_id: input.customerId, rating: input.rating, comment: input.comment || null }, { onConflict: 'booking_id' });
  if (error) throw error;
}
