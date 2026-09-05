import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { pushTokensForUser, sendExpoPushToTokens } from '../_shared/push.ts';
import { availableTimes, isDateClosed, weekdayKeyForDate, type BusyInterval, type ClosedRange } from '../_shared/availability.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL = 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 5;
const LAPSE_DAYS = 90;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const TOOLS = [
  {
    name: 'get_business_profile',
    description:
      "Get the salon's business info: name, address, phone, email, bio, weekly hours, plan (free/pro), whether a current rabies vaccination is required to book, and the multi-pet discount rule if one is set.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_services',
    description: 'List every service this salon offers, with its price and duration.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_staff',
    description:
      "List the salon's groomers/staff members, and for each one how many appointments they've completed, how much revenue they've brought in, and their average customer rating.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_business_insights',
    description:
      "Get this salon's business insights: total revenue, average ticket size, repeat-customer rate, revenue per customer, cancellation rate (broken down by who cancelled), tip rate and average tip, busiest day of the week, revenue for each of the last 6 months split into new-customer vs. returning-customer revenue, and the revenue mix across services.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_lapsed_customers',
    description:
      "List customers who haven't had a confirmed or completed booking in a given number of days (default 90).",
    input_schema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Lapse threshold in days. Defaults to 90.' } },
      required: [],
    },
  },
  {
    name: 'get_supply_status',
    description: 'List tracked supplies with their current stock, reorder threshold, and which are low on stock.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_upcoming_bookings',
    description:
      'List pending booking requests (with each one\'s id, pet, service, customer, and requested time) and the next few upcoming confirmed appointments. Call this to find a booking\'s id before accepting, declining, or cancelling it.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'find_customer',
    description:
      "Look up a customer by their own name, their pet's name, or their email address. Returns their booking count, last visit, and total amount spent at this salon.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "Customer name, pet name, or email (or part of one) to search for" },
      },
      required: ['query'],
    },
  },
  {
    name: 'respond_to_booking',
    description:
      'Accept or decline a PENDING booking request. Only call this after the groomer has explicitly confirmed, in their most recent message, which specific pending booking to accept or decline.',
    input_schema: {
      type: 'object',
      properties: {
        booking_id: { type: 'string', description: 'The id of the pending booking to respond to' },
        action: { type: 'string', enum: ['accept', 'decline'] },
        reason: { type: 'string', description: 'For a decline only - a brief note the customer will see explaining why' },
      },
      required: ['booking_id', 'action'],
    },
  },
  {
    name: 'cancel_booking',
    description:
      'Cancel an existing pending or confirmed booking. Only call this after the groomer has explicitly confirmed, in their most recent message, that they want to cancel a SPECIFIC booking.',
    input_schema: {
      type: 'object',
      properties: {
        booking_id: { type: 'string' },
        reason: { type: 'string', description: 'Brief reason the customer will see, based on what the groomer said' },
      },
      required: ['booking_id', 'reason'],
    },
  },
  {
    name: 'propose_reschedule',
    description:
      "Message a customer about an existing pending or confirmed booking to ask if they can move it to a different day, offering a few open alternative times to pick from. Finds the open times itself and sends the message directly - only call this after the groomer has explicitly confirmed, in their most recent message, which specific booking to ask about and why.",
    input_schema: {
      type: 'object',
      properties: {
        booking_id: { type: 'string', description: "The id of the pending or confirmed booking to ask about rescheduling" },
        reason: {
          type: 'string',
          description: 'Brief, customer-facing reason for the reschedule ask, based on what the groomer said (e.g. "I\'m out sick that day")',
        },
      },
      required: ['booking_id', 'reason'],
    },
  },
  {
    name: 'update_supply_stock',
    description:
      "Set a tracked supply's current on-hand quantity (e.g. after using some or after restocking). Only call this after the groomer has stated a specific new quantity for a specific supply.",
    input_schema: {
      type: 'object',
      properties: {
        supply_name: { type: 'string', description: 'Must match one of the supplies listed by get_supply_status' },
        quantity_on_hand: { type: 'number', description: 'The new on-hand quantity' },
      },
      required: ['supply_name', 'quantity_on_hand'],
    },
  },
];

