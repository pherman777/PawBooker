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
        'customer_id, group_id, starts_at, cancellation_reason, customer_email, groomers(name, address, email, user_id, timezone), groomer_services(name, duration_minutes), pets(name, is_anxious, is_matted, needs_extra_care, care_notes, is_microchipped, microchip_number, vet_name, vet_phone)'
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

    type PetShape = {
      name: string;
      is_anxious?: boolean;
      is_matted?: boolean;
      needs_extra_care?: boolean;
      care_notes?: string | null;
      is_microchipped?: boolean;
      microchip_number?: string | null;
      vet_name?: string | null;
      vet_phone?: string | null;
    };

    // A multi-pet "group" booking sends a single email for the lead booking, so
    // pull every pet in the group and name them all. A standalone booking is just
    // a group of one.
    let petRows: PetShape[] = [booking.pets as unknown as PetShape];
    const groupId = (booking as unknown as { group_id: string | null }).group_id;
    if (groupId) {
      const { data: groupPets } = await supabase
        .from('bookings')
        .select(
          'starts_at, pets(name, is_anxious, is_matted, needs_extra_care, care_notes, is_microchipped, microchip_number, vet_name, vet_phone)'
        )
        .eq('group_id', groupId)
        .order('starts_at', { ascending: true });
      if (groupPets && groupPets.length > 0) {
        petRows = groupPets.map((r) => r.pets as unknown as PetShape);
      }
    }

    const petNames = petRows.map((p) => p.name);
    const isPlural = petNames.length > 1;
    // "Maggie" · "Maggie and Bella" · "Maggie, Bella, and Rocky"
    const petsLabel =
      petNames.length <= 1
        ? petNames[0] ?? 'your pet'
        : petNames.length === 2
          ? `${petNames[0]} and ${petNames[1]}`
          : `${petNames.slice(0, -1).join(', ')}, and ${petNames[petNames.length - 1]}`;

    function careLinesFor(p: PetShape): string[] {
      const flags = [
        p.is_anxious ? 'may be nervous / nip' : null,
        p.is_matted ? 'matting / tangled coat' : null,
        p.needs_extra_care ? 'needs extra time / care' : null,
      ].filter(Boolean) as string[];
      const lines: string[] = [];
      for (const flag of flags) lines.push(`• ${flag}`);
      if (p.care_notes?.trim()) lines.push(`Notes from the owner: ${p.care_notes.trim()}`);
      if (p.is_microchipped) {
        lines.push(`Microchipped${p.microchip_number?.trim() ? `: ${p.microchip_number.trim()}` : ''}`);
      }
      const vet = [p.vet_name?.trim(), p.vet_phone?.trim()].filter(Boolean).join(' · ');
      if (vet) lines.push(`Vet: ${vet}`);
      return lines;
    }

    // Short one-liner for push bodies: the unique heads-up flags across all pets.
    const allFlags = Array.from(
      new Set(
        petRows.flatMap(
          (p) =>
            [
              p.is_anxious ? 'may be nervous / nip' : null,
              p.is_matted ? 'matting / tangled coat' : null,
              p.needs_extra_care ? 'needs extra time / care' : null,
            ].filter(Boolean) as string[]
        )
      )
    );
    const careInline = allFlags.length > 0 ? `Heads up: ${allFlags.join(' · ')}` : '';

    // Fuller care block for the email. For a group, each pet gets its own labelled
    // section; a single pet keeps the original flat layout.
    let careEmailBlock = '';
    if (isPlural) {
      const sections: string[] = [];
      for (const p of petRows) {
        const lines = careLinesFor(p);
        if (lines.length > 0) sections.push(`${p.name}:\n${lines.join('\n')}`);
      }
      if (sections.length > 0) {
        careEmailBlock = `\n\nHeads up before this appointment:\n\n${sections.join('\n\n')}`;
      }
    } else {
      const lines = careLinesFor(petRows[0]);
      if (lines.length > 0) careEmailBlock = `\n\nHeads up before this appointment:\n${lines.join('\n')}`;
    }
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
      text = `Good news! ${groomer.name} accepted your ${service.name} appointment for ${petsLabel} on ${when}.`;
      pushUserId = booking.customer_id;
      pushTitle = 'Booking confirmed';
      pushBody = `${groomer.name} accepted your ${service.name} appointment for ${petsLabel}.`;

      const icsContent = buildIcsEvent({
        uid: bookingId,
        startsAt: new Date(booking.starts_at),
        // The whole visit blocks a span of one slot per pet, back-to-back.
        durationMinutes: service.duration_minutes * petRows.length,
        summary: `${service.name} for ${petsLabel} at ${groomer.name}`,
        location: groomer.address,
        description: `${groomer.name} accepted your ${service.name} appointment for ${petsLabel}.`,
      });
      icsAttachment = { filename: 'appointment.ics', content: base64Encode(icsContent) };
    } else if (action === 'groomer_cancelled') {
      emailTo = booking.customer_email;
      subject = `Your appointment at ${groomer.name} was cancelled`;
      text = `${groomer.name} cancelled your ${service.name} appointment for ${petsLabel} on ${when}.\n\nReason: ${booking.cancellation_reason ?? 'No reason given'}`;
      pushUserId = booking.customer_id;
      pushTitle = 'Booking cancelled';
      pushBody = `${groomer.name} cancelled your ${service.name} appointment for ${petsLabel}.`;
    } else if (action === 'customer_cancelled') {
      emailTo = groomer.email;
      subject = `A booking was cancelled: ${service.name} for ${petsLabel}`;
      text = `A customer cancelled their ${service.name} appointment for ${petsLabel} on ${when}.\n\nReason: ${booking.cancellation_reason ?? 'No reason given'}`;
      pushUserId = groomer.user_id;
      pushTitle = 'Booking cancelled';
      pushBody = `A customer cancelled their ${service.name} appointment for ${petsLabel}.`;
    } else if (action === 'booking_requested') {
      emailTo = groomer.email;
      subject = `New booking request: ${service.name} for ${petsLabel}`;
      text = `${petsLabel} ${isPlural ? 'need' : 'needs'} a ${service.name} on ${when}.${careEmailBlock}\n\nOpen PawBooker to accept or decline this request.`;
      pushUserId = groomer.user_id;
      pushTitle = 'New booking request';
      pushBody = `${petsLabel} ${isPlural ? 'need' : 'needs'} a ${service.name} on ${when}.${careInline ? `\n⚠ ${careInline}` : ''}`;
    } else if (action === 'service_completed') {
      emailTo = booking.customer_email;
      subject = `${petsLabel} ${isPlural ? 'are' : 'is'} ready for pickup at ${groomer.name}!`;
      text = `${petsLabel}'s ${service.name} is all done at ${groomer.name} — ready for pickup whenever you can swing by.`;
      pushUserId = booking.customer_id;
      pushTitle = 'Ready for pickup!';
      pushBody = `${petsLabel}'s ${service.name} is done at ${groomer.name}.`;
    } else if (action === 'declined') {
      emailTo = booking.customer_email;
      subject = `Your request at ${groomer.name} — a note about timing`;
      text = `${groomer.name} couldn't take your ${service.name} appointment for ${petsLabel} on ${when}.\n\nNote from ${groomer.name}: ${booking.cancellation_reason ?? 'No note given'}\n\nOpen PawBooker to rebook for a time that works.`;
      pushUserId = booking.customer_id;
      pushTitle = 'A note about your request';
      pushBody = `${groomer.name} suggested another time for ${petsLabel}'s ${service.name}. Tap to rebook.`;
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
