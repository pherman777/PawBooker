import { customerSupabase } from '@/lib/customerSupabase';
import type { ClosedRange } from '@/lib/availability';

// Customer-facing port of services/notifications.ts / services/availability.ts,
// using customerSupabase. A separate file from lib/notifications.ts (the
// groomer dashboard's, using the groomer supabase client) - same reasoning as
// lib/customerStripe.ts.

export type BookingEmailAction = 'accepted' | 'groomer_cancelled' | 'customer_cancelled' | 'booking_requested' | 'service_completed' | 'declined';

export async function sendBookingEmail(bookingId: string, action: BookingEmailAction) {
  const { error } = await customerSupabase.functions.invoke('send-booking-email', {
    body: { bookingId, action },
  });
  if (error) console.warn('send-booking-email failed', error);
}

export type GroomerNotificationType = 'booking_requested' | 'booking_cancelled' | 'booking_rescheduled';

export async function notifyGroomer(groomerId: string, bookingId: string, type: GroomerNotificationType) {
  const { error } = await customerSupabase.from('groomer_notifications').insert({
    groomer_id: groomerId,
    booking_id: bookingId,
    type,
  });
  if (error) console.warn('notifyGroomer failed', error);
}

export type SalonStaff = { id: string; name: string };

export async function fetchActiveStaff(salonId: string): Promise<SalonStaff[]> {
  const { data, error } = await customerSupabase
    .from('salon_staff')
    .select('id, name')
    .eq('salon_id', salonId)
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, name: row.name }));
}

export type BusyInterval = {
  startsAt: Date;
  durationMinutes: number;
  staffId: string | null;
};

export async function fetchBusyIntervals(salonId: string, from: Date, to: Date): Promise<BusyInterval[]> {
  const { data, error } = await customerSupabase.rpc('salon_busy_intervals', {
    p_salon_id: salonId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error || !data) return [];
  return (data as { starts_at: string; duration_minutes: number; staff_id: string | null }[]).map((row) => ({
    startsAt: new Date(row.starts_at),
    durationMinutes: row.duration_minutes,
    staffId: row.staff_id,
  }));
}

function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// One-off closed dates (holidays, vacation) for a salon overlapping the given
// window - layered on top of its recurring weekly hours.
export async function fetchClosures(salonId: string, from: Date, to: Date): Promise<ClosedRange[]> {
  const { data, error } = await customerSupabase
    .from('groomer_closures')
    .select('start_date, end_date, note')
    .eq('groomer_id', salonId)
    .lte('start_date', dateOnly(to))
    .gte('end_date', dateOnly(from));

  if (error || !data) return [];
  return data as ClosedRange[];
}