type ToolResult = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, history } = (await req.json()) as {
      message: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    };
    const authHeader = req.headers.get('Authorization')!;

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceRoleClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    const { data: groomer, error: groomerError } = await supabase
      .from('groomers')
      .select('id, name, plan, timezone')
      .eq('user_id', user.id)
      .single();

    if (groomerError || !groomer) {
      return jsonResponse({ error: groomerError?.message ?? 'Groomer profile not found' }, 404);
    }

    if (groomer.plan !== 'pro') {
      return jsonResponse({
        reply: "The business assistant is a Pro feature. Upgrade to Pro from the dashboard menu to start using it.",
      });
    }

    await supabase.from('business_assistant_messages').insert({
      groomer_id: groomer.id,
      sender_type: 'groomer',
      body: message,
    });

    function formatTime(time: string): string {
      const [hourStr, minute] = time.split(':');
      const hour = Number(hourStr);
      const period = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 === 0 ? 12 : hour % 12;
      return `${hour12}:${minute} ${period}`;
    }

    async function executeTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
      if (name === 'get_business_profile') {
        const [{ data }, closuresResult] = await Promise.all([
          supabase
            .from('groomers')
            .select('address, phone, email, bio, hours, requires_rabies_vaccination, multi_pet_discount')
            .eq('id', groomer.id)
            .single(),
          supabase
            .from('groomer_closures')
            .select('start_date, end_date, note')
            .eq('groomer_id', groomer.id)
            .gte('end_date', new Date().toISOString().slice(0, 10))
            .order('start_date', { ascending: true }),
        ]);

        const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
        const DAY_LABELS: Record<string, string> = {
          monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
          friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
        };
        const hoursRaw = (data?.hours ?? null) as Record<string, { open: string; close: string } | null> | null;
        const hours = DAY_ORDER.map((day) => {
          const dayHours = hoursRaw?.[day];
          return { day: DAY_LABELS[day], hours: dayHours ? `${formatTime(dayHours.open)} - ${formatTime(dayHours.close)}` : 'Closed' };
        });

        const discountRaw = data?.multi_pet_discount as Record<string, unknown> | null;
        let multiPetDiscount: string | null = null;
        if (discountRaw && (discountRaw.type === 'percent' || discountRaw.type === 'flat')) {
          const minPets = Number(discountRaw.min_pets);
          const value = Number(discountRaw.value);
          if (Number.isFinite(minPets) && minPets >= 2 && Number.isFinite(value) && value > 0) {
            const amount = discountRaw.type === 'percent' ? `${value}%` : `$${(value / 100).toFixed(0)}`;
            multiPetDiscount = `${amount} off ${minPets}+ pets`;
          }
        }

        const upcomingClosures = (closuresResult.data ?? []).map((c) => ({
          from: c.start_date,
          to: c.end_date,
          note: c.note ?? undefined,
        }));

        return {
          name: groomer.name,
          plan: groomer.plan,
          address: data?.address ?? null,
          phone: data?.phone ?? null,
          email: data?.email ?? null,
          bio: data?.bio ?? null,
          hours,
          requiresRabiesVaccination: data?.requires_rabies_vaccination ?? true,
          multiPetDiscount,
          upcomingClosures,
        };
      }

      if (name === 'get_services') {
        const { data } = await supabase
          .from('groomer_services')
          .select('name, price_cents, duration_minutes, description')
          .eq('groomer_id', groomer.id)
          .order('name');

        return {
          services: (data ?? []).map((s) => ({
            name: s.name,
            price: `$${(s.price_cents / 100).toFixed(2)}`,
            durationMinutes: s.duration_minutes,
            description: s.description ?? undefined,
          })),
        };
      }

      if (name === 'get_staff') {
        const [staffResult, bookingsResult, reviewsResult] = await Promise.all([
          supabase.from('salon_staff').select('id, name').eq('salon_id', groomer.id).eq('active', true),
          supabase
            .from('bookings')
            .select('id, staff_id, invoice_total_cents, tax_amount_cents')
            .eq('groomer_id', groomer.id)
            .eq('status', 'completed'),
          supabase.from('salon_reviews').select('booking_id, rating').eq('groomer_id', groomer.id),
        ]);

        const staffList = staffResult.data ?? [];
        if (staffList.length === 0) {
          return {
            staff: [],
            note: 'No groomers/staff have been added yet - bookings are handled by the salon as a whole (add staff from the Staff screen).',
          };
        }

        const ratingByBooking = new Map((reviewsResult.data ?? []).map((r) => [r.booking_id, r.rating]));
        const stats = new Map<string, { count: number; revenueCents: number; ratingSum: number; ratingCount: number }>();
        for (const b of bookingsResult.data ?? []) {
          if (!b.staff_id) continue;
          const entry = stats.get(b.staff_id) ?? { count: 0, revenueCents: 0, ratingSum: 0, ratingCount: 0 };
          entry.count += 1;
          entry.revenueCents += (b.invoice_total_cents ?? 0) - (b.tax_amount_cents ?? 0);
          const rating = ratingByBooking.get(b.id);
          if (rating != null) {
            entry.ratingSum += rating;
            entry.ratingCount += 1;
          }
          stats.set(b.staff_id, entry);
        }

        return {
          staff: staffList.map((s) => {
            const entry = stats.get(s.id);
            return {
              name: s.name,
              completedBookings: entry?.count ?? 0,
              revenue: `$${((entry?.revenueCents ?? 0) / 100).toFixed(2)}`,
              averageRating: entry && entry.ratingCount > 0 ? Number((entry.ratingSum / entry.ratingCount).toFixed(1)) : null,
            };
          }),
        };
      }

      if (name === 'get_business_insights') {
        const [bookingsResult, remindersResult] = await Promise.all([
          supabase
            .from('bookings')
            .select(
              'customer_id, status, starts_at, cancelled_by, invoice_total_cents, tax_amount_cents, tip_amount_cents, groomer_services(name)'
            )
            .eq('groomer_id', groomer.id),
          supabase
            .from('customer_reminders')
            .select('customer_id, sent_at')
            .eq('groomer_id', groomer.id)
            .eq('status', 'sent'),
        ]);

        const rows = bookingsResult.data ?? [];
        const completed = rows.filter((b) => b.status === 'completed');
        const revenueOf = (b: (typeof rows)[number]) => (b.invoice_total_cents ?? 0) - (b.tax_amount_cents ?? 0);
        const totalRevenueCents = completed.reduce((sum, b) => sum + revenueOf(b), 0);
        const avgTicketCents = completed.length > 0 ? totalRevenueCents / completed.length : 0;

        const completedByCustomer = new Map<string, number>();
        for (const b of completed) completedByCustomer.set(b.customer_id, (completedByCustomer.get(b.customer_id) ?? 0) + 1);
        const distinctCustomers = completedByCustomer.size;
        const repeatCustomers = [...completedByCustomer.values()].filter((c) => c >= 2).length;
        const repeatRate = distinctCustomers > 0 ? repeatCustomers / distinctCustomers : 0;
        const revenuePerCustomerCents = distinctCustomers > 0 ? totalRevenueCents / distinctCustomers : 0;

        const cancelled = rows.filter((b) => b.status === 'cancelled');
        const cancellationRate = rows.length > 0 ? cancelled.length / rows.length : 0;
        const cancelledByCustomer = cancelled.filter((b) => b.cancelled_by === 'customer').length;
        const cancelledByGroomer = cancelled.filter((b) => b.cancelled_by === 'groomer').length;

        // Tips are a separate off-session charge, so tip rate is measured
        // against completed, invoiced visits only - matches the Insights screen.
        const tippable = completed.filter((b) => (b.invoice_total_cents ?? 0) > 0);
        const tipped = tippable.filter((b) => (b.tip_amount_cents ?? 0) > 0);
        const tipRate = tippable.length > 0 ? tipped.length / tippable.length : 0;
        const avgTipCents =
          tipped.length > 0 ? tipped.reduce((sum, b) => sum + (b.tip_amount_cents ?? 0), 0) / tipped.length : 0;

        const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayCounts = Array.from({ length: 7 }, () => 0);
        for (const b of completed) dayCounts[new Date(b.starts_at).getDay()] += 1;
        const busiestDayIndex = dayCounts.indexOf(Math.max(...dayCounts));

        // A customer's earliest completed booking marks them "new" for that
        // visit; every later one is "returning" - splits monthly revenue into
        // acquisition vs. retention instead of one flat total.
        const firstBookingByCustomer = new Map<string, string>();
        for (const b of completed) {
          const existing = firstBookingByCustomer.get(b.customer_id);
          if (!existing || b.starts_at < existing) firstBookingByCustomer.set(b.customer_id, b.starts_at);
        }

        const now = new Date();
        const months = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
          return {
            label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            key: `${d.getFullYear()}-${d.getMonth()}`,
            newRevenueCents: 0,
            returningRevenueCents: 0,
          };
        });
        const bucketByKey = new Map(months.map((m) => [m.key, m]));
        for (const b of completed) {
          const d = new Date(b.starts_at);
          const bucket = bucketByKey.get(`${d.getFullYear()}-${d.getMonth()}`);
          if (!bucket) continue;
          const revenue = revenueOf(b);
          if (firstBookingByCustomer.get(b.customer_id) === b.starts_at) bucket.newRevenueCents += revenue;
          else bucket.returningRevenueCents += revenue;
        }

        const serviceMap = new Map<string, { count: number; revenueCents: number }>();
        for (const b of completed) {
          const serviceName = (b.groomer_services as unknown as { name: string })?.name ?? 'Service';
          const entry = serviceMap.get(serviceName) ?? { count: 0, revenueCents: 0 };
          entry.count += 1;
          entry.revenueCents += revenueOf(b);
          serviceMap.set(serviceName, entry);
        }
        const topServices = [...serviceMap.entries()]
          .map(([serviceName, v]) => ({ name: serviceName, completed: v.count, revenue: `$${(v.revenueCents / 100).toFixed(2)}` }))
          .sort((a, b) => b.completed - a.completed)
          .slice(0, 5);

        const sentReminders = remindersResult.data ?? [];
        const winBackRebookedCount = sentReminders.filter((r) =>
          rows.some(
            (b) => b.customer_id === r.customer_id && b.starts_at > r.sent_at && (b.status === 'confirmed' || b.status === 'completed')
          )
        ).length;

        return {
          totalRevenue: `$${(totalRevenueCents / 100).toFixed(2)}`,
          averageTicket: `$${(avgTicketCents / 100).toFixed(2)}`,
          revenuePerCustomer: `$${(revenuePerCustomerCents / 100).toFixed(2)}`,
          repeatCustomerRate: `${(repeatRate * 100).toFixed(0)}%`,
          cancellationRate: `${(cancellationRate * 100).toFixed(0)}%`,
          cancelledByCustomer,
          cancelledByGroomer,
          tipRate: `${(tipRate * 100).toFixed(0)}%`,
          averageTip: `$${(avgTipCents / 100).toFixed(2)}`,
          busiestDayOfWeek: completed.length > 0 ? DAY_NAMES[busiestDayIndex] : null,
          winBackRemindersSent: sentReminders.length,
          winBackRebookedCount,
          winBackRate: sentReminders.length > 0 ? `${((winBackRebookedCount / sentReminders.length) * 100).toFixed(0)}%` : null,
          monthlyRevenue: months.map((m) => ({
            month: m.label,
            newCustomerRevenue: `$${(m.newRevenueCents / 100).toFixed(2)}`,
            returningCustomerRevenue: `$${(m.returningRevenueCents / 100).toFixed(2)}`,
          })),
          topServices,
        };
      }

      if (name === 'get_lapsed_customers') {
        const days = typeof input.days === 'number' && input.days > 0 ? input.days : LAPSE_DAYS;
        const cutoff = new Date(Date.now() - days * 86400000).toISOString();

        const { data: bookingRows } = await supabase
          .from('bookings')
          .select('customer_id, customer_email, customer_name, starts_at, pets(name), groomer_services(name)')
          .eq('groomer_id', groomer.id)
          .in('status', ['confirmed', 'completed'])
          .order('starts_at', { ascending: false });

        const latestByCustomer = new Map<
          string,
          { petName: string; serviceName: string; lastBookingAt: string; email: string; name: string | null }
        >();
        for (const row of bookingRows ?? []) {
          if (latestByCustomer.has(row.customer_id)) continue;
          latestByCustomer.set(row.customer_id, {
            petName: (row.pets as unknown as { name: string })?.name ?? 'their pet',
            serviceName: (row.groomer_services as unknown as { name: string })?.name ?? 'grooming',
            lastBookingAt: row.starts_at,
            email: row.customer_email,
            name: row.customer_name,
          });
        }

        const lapsed = [...latestByCustomer.values()].filter((c) => c.lastBookingAt < cutoff);
        return {
          lapseThresholdDays: days,
          count: lapsed.length,
          customers: lapsed.slice(0, 25).map((c) => ({
            name: c.name ?? undefined,
            pet: c.petName,
            email: c.email,
            lastService: c.serviceName,
            lastBookingAt: c.lastBookingAt,
          })),
          truncated: lapsed.length > 25,
        };
      }

      if (name === 'get_supply_status') {
        const { data: supplies } = await supabase
          .from('groomer_supplies')
          .select('name, unit, quantity_on_hand, reorder_threshold, reorder_quantity')
          .eq('groomer_id', groomer.id);

        const rows = (supplies ?? []).map((s) => ({
          name: s.name,
          onHand: `${s.quantity_on_hand} ${s.unit}`,
          reorderThreshold: s.reorder_threshold,
          low: s.quantity_on_hand <= s.reorder_threshold,
          suggestedReorderQty: s.reorder_quantity ?? undefined,
        }));

        return { supplies: rows, lowStockCount: rows.filter((r) => r.low).length };
      }

      if (name === 'get_upcoming_bookings') {
        const { data: bookingRows } = await supabase
          .from('bookings')
          .select('id, starts_at, status, service_completed_at, customer_name, customer_email, pets(name), groomer_services(name)')
          .eq('groomer_id', groomer.id)
          .order('starts_at', { ascending: true });

        const rows = bookingRows ?? [];
        const pending = rows.filter((b) => b.status === 'pending');
        const upcoming = rows.filter((b) => b.status === 'confirmed' && !b.service_completed_at && new Date(b.starts_at) >= new Date());

        const summarize = (b: (typeof rows)[number]) => ({
          id: b.id,
          when: new Date(b.starts_at).toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: groomer.timezone,
          }),
          pet: (b.pets as unknown as { name: string })?.name ?? 'Pet',
          service: (b.groomer_services as unknown as { name: string })?.name ?? 'Service',
          customer: b.customer_name || b.customer_email || 'Customer',
        });

        // Full pending list (not just a count) and each row's id - without
        // this, respond_to_booking/cancel_booking have no way to discover
        // which booking to act on from natural conversation.
        return {
          pendingRequestCount: pending.length,
          pendingRequests: pending.map(summarize),
          upcomingConfirmedCount: upcoming.length,
          nextAppointments: upcoming.slice(0, 5).map(summarize),
        };
      }

      if (name === 'find_customer') {
        const query = String(input.query ?? '').toLowerCase().trim();
        if (!query) return { error: 'No search query provided.' };

        const { data: bookingRows } = await supabase
          .from('bookings')
          .select('customer_id, customer_email, customer_name, starts_at, status, invoice_total_cents, tax_amount_cents, pets(name)')
          .eq('groomer_id', groomer.id);

        const matches = (bookingRows ?? []).filter((b) => {
          const petName = ((b.pets as unknown as { name: string })?.name ?? '').toLowerCase();
          const email = (b.customer_email ?? '').toLowerCase();
          const customerName = (b.customer_name ?? '').toLowerCase();
          return petName.includes(query) || email.includes(query) || customerName.includes(query);
        });

        if (matches.length === 0) return { found: false };

        const byCustomer = new Map<string, typeof matches>();
        for (const m of matches) {
          const list = byCustomer.get(m.customer_id) ?? [];
          list.push(m);
          byCustomer.set(m.customer_id, list);
        }

        const customers = [...byCustomer.entries()].map(([customerId, bookings]) => {
          const completed = bookings.filter((b) => b.status === 'completed');
          const totalSpentCents = completed.reduce((sum, b) => sum + (b.invoice_total_cents ?? 0) - (b.tax_amount_cents ?? 0), 0);
          const sorted = [...bookings].sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
          return {
            name: sorted[0]?.customer_name ?? undefined,
            email: sorted[0]?.customer_email,
            pet: (sorted[0]?.pets as unknown as { name: string })?.name,
            totalBookings: bookings.length,
            completedBookings: completed.length,
            totalSpent: `$${(totalSpentCents / 100).toFixed(2)}`,
            lastVisit: sorted[0]?.starts_at,
          };
        });

        return { found: true, customers };
      }

      if (name === 'respond_to_booking') {
        const bookingId = String(input.booking_id);
        const action = input.action === 'decline' ? 'decline' : 'accept';

        const { data: booking } = await supabase.from('bookings').select('id, status').eq('id', bookingId).eq('groomer_id', groomer.id).maybeSingle();
        if (!booking) return { error: 'Booking not found at this salon.' };
        if (booking.status !== 'pending') return { error: `Booking is already ${booking.status}, not pending.` };

        // Mirrors app/(salon)/index.tsx's handleAccept/handleConfirmDecline
        // exactly - same status values, same email action strings.
        if (action === 'accept') {
          const { error } = await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', bookingId);
          if (error) return { error: error.message };
        } else {
          const reason = String(input.reason ?? '');
          const { error } = await supabase
            .from('bookings')
            .update({ status: 'declined', cancellation_reason: reason || null, cancelled_by: 'groomer' })
            .eq('id', bookingId);
          if (error) return { error: error.message };
        }

        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-email`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId, action: action === 'accept' ? 'accepted' : 'declined' }),
        });

        return { success: true, action };
      }

      if (name === 'cancel_booking') {
        const bookingId = String(input.booking_id);
        const { data: booking } = await supabase.from('bookings').select('id, status').eq('id', bookingId).eq('groomer_id', groomer.id).maybeSingle();
        if (!booking) return { error: 'Booking not found at this salon.' };
        if (booking.status !== 'pending' && booking.status !== 'confirmed') {
          return { error: `Booking is already ${booking.status} and can't be cancelled.` };
        }

        const reason = String(input.reason ?? 'Cancelled by groomer');
        // Mirrors app/(salon)/index.tsx's handleConfirmCancel exactly.
        const { error } = await supabase
          .from('bookings')
          .update({ status: 'cancelled', cancellation_reason: reason, cancelled_by: 'groomer' })
          .eq('id', bookingId);
        if (error) return { error: error.message };

        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-email`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId, action: 'groomer_cancelled' }),
        });

        return { success: true };
      }

      if (name === 'propose_reschedule') {
        const bookingId = String(input.booking_id);
        const reason = String(input.reason ?? '').trim();

        const { data: booking } = await supabase
          .from('bookings')
          .select('id, status, starts_at, customer_id, groomer_services(name, duration_minutes)')
          .eq('id', bookingId)
          .eq('groomer_id', groomer.id)
          .maybeSingle();
        if (!booking) return { error: 'Booking not found at this salon.' };
        if (booking.status !== 'pending' && booking.status !== 'confirmed') {
          return { error: `Booking is already ${booking.status} - nothing to reschedule.` };
        }

        const service = booking.groomer_services as unknown as { name: string; duration_minutes: number } | null;
        const durationMinutes = service?.duration_minutes ?? 60;

        const closuresWindowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        const [hoursResult, staffResult, busyResult, closuresResult] = await Promise.all([
          supabase.from('groomers').select('hours').eq('id', groomer.id).single(),
          supabase.from('salon_staff').select('id').eq('salon_id', groomer.id).eq('active', true),
          supabase.rpc('salon_busy_intervals', {
            p_salon_id: groomer.id,
            p_from: now.toISOString(),
            p_to: closuresWindowEnd.toISOString(),
          }),
          supabase
            .from('groomer_closures')
            .select('start_date, end_date, note')
            .eq('groomer_id', groomer.id)
            .lte('start_date', closuresWindowEnd.toISOString().slice(0, 10))
            .gte('end_date', now.toISOString().slice(0, 10)),
        ]);
        const hours = (hoursResult.data?.hours ?? null) as Record<string, { open: string; close: string } | null> | null;
        const capacity = Math.max((staffResult.data ?? []).length, 1);
        const busy: BusyInterval[] = ((busyResult.data ?? []) as { starts_at: string; duration_minutes: number }[]).map((b) => ({
          startsAt: new Date(b.starts_at),
          durationMinutes: b.duration_minutes,
        }));
        const closures = (closuresResult.data ?? []) as ClosedRange[];

        const origDateFields = Object.fromEntries(
          new Intl.DateTimeFormat('en-US', { timeZone: groomer.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
            .formatToParts(new Date(booking.starts_at))
            .map((p) => [p.type, p.value])
        );
        const origDateKey = `${origDateFields.year}${origDateFields.month}${origDateFields.day}`;

        // One option per day, starting tomorrow ("a different day" per the
        // groomer's ask) - skip the booking's own current day so we never
        // propose the time it's already at.
        const options: { label: string; startsAt: string }[] = [];
        for (let dayOffset = 1; dayOffset <= 10 && options.length < 4; dayOffset++) {
          const d = new Date(now.getTime() + dayOffset * 86400000);
          const parts = Object.fromEntries(
            new Intl.DateTimeFormat('en-US', { timeZone: groomer.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
              .formatToParts(d)
              .map((p) => [p.type, p.value])
          );
          const dateKey = `${parts.year}${parts.month}${parts.day}`;
          if (dateKey === origDateKey) continue;

          const year = Number(parts.year);
          const month = Number(parts.month);
          const day = Number(parts.day);
          const dayHours = isDateClosed(closures, year, month, day) ? null : (hours?.[weekdayKeyForDate(year, month, day)] ?? null);
          const slots = availableTimes({ year, month, day, dayHours, durationMinutes, busy, capacity, now, timeZone: groomer.timezone });
          if (slots.length > 0) {
            options.push({
              label: `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: groomer.timezone })} at ${slots[0].label}`,
              startsAt: slots[0].startsAt,
            });
          }
        }

        if (options.length === 0) {
          return { error: 'No open alternative times found in the next 10 days - tell the groomer to message the customer manually from Messages instead.' };
        }

        const { data: existingThread } = await serviceRoleClient
          .from('chat_threads')
          .select('id')
          .eq('customer_id', booking.customer_id)
          .eq('groomer_id', groomer.id)
          .eq('thread_type', 'groomer')
          .maybeSingle();

        let threadId = existingThread?.id as string | undefined;
        if (!threadId) {
          const { data: createdThread, error: threadError } = await serviceRoleClient
            .from('chat_threads')
            .insert({ customer_id: booking.customer_id, groomer_id: groomer.id, thread_type: 'groomer' })
            .select('id')
            .single();
          if (threadError || !createdThread) return { error: threadError?.message ?? 'Could not start a conversation with this customer.' };
          threadId = createdThread.id;

          // The chat_threads_welcome_message trigger (migration 0020)
          // auto-inserts a generic "Hi, I'm the booking assistant..."
          // greeting on every new groomer thread, meant for a customer
          // opening a blank chat themselves. Here the reschedule message
          // below is itself the opening message, so drop the trigger's
          // greeting instead of showing both.
          await serviceRoleClient.from('chat_messages').delete().eq('thread_id', threadId).eq('sender_type', 'bot');
        }

        const oldWhen = new Date(booking.starts_at).toLocaleString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: groomer.timezone,
        });
        const optionsList = options.map((o) => `- ${o.label}`).join('\n');
        const messageBody =
          `Hi! About your ${service?.name ?? 'appointment'} on ${oldWhen}${reason ? ` - ${reason}` : ''}, could we move it to one of these instead?\n${optionsList}\n\nJust reply with the one that works, or let me know if none of these do and we'll find another time.`;

        await serviceRoleClient.from('chat_messages').insert({
          thread_id: threadId,
          sender_type: 'bot',
          body: messageBody,
        });

        const customerTokens = await pushTokensForUser(serviceRoleClient, booking.customer_id);
        await sendExpoPushToTokens(customerTokens, groomer.name, messageBody, { threadId });

        return { success: true, threadId, proposedOptions: options.map((o) => o.label) };
      }

      if (name === 'update_supply_stock') {
        const supplyName = String(input.supply_name ?? '');
        const quantity = Number(input.quantity_on_hand);
        if (!supplyName || !Number.isFinite(quantity) || quantity < 0) return { error: 'Invalid supply name or quantity.' };

        const { data: supply } = await supabase
          .from('groomer_supplies')
          .select('id, name')
          .eq('groomer_id', groomer.id)
          .ilike('name', supplyName)
          .maybeSingle();
        if (!supply) return { error: `No supply named "${supplyName}" - check get_supply_status for the exact name.` };

        const { error } = await supabase.from('groomer_supplies').update({ quantity_on_hand: quantity }).eq('id', supply.id);
        if (error) return { error: error.message };

        return { success: true, supply: supply.name, quantityOnHand: quantity };
      }

      return { error: `Unknown tool ${name}` };
    }

    const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
      ...(history ?? []).map((h) => ({ role: h.role, content: h.body })),
      { role: 'user' as const, content: message },
    ];

    const now = new Date();
    const currentYear = Number(now.toLocaleString('en-US', { year: 'numeric', timeZone: groomer.timezone }));

    const systemPrompt = `You are a business assistant for ${groomer.name}, a pet grooming salon on the PawBooker app. You are chatting with the salon's own groomer/owner, who can ask you about anything to do with running their business: their business profile (hours, contact info, vaccination policy, multi-pet discount), the services they offer, their staff and how each groomer is performing, customer activity and lapsed customers, revenue and every other business insight (repeat rate, cancellation rate, tips, busiest day, new vs. returning revenue, top services), supply levels, and upcoming bookings. You have a tool for each of these - use them rather than guessing or saying you don't know, since the real data is always one tool call away.

Current date/time: ${now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: groomer.timezone })}. The current year is ${currentYear} - use it for any date reasoning, not a year from your training data.

You can take these actions, always by confirming the specific thing first and waiting for a clear yes:
- respond_to_booking: accept or decline a pending request.
- cancel_booking: cancel a pending or confirmed booking.
- propose_reschedule: message a customer about an existing booking with a few open alternative days/times to pick from, so they can reschedule themselves.
- update_supply_stock: set a supply's on-hand quantity.
For anything else - adding/editing services, adding/removing staff, changing hours or the multi-pet discount rule, adding or removing a closed date (holiday/vacation), reordering supplies with a vendor, sending a win-back reminder, connecting Stripe payouts - you have no tool for it. Tell the groomer which dashboard screen does it: Services, Staff, Hours, Closures, Discount, Vaccination requirement, Supplies, Payouts, or Reminders. get_business_profile's upcomingClosures tells you what's already scheduled if the groomer just wants to know, not set one.

You also know how the PawBooker app works generally, and can answer "how do I..." questions about it directly:
- Payouts: a groomer connects a bank account under Payouts (Stripe Connect) to receive booking payments and tips directly; until connected, completed bookings can't be charged.
- Plans: Free plan gets core booking/scheduling. Pro plan adds this business assistant, Insights, win-back reminders, and an AI concierge that can auto-answer customer booking questions (including scheduling new appointments) in chat.
- Invite codes: each salon has a personal invite code (Invite screen) customers can redeem to link to this salon without going through Browse/search - referred customers this way are exempt from the platform's first-booking acquisition fee.
- Multi-pet discount: set on the Discount screen, applies automatically when a customer books multiple pets in one visit.
- Vaccination requirement: a toggle (Vaccination requirement screen) for whether a current rabies vaccination record is required before a customer can book - defaults on.
- Tips: the groomer adds an optional tip amount on the Complete & invoice screen before charging - it rides on the same card charge as the invoice, not a separate one. PawBooker never takes a platform cut of tips, regardless of plan - standard card processing costs still apply, same as on the booking charge, and the 5% acquisition fee (when it applies) is never charged on the tip portion.
- Completing a visit: mark a booking complete and send the invoice (card or cash) from the booking's own screen - this is a separate step from accepting the booking.

Rules:
- Only act on bookings/supplies you've actually looked up via a tool in this conversation - never invent or guess an id or a current quantity.
- Never call respond_to_booking, cancel_booking, propose_reschedule, or update_supply_stock until the groomer has explicitly confirmed, in their most recent message, the specific action on a specific item you already proposed.
- propose_reschedule sends a real message to the customer and finds the open times itself - never tell the groomer what times are open before calling it, and never invent times yourself.
- Keep answers short and to the point - a sentence or a few bullet points, not long reports. Use the tools to get real data; never guess numbers.`;

    let finalText = '';

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
          tools: TOOLS,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Anthropic API error (status ${response.status}): ${errText}`);
        return jsonResponse({ error: `Anthropic API error: ${errText}` }, 502);
      }

      const data = await response.json();
      const content = data.content as { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
      const toolUses = content.filter((b) => b.type === 'tool_use');
      const textBlocks = content.filter((b) => b.type === 'text');
      finalText = textBlocks.map((b) => b.text).join('\n').trim();

      if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
        break;
      }

      messages.push({ role: 'assistant', content });

      const toolResults = [];
      for (const toolUse of toolUses) {
        const result = await executeTool(toolUse.name!, toolUse.input ?? {});
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    if (finalText) {
      await serviceRoleClient.from('business_assistant_messages').insert({
        groomer_id: groomer.id,
        sender_type: 'bot',
        body: finalText,
      });
    }

    return jsonResponse({ reply: finalText });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
