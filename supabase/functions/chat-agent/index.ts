import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { pushTokensForUser, sendExpoPushToTokens } from '../_shared/push.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL')!;
const FROM_ADDRESS = 'PawBooker <notifications@paw-booker.com>';
const MODEL = 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 5;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type ToolResult = { success?: boolean; error?: string; [key: string]: unknown };

// Availability logic below is adapted from utils/availability.ts's
// computeAvailableTimes (edge functions run in Deno and can't import the RN
// app's source files across that module boundary, same reason
// dashboard/business-info/page.tsx inlines phone/email helpers instead of
// sharing them) - but reworked to be timezone-aware, since unlike the
// native/web booking screens (which run on the customer's own device and
// implicitly treat device-local time as salon-local time), this runs
// server-side on Deno Deploy in UTC and has to explicitly convert.
type BusyInterval = { startsAt: Date; durationMinutes: number };

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

// This function runs on Deno Deploy, which is always UTC - it is NOT the
// customer's device (unlike the native/web booking screens, which build
// Date objects in the device's own local time and implicitly rely on the
// customer being near the salon). A wall-clock "9:00 AM" in the salon's own
// timeZone has to be explicitly converted to the correct UTC instant here,
// or every AI-booked appointment would land off by the salon's UTC offset.
// Standard guess-and-correct technique using only Intl (no external tz lib
// available in this Deno runtime).
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(guess).map((p) => [p.type, p.value]));
  const observedHour = Number(parts.hour) % 24; // Intl can format midnight as "24"
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), observedHour, Number(parts.minute));
  const offsetMs = asIfUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

type TimeSlot = { label: string; startsAt: string };

// Every candidate slot is computed as a real, timezone-correct UTC instant
// via zonedTimeToUtc, then compared against busy intervals (already
// absolute UTC instants, straight from the DB) as absolute times - never as
// "minutes since midnight," which is meaningless without also knowing which
// timezone's midnight. availableTimes() returns both a human label (for the
// AI to relay as-is) and the exact ISO instant (for create_booking to
// receive back verbatim) so the model never has to compute a datetime
// itself.
function availableTimes(params: {
  year: number;
  month: number;
  day: number;
  dayHours: { open: string; close: string } | null;
  durationMinutes: number;
  busy: BusyInterval[];
  capacity: number;
  now: Date;
  timeZone: string;
}): TimeSlot[] {
  const { year, month, day, dayHours, durationMinutes, busy, capacity, now, timeZone } = params;
  if (!dayHours) return [];

  const openMin = timeToMinutes(dayHours.open);
  const closeMin = timeToMinutes(dayHours.close);

  const slots: TimeSlot[] = [];
  for (let start = openMin; start + durationMinutes <= closeMin; start += 30) {
    const slotStart = zonedTimeToUtc(year, month, day, Math.floor(start / 60), start % 60, timeZone);
    if (slotStart.getTime() <= now.getTime()) continue;
    const slotEndMs = slotStart.getTime() + durationMinutes * 60000;

    const overlapping = busy.filter((b) => {
      const bStart = b.startsAt.getTime();
      const bEnd = bStart + b.durationMinutes * 60000;
      return slotStart.getTime() < bEnd && bStart < slotEndMs;
    });
    if (overlapping.length >= Math.max(capacity, 1)) continue;

    const label = slotStart.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
    slots.push({ label, startsAt: slotStart.toISOString() });
  }
  return slots;
}

