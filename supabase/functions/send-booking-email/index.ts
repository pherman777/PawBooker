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
        'customer_id, group_id, starts_at, cancellation_reason, customer_email, is_anxious, is_matted, needs_extra_care, care_notes, groomers(name, address, email, user_id, timezone), groomer_services(name, duration_minutes), pets(name, is_microchipped, microchip_number, vet_name, vet_phone)'
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

    type PetIdentity = {
      name: string;
      is_microchipped?: boolean;
      microchip_number?: string | null;
      vet_name?: string | null;
      vet_phone?: string | null;
    };
    type BookingCare = {
      is_anxious?: boolean;
      is_matted?: boolean;
      needs_extra_care?: boolean;
      care_notes?: string | null;
    };
    type ServiceShape = { name: string; duration_minutes?: number };
    type PetShape = PetIdentity & BookingCare & { serviceName: string; serviceDurationMinutes: number };

    function toPetShape(bookingRow: BookingCare, petRow: PetIdentity | null, serviceRow: ServiceShape | null): PetShape {
      return {
        name: petRow?.name ?? 'Pet',
        is_microchipped: petRow?.is_microchipped,
        microchip_number: petRow?.microchip_number,
        vet_name: petRow?.vet_name,
        vet_phone: petRow?.vet_phone,
        is_anxious: bookingRow.is_anxious,
        is_matted: bookingRow.is_matted,
        needs_extra_care: bookingRow.needs_extra_care,
        care_notes: bookingRow.care_notes,
        serviceName: serviceRow?.name ?? 'Service',
        serviceDurationMinutes: serviceRow?.duration_minutes ?? service.duration_minutes,
      };
    }

    // A multi-pet "group" booking sends a single email for the lead booking, so
    // pull every pet in the group and name them all - each with its own service,
    // since a group visit can now mix different services per pet. A standalone
    // booking is just a group of one.
    let petRows: PetShape[] = [
      toPetShape(
        booking,
        booking.pets as unknown as PetIdentity | null,
        booking.groomer_services as unknown as ServiceShape | null
      ),
    ];
    const groupId = (booking as unknown as { group_id: string | null }).group_id;
    if (groupId) {
      const { data: groupPets } = await supabase
        .from('bookings')
        .select(
          'starts_at, is_anxious, is_matted, needs_extra_care, care_notes, pets(name, is_microchipped, microchip_number, vet_name, vet_phone), groomer_services(name, duration_minutes)'
        )
        .eq('group_id', groupId)
        .order('starts_at', { ascending: true });
      if (groupPets && groupPets.length > 0) {
        petRows = groupPets.map((r) =>
          toPetShape(r, r.pets as unknown as PetIdentity | null, r.groomer_services as unknown as ServiceShape | null)
        );
      }
    }

    // The common case is every pet in the visit sharing one service - keep the
    // simple "service for Maggie and Bella" phrasing then. When they differ,
    // naming just the lead pet's service would misrepresent what the other
    // pets are actually getting, so fall back to a neutral count and spell out
    // the real per-pet breakdown wherever the exact services matter.
    const uniqueServiceNames = Array.from(new Set(petRows.map((p) => p.serviceName)));
    const hasMixedServices = uniqueServiceNames.length > 1;
    const serviceLabel = hasMixedServices ? `${uniqueServiceNames.length} different services` : service.name;
    const perPetServiceBreakdown = petRows.map((p) => `${p.name}: ${p.serviceName}`).join('\n');

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

    // Appended to email bodies (never push, which stays short) whenever the
    // visit's pets don't all share one service, so the exact breakdown is
    // always available even though the headline sentence had to generalize.
    const breakdownSuffix = hasMixedServices ? `\n\nEach pet's service:\n${perPetServiceBreakdown}` : '';

    if (action === 'accepted') {
      emailTo = booking.customer_email;
      subject = `Your appointment at ${groomer.name} is confirmed`;
      text = `Good news! ${groomer.name} accepted your ${serviceLabel} appointment for ${petsLabel} on ${when}.${breakdownSuffix}`;
      pushUserId = booking.customer_id;
      pushTitle = 'Booking confirmed';
      pushBody = `${groomer.name} accepted your ${serviceLabel} appointment for ${petsLabel}.`;

      const icsContent = buildIcsEvent({
        uid: bookingId,
        startsAt: new Date(booking.starts_at),
        // The whole visit blocks a span of the sum of each pet's own service
        // length, back-to-back.
        durationMinutes: petRows.reduce((sum, p) => sum + p.serviceDurationMinutes, 0),
        summary: `${serviceLabel} for ${petsLabel} at ${groomer.name}`,
        location: groomer.address,
        description: `${groomer.name} accepted your ${serviceLabel} appointment for ${petsLabel}.${breakdownSuffix}`,
      });
      icsAttachment = { filename: 'appointment.ics', content: base64Encode(icsContent) };
    } else if (action === 'groomer_cancelled') {
      emailTo = booking.customer_email;
      subject = `Your appointment at ${groomer.name} was cancelled`;
      text = `${groomer.name} cancelled your ${serviceLabel} appointment for ${petsLabel} on ${when}.\n\nReason: ${booking.cancellation_reason ?? 'No reason given'}${breakdownSuffix}`;
      pushUserId = booking.customer_id;
      pushTitle = 'Booking cancelled';
      pushBody = `${groomer.name} cancelled your ${serviceLabel} appointment for ${petsLabel}.`;
    } else if (action === 'customer_cancelled') {
      emailTo = groomer.email;
      subject = `A booking was cancelled: ${serviceLabel} for ${petsLabel}`;
      text = `A customer cancelled their ${serviceLabel} appointment for ${petsLabel} on ${when}.\n\nReason: ${booking.cancellation_reason ?? 'No reason given'}${breakdownSuffix}`;
      pushUserId = groomer.user_id;
      pushTitle = 'Booking cancelled';
      pushBody = `A customer cancelled their ${serviceLabel} appointment for ${petsLabel}.`;
    } else if (action === 'booking_requested') {
      emailTo = groomer.email;
      subject = `New booking request: ${serviceLabel} for ${petsLabel}`;
      text = `${petsLabel} ${isPlural ? 'need' : 'needs'} a ${serviceLabel} on ${when}.${breakdownSuffix}${careEmailBlock}\n\nOpen PawBooker to accept or decline this request.`;
      pushUserId = groomer.user_id;
      pushTitle = 'New booking request';
      pushBody = `${petsLabel} ${isPlural ? 'need' : 'needs'} a ${serviceLabel} on ${when}.${careInline ? `\n⚠ ${careInline}` : ''}`;
    } else if (action === 'service_completed') {
      emailTo = booking.customer_email;
      subject = `${petsLabel} ${isPlural ? 'are' : 'is'} ready for pickup at ${groomer.name}!`;
      text = `${petsLabel}'s ${serviceLabel} ${isPlural ? 'are' : 'is'} all done at ${groomer.name} — ready for pickup whenever you can swing by.${breakdownSuffix}`;
      pushUserId = booking.customer_id;
      pushTitle = 'Ready for pickup!';
      pushBody = `${petsLabel}'s ${serviceLabel} ${isPlural ? 'are' : 'is'} done at ${groomer.name}.`;
    } else if (action === 'declined') {
      emailTo = booking.customer_email;
      subject = `Your request at ${groomer.name} — a note about timing`;
      text = `${groomer.name} couldn't take your ${serviceLabel} appointment for ${petsLabel} on ${when}.\n\nNote from ${groomer.name}: ${booking.cancellation_reason ?? 'No note given'}\n\nOpen PawBooker to rebook for a time that works.${breakdownSuffix}`;
      pushUserId = booking.customer_id;
      pushTitle = 'A note about your request';
      pushBody = `${groomer.name} suggested another time for ${petsLabel}'s ${serviceLabel}. Tap to rebook.`;
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
