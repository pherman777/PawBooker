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
    name: 'get_revenue_summary',
    description:
      'Get revenue, average ticket size, repeat-customer rate, and cancellation rate for this salon, plus revenue for each of the last 6 months.',
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
      "Look up a customer by their pet's name or email address. Returns their booking count, last visit, and total amount spent at this salon.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: "Pet name or email (or part of one) to search for" } },
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

    async function executeTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
      if (name === 'get_revenue_summary') {
        const { data: bookingRows } = await supabase
          .from('bookings')
          .select('customer_id, status, starts_at, invoice_total_cents, tax_amount_cents')
          .eq('groomer_id', groomer.id);

        const rows = bookingRows ?? [];
        const completed = rows.filter((b) => b.status === 'completed');
        const revenueOf = (b: (typeof rows)[number]) => (b.invoice_total_cents ?? 0) - (b.tax_amount_cents ?? 0);
        const totalRevenueCents = completed.reduce((sum, b) => sum + revenueOf(b), 0);
        const avgTicketCents = completed.length > 0 ? totalRevenueCents / completed.length : 0;

        const completedByCustomer = new Map<string, number>();
        for (const b of completed) completedByCustomer.set(b.customer_id, (completedByCustomer.get(b.customer_id) ?? 0) + 1);
        const distinctCustomers = completedByCustomer.size;
        const repeatCustomers = [...completedByCustomer.values()].filter((c) => c >= 2).length;
        const repeatRate = distinctCustomers > 0 ? repeatCustomers / distinctCustomers : 0;

        const cancelled = rows.filter((b) => b.status === 'cancelled');
        const cancellationRate = rows.length > 0 ? cancelled.length / rows.length : 0;

        const now = new Date();
        const months = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
          return { label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), key: `${d.getFullYear()}-${d.getMonth()}`, revenueCents: 0 };
        });
        const bucketByKey = new Map(months.map((m) => [m.key, m]));
        for (const b of completed) {
          const d = new Date(b.starts_at);
          const bucket = bucketByKey.get(`${d.getFullYear()}-${d.getMonth()}`);
          if (bucket) bucket.revenueCents += revenueOf(b);
        }

        return {
          totalRevenue: `$${(totalRevenueCents / 100).toFixed(2)}`,
          averageTicket: `$${(avgTicketCents / 100).toFixed(2)}`,
          repeatCustomerRate: `${(repeatRate * 100).toFixed(0)}%`,
          cancellationRate: `${(cancellationRate * 100).toFixed(0)}%`,
          monthlyRevenue: months.map((m) => ({ month: m.label, revenue: `$${(m.revenueCents / 100).toFixed(2)}` })),
        };
      }

      if (name === 'get_lapsed_customers') {
        const days = typeof input.days === 'number' && input.days > 0 ? input.days : LAPSE_DAYS;
        const cutoff = new Date(Date.now() - days * 86400000).toISOString();

        const { data: bookingRows } = await supabase
          .from('bookings')
          .select('customer_id, customer_email, starts_at, pets(name), groomer_services(name)')
          .eq('groomer_id', groomer.id)
          .in('status', ['confirmed', 'completed'])
          .order('starts_at', { ascending: false });

        const latestByCustomer = new Map<string, { petName: string; serviceName: string; lastBookingAt: string; email: string }>();
        for (const row of bookingRows ?? []) {
          if (latestByCustomer.has(row.customer_id)) continue;
          latestByCustomer.set(row.customer_id, {
            petName: (row.pets as unknown as { name: string })?.name ?? 'their pet',
            serviceName: (row.groomer_services as unknown as { name: string })?.name ?? 'grooming',
            lastBookingAt: row.starts_at,
            email: row.customer_email,
          });
        }

        const lapsed = [...latestByCustomer.values()].filter((c) => c.lastBookingAt < cutoff);
        return {
          lapseThresholdDays: days,
          count: lapsed.length,
          customers: lapsed.slice(0, 25).map((c) => ({
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
          .select('customer_id, customer_email, starts_at, status, invoice_total_cents, tax_amount_cents, pets(name)')
          .eq('groomer_id', groomer.id);

        const matches = (bookingRows ?? []).filter((b) => {
          const petName = ((b.pets as unknown as { name: string })?.name ?? '').toLowerCase();
          const email = (b.customer_email ?? '').toLowerCase();
          return petName.includes(query) || email.includes(query);
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

    const systemPrompt = `You are a business insights assistant for ${groomer.name}, a pet grooming salon on the PawBooker app. You are chatting with the salon's own groomer/owner about their business - customer activity, revenue, supplies, and upcoming bookings.

You are read-only: you can look up and summarize data, but you cannot send emails, reorder supplies, or change bookings. If asked to take an action, tell the groomer to use the Reminders or Supplies screen from the dashboard menu.

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