// A calendar date's weekday doesn't depend on timezone (Aug 24 2026 is a
// Monday everywhere) - safe to compute via UTC regardless of what timezone
// this function is actually running in.
function weekdayKeyForDate(year: number, month: number, day: number): (typeof DAY_KEYS)[number] {
  return DAY_KEYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const GROOMER_TOOLS = [
  {
    name: 'check_availability',
    description:
      "Check open appointment times for a specific date and service. Call this before proposing any new-appointment time to the customer - never guess or invent available times.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'The date to check, as YYYY-MM-DD (use the current year shown above unless the customer named a different one)' },
        service_name: { type: 'string', description: 'Must exactly match one of the salon services listed above' },
      },
      required: ['date', 'service_name'],
    },
  },
  {
    name: 'create_booking',
    description:
      "Book a new appointment. Only call this after the customer has explicitly confirmed a SPECIFIC time from check_availability's results, and a specific pet from their pet list above.",
    input_schema: {
      type: 'object',
      properties: {
        pet_name: { type: 'string', description: "Must exactly match one of the customer's pets listed above" },
        service_name: { type: 'string', description: 'Must exactly match one of the salon services listed above' },
        starts_at: {
          type: 'string',
          description:
            "The exact startsAt value from a slot check_availability returned - copy it exactly, never write your own datetime.",
        },
      },
      required: ['pet_name', 'service_name', 'starts_at'],
    },
  },
  {
    name: 'reschedule_booking',
    description:
      'Reschedule an existing booking to a new date and time. Only call this after the customer has explicitly confirmed a SPECIFIC new date/time in their most recent message.',
    input_schema: {
      type: 'object',
      properties: {
        booking_id: { type: 'string', description: 'The id of the booking to reschedule' },
        new_starts_at: { type: 'string', description: 'New appointment time as an ISO 8601 datetime string' },
      },
      required: ['booking_id', 'new_starts_at'],
    },
  },
  {
    name: 'cancel_booking',
    description:
      'Cancel an existing booking. Only call this after the customer has explicitly confirmed they want to cancel in their most recent message.',
    input_schema: {
      type: 'object',
      properties: {
        booking_id: { type: 'string' },
        reason: { type: 'string', description: "Brief reason for the cancellation, based on what the customer said" },
      },
      required: ['booking_id', 'reason'],
    },
  },
  {
    name: 'escalate_to_groomer',
    description:
      "Flag this conversation so the groomer is notified immediately and takes over personally. Use this for complaints, special/unusual requests, disputes, pricing questions, or anything you are not confident resolving correctly yourself.",
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Brief summary of why this needs the groomer’s attention' },
      },
      required: ['reason'],
    },
  },
];

