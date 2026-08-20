import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    description: 'Get counts of pending booking requests and upcoming confirmed appointments, plus the next few appointments.',
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
        const { data } = await supabase
          .from('groomers')
          .select('address, phone, email, bio, hours, requires_rabies_vaccination, multi_pet_discount')
          .eq('id', groomer.id)
          .single();

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
          .select('starts_at, status, service_completed_at, pets(name), groomer_services(name)')
          .eq('groomer_id', groomer.id)
          .order('starts_at', { ascending: true });

        const rows = bookingRows ?? [];
        const pendingCount = rows.filter((b) => b.status === 'pending').length;
        const upcoming = rows.filter((b) => b.status === 'confirmed' && !b.service_completed_at && new Date(b.starts_at) >= new Date());

        return {
          pendingRequestCount: pendingCount,
          upcomingConfirmedCount: upcoming.length,
          nextAppointments: upcoming.slice(0, 5).map((b) => ({
            when: new Date(b.starts_at).toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: groomer.timezone,
            }),
            pet: (b.pets as unknown as { name: string })?.name ?? 'Pet',
            service: (b.groomer_services as unknown as { name: string })?.name ?? 'Service',
          })),
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

      return { error: `Unknown tool ${name}` };
    }

    const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
      ...(history ?? []).map((h) => ({ role: h.role, content: h.body })),
      { role: 'user' as const, content: message },
    ];

    const systemPrompt = `You are a business assistant for ${groomer.name}, a pet grooming salon on the PawBooker app. You are chatting with the salon's own groomer/owner, who can ask you about anything to do with running their business: their business profile (hours, contact info, vaccination policy, multi-pet discount), the services they offer, their staff and how each groomer is performing, customer activity and lapsed customers, revenue and every other business insight (repeat rate, cancellation rate, tips, busiest day, new vs. returning revenue, top services), supply levels, and upcoming bookings. You have a tool for each of these - use them rather than guessing or saying you don't know, since the real data is always one tool call away.

You are read-only: you can look up and summarize data, but you cannot send emails, reorder supplies, add services or staff, or change bookings. If asked to take an action, tell the groomer which dashboard screen does it: Services (add/edit services), Staff (add/remove groomers), Hours, Discount, Vaccination requirement, Supplies (reorder), or Reminders (send a win-back email).

Keep answers short and to the point - a sentence or a few bullet points, not long reports. Use the tools to get real data; never guess numbers.`;

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
