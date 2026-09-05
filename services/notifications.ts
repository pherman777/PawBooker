import * as Notifications from 'expo-notifications';

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

// Recomputes the app icon's badge count from actual unread chat threads -
// the same last-message-vs-last-read-at check the Messages screens use to
// show their per-thread unread dots (app/(tabs)/messages.tsx and
// app/(salon)/messages.tsx) - and applies it via expo-notifications. Call
// this whenever unread state might have changed client-side (app launch,
// after marking a thread read) so the badge doesn't go stale between pushes.
export async function refreshUnreadBadge(isGroomer: boolean) {
  try {
    const lastReadColumn = isGroomer ? 'groomer_last_read_at' : 'customer_last_read_at';
    const senderType = isGroomer ? 'groomer' : 'customer';

    let threadsQuery = supabase.from('chat_threads').select(`id, ${lastReadColumn}`);
    if (!isGroomer) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      threadsQuery = threadsQuery.eq('customer_id', user.id).eq('thread_type', 'groomer');
    }
    const { data: threads } = await threadsQuery;

    if (!threads || threads.length === 0) {
      await Notifications.setBadgeCountAsync(0);
      return;
    }

    const threadIds = threads.map((t) => t.id as string);
    const { data: messages } = await supabase
      .from('chat_messages')
      .select('thread_id, sender_type, created_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false });

    const lastByThread = new Map<string, { senderType: string; createdAt: string }>();
    for (const m of messages ?? []) {
      if (!lastByThread.has(m.thread_id)) {
        lastByThread.set(m.thread_id, { senderType: m.sender_type, createdAt: m.created_at });
      }
    }

    let unread = 0;
    for (const t of threads as Record<string, unknown>[]) {
      const last = lastByThread.get(t.id as string);
      const lastReadAt = t[lastReadColumn] as string | null;
      if (last && last.senderType !== senderType && (!lastReadAt || new Date(last.createdAt) > new Date(lastReadAt))) {
        unread++;
      }
    }
    await Notifications.setBadgeCountAsync(unread);
  } catch (err) {
    console.warn('refreshUnreadBadge failed', err);
  }
}
