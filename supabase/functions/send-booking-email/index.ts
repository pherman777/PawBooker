import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { pushTokensForUser, sendExpoPushToTokens } from '../_shared/push.ts';
import { base64Encode, buildIcsEvent } from '../_shared/ics.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_ADDRESS = 'PawBooker <notifications@paw-booker.com>';

type Action =
  | 'accepted'
  | 'groomer_cancelled'
  | 'customer_cancelled'
  | 'booking_requested'
  | 'service_completed'
  | 'declined';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { bookingId, action } = (await req.json()) as { bookingId: string; action: Action };

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: booking, error } = await supabase
      .from('bookings')
      .select(
        'customer_id, starts_at, cancellation_reason, customer_email, groomers(name, address, email, user_id, timezone), groomer_services(name, duration_minutes), pets(name)'
      )
      .eq('id', bookingId)
      .single();

    if (error || !booking) {
      return jsonResponse({ error: error?.message ?? 'Booking not found' }, 404);
    }

    const groomer = booking.groomers as unknown as {
      name: string;
      address: string;
      email: string | null;
      user_id: string | null;
      timezone: string;
    };
    const service = booking.groomer_services as unknown as { name: string; duration_minutes: number };
    const pet = booking.pets as unknown as { name: string };
    const when = new Date(booking.starts_at).toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: groomer.timezone,
    });

    let emailTo: string | null = null;
    let subject = '';
    let text = '';
    let pushUserId: string | null = null;
    let pushTitle = '';
    let pushBody = '';
    let icsAttachment: { filename: string; content: string } | null = null;

    if (action === 'accepted') {
      emailTo = booking.customer_email;
      subject = `Your appointment at ${groomer.name} is confirmed`;
      text = `Good news! ${groomer.name} accepted your ${service.name} appointment for ${pet.name} on ${when}.`;
      pushUserId = booking.customer_id;
      pushTitle = 'Booking confirmed';
      pushBody = `${groomer.name} accepted your ${service.name} appointment for ${pet.name}.`;

      const icsContent = buildIcsEvent({
        uid: bookingId,
        startsAt: new Date(booking.starts_at),
        durationMinutes: service.duration_minutes,
        summary: `${service.name} for ${pet.name} at ${groomer.name}`,
        location: groomer.address,
        description: `${groomer.name} accepted your ${service.name} appointment for ${pet.name}.`,
      });
      icsAttachment = { filename: 'appointment.ics', content: base64Encode(icsContent) };
    } else if (action === 'groomer_cancelled') {
      emailTo = booking.customer_email;
      subject = `Your appointment at ${groomer.name} was cancelled`;
      text = `${groomer.name} cancelled your ${service.name} appointment for ${pet.name} on ${when}.\n\nReason: ${booking.cancellation_reason ?? 'No reason given'}`;
      pushUserId = booking.customer_id;
      pushTitle = 'Booking cancelled';
      pushBody = `${groomer.name} cancelled your ${service.name} appointment for ${pet.name}.`;
    } else if (action === 'customer_cancelled') {
      emailTo = groomer.email;
      subject = `A booking was cancelled: ${service.name} for ${pet.name}`;
      text = `A customer cancelled their ${service.name} appointment for ${pet.name} on ${when}.\n\nReason: ${booking.cancellation_reason ?? 'No reason given'}`;
      pushUserId = groomer.user_id;
      pushTitle = 'Booking cancelled';
      pushBody = `A customer cancelled their ${service.name} appointment for ${pet.name}.`;
    } else if (action === 'booking_requested') {
      pushUserId = groomer.user_id;
      pushTitle = 'New booking request';
      pushBody = `${pet.name} needs a ${service.name} on ${when}.`;
    } else if (action === 'service_completed') {
      emailTo = booking.customer_email;
      subject = `${pet.name} is ready for pickup at ${groomer.name}!`;
      text = `${pet.name}'s ${service.name} is all done at ${groomer.name} — ready for pickup whenever you can swing by.`;
      pushUserId = booking.customer_id;
      pushTitle = 'Ready for pickup!';
      pushBody = `${pet.name}'s ${service.name} is done at ${groomer.name}.`;
    } else if (action === 'declined') {
      emailTo = booking.customer_email;
      subject = `Your request at ${groomer.name} — a note about timing`;
      text = `${groomer.name} couldn't take your ${service.name} appointment for ${pet.name} on ${when}.\n\nNote from ${groomer.name}: ${booking.cancellation_reason ?? 'No note given'}\n\nOpen PawBooker to rebook for a time that works.`;
      pushUserId = booking.customer_id;
      pushTitle = 'A note about your request';
      pushBody = `${groomer.name} suggested another time for ${pet.name}'s ${service.name}. Tap to rebook.`;
    }

    if (pushUserId) {
      const tokens = await pushTokensForUser(serviceRoleClient, pushUserId);
      await sendExpoPushToTokens(tokens, pushTitle, pushBody, { bookingId });
    }

    if (!emailTo) {
      return jsonResponse({ skipped: true, reason: 'No recipient email on file' });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: emailTo,
        subject,
        text,
        ...(icsAttachment ? { attachments: [icsAttachment] } : {}),
      }),
    });

    if (!resendResponse.ok) {
      const body = await resendResponse.text();
      return jsonResponse({ error: `Resend failed: ${body}` }, 502);
    }

    return jsonResponse({ sent: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