const APP_SUPPORT_TOOLS = [
  {
    name: 'escalate_to_admin',
    description:
      "Flag this conversation so the PawBooker team is notified and takes over personally. Use this for a complaint or dispute involving a specific groomer or customer, a report of abusive behavior, a billing problem, a bug, or anything else you're not confident answering yourself.",
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Brief summary of why this needs the team’s attention' },
      },
      required: ['reason'],
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { threadId, message } = (await req.json()) as { threadId: string; message: string };
    const authHeader = req.headers.get('Authorization')!;

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: thread, error: threadError } = await supabase
      .from('chat_threads')
      .select(
        'id, customer_id, groomer_id, thread_type, needs_human, groomers(name, phone, email, user_id, plan, timezone, hours, requires_rabies_vaccination, groomer_services(id, name, price_cents, duration_minutes))'
      )
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      return jsonResponse({ error: threadError?.message ?? 'Thread not found' }, 404);
    }

    const allowed = await checkRateLimit(serviceRoleClient, `chat-agent:${thread.customer_id}`, 20, 300);
    if (!allowed) {
      return jsonResponse({ error: 'Too many messages - please wait a moment and try again.' }, 429);
    }

    const { error: insertError } = await supabase.from('chat_messages').insert({
      thread_id: threadId,
      sender_type: 'customer',
      sender_id: thread.customer_id,
      body: message,
    });
    if (insertError) {
      return jsonResponse({ error: insertError.message }, 500);
    }

    const isAppSupport = thread.thread_type === 'app_support';

    const groomer = thread.groomers as unknown as {
      name: string;
      phone: string | null;
      email: string | null;
      user_id: string | null;
      plan: string;
      timezone: string;
      hours: Record<string, { open: string; close: string } | null> | null;
      requires_rabies_vaccination: boolean;
      groomer_services: { id: string; name: string; price_cents: number; duration_minutes: number }[];
    } | null;

    // Notify the groomer of every customer message regardless of plan or escalation
    // state - free-tier salons and already-escalated threads never get an AI
    // auto-reply, so this push is the only heads-up the groomer gets.
    if (!isAppSupport && groomer?.user_id) {
      const groomerTokens = await pushTokensForUser(serviceRoleClient, groomer.user_id);
      await sendExpoPushToTokens(groomerTokens, 'New message', message, { threadId });
    }

    if (thread.needs_human) {
      return jsonResponse({ handledByHuman: true });
    }

    // Free-tier salons don't get the AI assistant - the customer's message is
    // still saved above, but nobody auto-replies; the groomer answers manually.
    if (!isAppSupport && groomer?.plan !== 'pro') {
      return jsonResponse({ freeTier: true });
    }

    const { data: historyRows } = await supabase
      .from('chat_messages')
      .select('sender_type, body, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    const now = new Date();
    let systemPrompt: string;
    let toolsForThread: typeof GROOMER_TOOLS | typeof APP_SUPPORT_TOOLS;
    // Populated in the groomer-thread branch below, read by executeTool's
    // create_booking/check_availability cases further down.
    let eligiblePets: { id: string; name: string; species: string; eligible: boolean }[] = [];
    let salonBusy: BusyInterval[] = [];
    let salonCapacity = 1;

    if (isAppSupport) {
      toolsForThread = APP_SUPPORT_TOOLS;
      systemPrompt = `You are the PawBooker app support assistant. You help customers and groomers with questions about how the PawBooker app works, in a real-time chat, like text messaging.

Current date/time: ${now.toString()}

PawBooker is a marketplace app connecting pet owners with independent pet groomers. What the app can do:
- Customers: browse groomers, book appointments, message their groomer, pay by card/Apple Pay/Google Pay, save multiple payment methods and pick a default in Profile, leave a review and a tip after a completed appointment.
- Groomers: manage bookings from a dashboard, mark a service complete and send an invoice (by card or cash), view Insights (revenue, repeat customers, cancellations) on the Pro plan, and connect a bank account under Payouts to receive booking payments and tips directly.

Rules:
- You can only answer general questions about how the app works. You cannot look up or change a specific booking, charge, or account - you have no tools for that.
- Always call escalate_to_admin, rather than trying to resolve it yourself, for: a complaint or dispute involving a specific groomer or customer, a report of abusive behavior, a billing problem, a bug, or anything else you're not confident answering.
- Keep replies short and friendly, like a text message. No long paragraphs.`;
    } else {
      toolsForThread = GROOMER_TOOLS;

      const { data: bookingRows } = await supabase
        .from('bookings')
        .select(
          'id, starts_at, status, payment_status, invoice_total_cents, tax_amount_cents, groomer_services(name)'
        )
        .eq('customer_id', thread.customer_id)
        .eq('groomer_id', thread.groomer_id)
        .order('starts_at', { ascending: false })
        .limit(20);

      const bookingsSummary =
        (bookingRows ?? [])
          .map((b) => {
            const service = b.groomer_services as unknown as { name: string } | null;
            const when = new Date(b.starts_at).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: groomer!.timezone,
            });
            const billing =
              b.invoice_total_cents != null
                ? ` | charged $${(b.invoice_total_cents / 100).toFixed(2)} (tax $${((b.tax_amount_cents ?? 0) / 100).toFixed(2)}), payment_status=${b.payment_status}`
                : ` | payment_status=${b.payment_status}`;
            return `- id=${b.id} | ${service?.name ?? 'Service'} | ${when} | status=${b.status}${billing}`;
          })
          .join('\n') || 'No bookings on file.';

      const servicesSummary = (groomer!.groomer_services ?? [])
        .map((s) => `${s.name} ($${(s.price_cents / 100).toFixed(0)}, ${s.duration_minutes} min)`)
        .join(', ');

      const [petsResult, busyResult, staffResult] = await Promise.all([
        supabase
          .from('pets')
          .select('id, name, species, pet_documents(document_type, expires_at)')
          .eq('owner_id', thread.customer_id),
        supabase.rpc('salon_busy_intervals', {
          p_salon_id: thread.groomer_id,
          p_from: now.toISOString(),
          p_to: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        supabase.from('salon_staff').select('id').eq('salon_id', thread.groomer_id).eq('active', true),
      ]);

      const todayIso = now.toISOString().slice(0, 10);
      eligiblePets = (petsResult.data ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        species: p.species as string,
        eligible:
          !groomer!.requires_rabies_vaccination ||
          (p.pet_documents as { document_type: string; expires_at: string | null }[]).some(
            (d) => d.document_type === 'rabies_vaccination' && d.expires_at != null && d.expires_at >= todayIso
          ),
      }));
      const petsSummary =
        eligiblePets.map((p) => `${p.name} (${p.species}${p.eligible ? '' : ' - needs a current rabies vaccination on file before booking'})`).join(', ') ||
        'No pets on file yet.';

      salonBusy = ((busyResult.data ?? []) as { starts_at: string; duration_minutes: number }[]).map((b) => ({
        startsAt: new Date(b.starts_at),
        durationMinutes: b.duration_minutes,
      }));
      salonCapacity = Math.max((staffResult.data ?? []).length, 1);

      const hoursSummary = DAY_KEYS.map((day) => {
        const dayHours = groomer!.hours?.[day];
        const label = day[0].toUpperCase() + day.slice(1);
        return dayHours ? `${label} ${dayHours.open}-${dayHours.close}` : `${label} closed`;
      }).join(', ');

      const nowInSalonZone = now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
        timeZone: groomer!.timezone,
      });
      const currentYear = Number(
        now.toLocaleString('en-US', { year: 'numeric', timeZone: groomer!.timezone })
      );

      systemPrompt = `You are the booking assistant for ${groomer!.name}, a pet grooming salon on the PawBooker app. You are chatting with a customer of this salon, in a real-time chat, like text messaging.

Current date/time: ${nowInSalonZone}

IMPORTANT: The current year is ${currentYear} - not a year from your training data. Any date you work out (e.g. "next Monday," "this Friday") MUST use ${currentYear} unless the customer explicitly names a different year. Getting the year wrong will silently return zero availability and make you incorrectly tell the customer nothing is open.

Salon hours: ${hoursSummary}

Salon services: ${servicesSummary || 'Not listed'}

This customer's pets: ${petsSummary}

This customer's bookings with this salon:
${bookingsSummary}

You can help with: answering questions about services, hours, or their bookings; reporting what a booking was charged and its payment status (shown above); checking availability and booking a NEW appointment; rescheduling or cancelling an existing booking listed above.

Rules:
- To book a new appointment: figure out which pet and service, work out the calendar date carefully from "Current date/time" above (double-check your day-of-week arithmetic - it's easy to get wrong), call check_availability, and propose specific times using each slot's label. check_availability's result echoes back which weekday your requested date actually falls on - if that doesn't match what the customer asked for (e.g. they said "Monday" but it says tuesday), silently work out the correct date and call it again rather than reporting results for the wrong day. Once the customer confirms one, call create_booking with that exact slot's startsAt value copied verbatim - never write your own datetime. Never state or imply a time is open without having just checked it.
- A pet marked as needing a rabies vaccination above can't be booked - tell the customer they'll need to add a current rabies vaccination record to that pet's profile in the app first, and offer to escalate if they have questions about that.
- Never call create_booking, reschedule_booking, or cancel_booking until the customer has explicitly confirmed, in their most recent message, that they want you to proceed with a SPECIFIC time/change you already proposed. Always state it in plain language first and wait for a clear yes.
- Only act on bookings listed above - never invent or guess a booking id.
- You may only ever report the billing figures already shown above. You have no ability to issue refunds, adjust a charge, or change payment status - never imply otherwise.
- Always call escalate_to_groomer, rather than trying to resolve it yourself, for: any complaint about service quality or experience; any billing dispute, refund request, or "why was I charged"/payment problem; a special or unusual accommodation; pricing negotiation; or anything else you are not fully confident handling correctly.
- Keep replies short and friendly, like a text message. No long paragraphs.`;
    }

    const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = (historyRows ?? []).map((row) => ({
      role: row.sender_type === 'customer' ? 'user' : 'assistant',
      content: row.body,
    }));

    async function executeTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
      if (name === 'check_availability') {
        const dateMatch = String(input.date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!dateMatch) return { error: 'Invalid date - use YYYY-MM-DD.' };
        const [, yearStr, monthStr, dayStr] = dateMatch;
        const year = Number(yearStr);
        const month = Number(monthStr);
        const day = Number(dayStr);

        const service = (groomer!.groomer_services ?? []).find((s) => s.name === input.service_name);
        if (!service) return { error: `No service named "${input.service_name}" at this salon.` };

        // A whole requested date already in the past (as opposed to just a
        // few early slots today) is almost always the model defaulting to
        // the wrong year rather than a real "no availability" - say so
        // explicitly instead of returning an empty list that reads the same
        // as a genuinely fully-booked day.
        const endOfRequestedDay = zonedTimeToUtc(year, month, day, 23, 59, groomer!.timezone);
        if (endOfRequestedDay.getTime() < now.getTime()) {
          return { error: `${input.date} is entirely in the past (today is ${now.toLocaleDateString('en-US', { timeZone: groomer!.timezone })}) - you likely have the wrong year. Recompute the date using the current year and try again.` };
        }

        const weekday = weekdayKeyForDate(year, month, day);
        const dayHours = groomer!.hours?.[weekday] ?? null;

        const slots = availableTimes({
          year,
          month,
          day,
          dayHours,
          durationMinutes: service.duration_minutes,
          busy: salonBusy,
          capacity: salonCapacity,
          now,
          timeZone: groomer!.timezone,
        });

        // date/weekday echoed back deliberately - date math done in your own
        // head is unreliable, this is the ground truth for which weekday
        // "date" actually is. If it doesn't match what the customer asked
        // for (e.g. they said "Monday" but this says tuesday), silently
        // work out the correct date and call check_availability again -
        // don't report results for the wrong day.
        if (slots.length === 0) return { date: input.date, weekday, slots: [], note: dayHours ? 'No open times that day.' : 'Salon is closed that day.' };
        return { date: input.date, weekday, slots };
      }

      if (name === 'create_booking') {
        const pet = eligiblePets.find((p) => p.name === input.pet_name);
        if (!pet) return { error: `No pet named "${input.pet_name}" on this customer's account.` };
        if (!pet.eligible) return { error: `${pet.name} needs a current rabies vaccination on file before they can be booked.` };

        const service = (groomer!.groomer_services ?? []).find((s) => s.name === input.service_name);
        if (!service) return { error: `No service named "${input.service_name}" at this salon.` };

        const { data: billing } = await supabase.from('customer_billing').select('user_id').eq('user_id', thread.customer_id).maybeSingle();
        if (!billing) {
          return { error: 'This customer has no payment method on file yet. Tell them to add one in Profile before you can book, the same as the regular booking screen requires.' };
        }

        const startsAt = new Date(String(input.starts_at));
        if (Number.isNaN(startsAt.getTime()) || startsAt < now) return { error: 'The appointment time must be a valid time in the future.' };

        // Re-validate server-side rather than trusting the model's copied
        // value actually came from a real, still-current check_availability
        // result - recompute that day's slots in the salon's own timezone
        // (not the server's) and require an exact match.
        const zonedParts = new Intl.DateTimeFormat('en-US', {
          timeZone: groomer!.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(startsAt);
        const partsByType = Object.fromEntries(zonedParts.map((p) => [p.type, p.value]));
        const dayHours = groomer!.hours?.[weekdayKeyForDate(Number(partsByType.year), Number(partsByType.month), Number(partsByType.day))] ?? null;
        const stillOpen = availableTimes({
          year: Number(partsByType.year),
          month: Number(partsByType.month),
          day: Number(partsByType.day),
          dayHours,
          durationMinutes: service.duration_minutes,
          busy: salonBusy,
          capacity: salonCapacity,
          now,
          timeZone: groomer!.timezone,
        }).some((slot) => slot.startsAt === startsAt.toISOString());
        if (!stillOpen) return { error: 'That time is no longer available - call check_availability again for current open times.' };

        const { data: inserted, error } = await supabase
          .from('bookings')
          .insert({
            customer_id: thread.customer_id,
            groomer_id: thread.groomer_id,
            pet_id: pet.id,
            service_id: service.id,
            staff_id: null,
            starts_at: startsAt.toISOString(),
            status: 'pending',
          })
          .select('id')
          .single();
        if (error || !inserted) return { error: error?.message ?? 'Could not create booking.' };

        salonBusy = [...salonBusy, { startsAt, durationMinutes: service.duration_minutes }];

        await supabase.from('groomer_notifications').insert({ groomer_id: thread.groomer_id, booking_id: inserted.id, type: 'booking_requested' });

        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-email`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: inserted.id, action: 'booking_requested' }),
        });

        if (groomer!.user_id) {
          const tokens = await pushTokensForUser(serviceRoleClient, groomer!.user_id);
          await sendExpoPushToTokens(tokens, 'New booking request', `${pet.name} - ${service.name} on ${startsAt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: groomer!.timezone })}`, {
            bookingId: inserted.id,
          });
        }

        return { success: true, bookingId: inserted.id, startsAt: startsAt.toISOString() };
      }

      if (name === 'reschedule_booking') {
        const bookingId = String(input.booking_id);
        const { data: booking } = await supabase
          .from('bookings')
          .select('id, status')
          .eq('id', bookingId)
          .eq('customer_id', thread.customer_id)
          .eq('groomer_id', thread.groomer_id)
          .maybeSingle();

        if (!booking) return { error: 'Booking not found for this customer at this salon.' };
        if (booking.status !== 'pending' && booking.status !== 'confirmed') {
          return { error: `Booking is already ${booking.status} and can't be rescheduled.` };
        }

        const newDate = new Date(String(input.new_starts_at));
        if (Number.isNaN(newDate.getTime()) || newDate < now) {
          return { error: 'The new date/time must be a valid time in the future.' };
        }

        const { error } = await supabase
          .from('bookings')
          .update({ starts_at: newDate.toISOString() })
          .eq('id', booking.id);
        if (error) return { error: error.message };

        await supabase
          .from('groomer_notifications')
          .insert({ groomer_id: thread.groomer_id, booking_id: booking.id, type: 'booking_rescheduled' });

        if (groomer.user_id) {
          const tokens = await pushTokensForUser(serviceRoleClient, groomer.user_id);
          await sendExpoPushToTokens(
            tokens,
            'Booking rescheduled',
            `A customer moved their appointment to ${newDate.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: groomer.timezone,
            })}.`,
            { bookingId: booking.id }
          );
        }

        return { success: true, newStartsAt: newDate.toISOString() };
      }

      if (name === 'cancel_booking') {
        const bookingId = String(input.booking_id);
        const { data: booking } = await supabase
          .from('bookings')
          .select('id, status')
          .eq('id', bookingId)
          .eq('customer_id', thread.customer_id)
          .eq('groomer_id', thread.groomer_id)
          .maybeSingle();

        if (!booking) return { error: 'Booking not found for this customer at this salon.' };
        if (booking.status !== 'pending' && booking.status !== 'confirmed') {
          return { error: `Booking is already ${booking.status} and can't be cancelled.` };
        }

        const reason = String(input.reason ?? 'Cancelled via chat assistant');
        const { error } = await supabase
          .from('bookings')
          .update({ status: 'cancelled', cancellation_reason: reason, cancelled_by: 'customer' })
          .eq('id', booking.id);
        if (error) return { error: error.message };

        await supabase
          .from('groomer_notifications')
          .insert({ groomer_id: thread.groomer_id, booking_id: booking.id, type: 'booking_cancelled' });

        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-email`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: booking.id, action: 'customer_cancelled' }),
        });

        return { success: true };
      }

      if (name === 'escalate_to_groomer') {
        await supabase.from('chat_threads').update({ needs_human: true }).eq('id', threadId);

        if (groomer!.user_id) {
          const tokens = await pushTokensForUser(serviceRoleClient, groomer!.user_id);
          await sendExpoPushToTokens(
            tokens,
            'Customer needs your help',
            String(input.reason ?? 'A customer needs your attention in chat.'),
            { threadId }
          );
        }

        return { success: true, escalated: true };
      }

      if (name === 'escalate_to_admin') {
        await supabase.from('chat_threads').update({ needs_human: true }).eq('id', threadId);

        const { data: userData } = await serviceRoleClient.auth.admin.getUserById(thread.customer_id);
        const reason = String(input.reason ?? 'Someone needs help in the app support chat.');

        if (ADMIN_EMAIL && RESEND_API_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: FROM_ADDRESS,
              to: ADMIN_EMAIL,
              subject: 'PawBooker support chat needs you',
              text: `${reason}\n\nUser: ${userData?.user?.email ?? thread.customer_id}\nThread: ${threadId}`,
            }),
          });
        }

        return { success: true, escalated: true };
      }

      return { error: `Unknown tool ${name}` };
    }

    let finalText = '';
    let escalated = false;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          tools: toolsForThread,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Anthropic API error (status ${response.status}): ${errText}`);
        return jsonResponse({ error: `Anthropic API error: ${errText}` }, 502);
      }

      const data = await response.json();
      // deno-lint-ignore no-explicit-any
      const content = data.content as any[];
      const toolUses = content.filter((b) => b.type === 'tool_use');
      const textBlocks = content.filter((b) => b.type === 'text');
      finalText = textBlocks.map((b) => b.text).join('\n').trim();

      if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
        break;
      }

      messages.push({ role: 'assistant', content });

      const toolResults = [];
      for (const toolUse of toolUses) {
        const result = await executeTool(toolUse.name, toolUse.input);
        if ((toolUse.name === 'escalate_to_groomer' || toolUse.name === 'escalate_to_admin') && !result.error) {
          escalated = true;
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
          is_error: Boolean(result.error),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    if (finalText) {
      await serviceRoleClient.from('chat_messages').insert({
        thread_id: threadId,
        sender_type: 'bot',
        body: finalText,
      });

      const customerTokens = await pushTokensForUser(serviceRoleClient, thread.customer_id);
      await sendExpoPushToTokens(
        customerTokens,
        isAppSupport ? 'PawBooker Support' : (groomer?.name ?? 'New message'),
        finalText,
        { threadId }
      );
    }

    return jsonResponse({ reply: finalText, escalated });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
