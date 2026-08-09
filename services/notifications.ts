import { supabase } from '@/services/supabase';
import type { GroomerNotificationType } from '@/types';

export type BookingEmailAction =
  | 'accepted'
  | 'groomer_cancelled'
  | 'customer_cancelled'
  | 'booking_requested'
  | 'service_completed'
  | 'declined';

export async function sendBookingEmail(bookingId: string, action: BookingEmailAction) {
  const { error } = await supabase.functions.invoke('send-booking-email', {
    body: { bookingId, action },
  });

  if (error) {
    console.warn('send-booking-email failed', error);
  }
}

export async function notifyGroomer(groomerId: string, bookingId: string, type: GroomerNotificationType) {
  const { error } = await supabase.from('groomer_notifications').insert({
    groomer_id: groomerId,
    booking_id: bookingId,
    type,
  });

  if (error) {
    console.warn('notifyGroomer failed', error);
  }
}

// Unlike sendBookingEmail, this is the primary action (not a side-effect of
// one already completed), so callers should catch and surface the error
// rather than treat it as fire-and-forget.
export async function sendCustomerReminder(reminderId: string) {
  const { error } = await supabase.functions.invoke('send-customer-reminder', {
    body: { reminderId },
  });

  if (error) {
    throw error;
  }
}
