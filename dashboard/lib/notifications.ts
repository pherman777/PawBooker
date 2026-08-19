import { supabase } from '@/lib/supabase';

// Ported from services/notifications.ts / services/availability.ts - plain
// Supabase Edge Function calls and queries, identical from any client.
export async function sendBookingEmail(
  bookingId: string,
  action: 'accepted' | 'declined' | 'service_completed' | 'groomer_cancelled'
) {
  const { error } = await supabase.functions.invoke('send-booking-email', {
    body: { bookingId, action },
  });
  if (error) console.warn('send-booking-email failed', error);
}

// Unlike sendBookingEmail, this is the primary action (not a side-effect of
// one already completed), so callers should catch and surface the error
// rather than treat it as fire-and-forget.
export async function sendCustomerReminder(reminderId: string) {
  const { error } = await supabase.functions.invoke('send-customer-reminder', {
    body: { reminderId },
  });
  if (error) throw error;
}

export type SalonStaff = { id: string; name: string };

export async function fetchActiveStaff(salonId: string): Promise<SalonStaff[]> {
  const { data, error } = await supabase
    .from('salon_staff')
    .select('id, name')
    .eq('salon_id', salonId)
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, name: row.name }));
}
