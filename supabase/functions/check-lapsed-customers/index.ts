import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { pushTokensForUser, sendExpoPushToTokens } from '../_shared/push.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL = 'claude-sonnet-5';
const LAPSE_DAYS = 90;
const MAX_DRAFTS_PER_GROOMER = 40;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type LapsedCustomer = {
  customerId: string;
  customerEmail: string;
  petName: string;
  serviceName: string;
  lastBookingAt: string;
};

type Draft = { customer_id: string; subject: string; body: string };

async function draftReminders(groomerName: string, customers: LapsedCustomer[]): Promise<Draft[]> {
  const now = new Date();
  const list = customers
    .map((c) => {
      const monthsAgo = Math.max(1, Math.round((now.getTime() - new Date(c.lastBookingAt).getTime()) / (30 * 86400000)));
      return `- customer_id=${c.customerId} | pet: ${c.petName} | last visit: ${monthsAgo} month(s) ago | last service: ${c.serviceName}`;
    })
    .join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: `You are writing short win-back reminder emails on behalf of ${groomerName}, a pet grooming salon on the PawBooker app, to customers who haven't booked an appointment in a while.

For each customer listed, write a brief (2-4 sentence), warm, low-pressure reminder email encouraging them to book again. Mention their pet by name and roughly how long it's been since their last visit. Keep the tone friendly and casual - never guilt-inducing, salesy, or pushy. Sign off as ${groomerName}. Write one subject line and one body per customer.`,
      messages: [{ role: 'user', content: list }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              drafts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    customer_id: { type: 'string' },
                    subject: { type: 'string' },
                    body: { type: 'string' },
                  },
                  required: ['customer_id', 'subject', 'body'],
                  additionalProperties: false,
                },
              },
            },
            required: ['drafts'],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    console.error(`Anthropic API error (status ${response.status}): ${await response.text()}`);
    return [];
  }

  const data = await response.json();
  const text = (data.content as { type: string; text?: string }[]).find((b) => b.type === 'text')?.text;
  if (!text) return [];

  try {
    return (JSON.parse(text).drafts ?? []) as Draft[];
  } catch (err) {
    console.error('Failed to parse draft JSON', err);
    return [];
  }
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

    const { data: groomers, error: groomersError } = await supabase
      .from('groomers')
      .select('id, name, user_id')
      .eq('plan', 'pro');

    if (groomersError) {
      return jsonResponse({ error: groomersError.message }, 500);
    }

    const cutoff = new Date(Date.now() - LAPSE_DAYS * 86400000).toISOString();
    const summary: Record<string, number> = {};

    for (const groomer of groomers ?? []) {
      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('customer_id, customer_email, starts_at, status, pets(name), groomer_services(name)')
        .eq('groomer_id', groomer.id)
        .in('status', ['confirmed', 'completed'])
        .order('starts_at', { ascending: false });

      // Most recent non-cancelled booking per customer.
      const latestByCustomer = new Map<string, LapsedCustomer>();
      for (const row of bookingRows ?? []) {
        if (latestByCustomer.has(row.customer_id)) continue;
        latestByCustomer.set(row.customer_id, {
          customerId: row.customer_id,
          customerEmail: row.customer_email,
          petName: (row.pets as unknown as { name: string })?.name ?? 'their pet',
          serviceName: (row.groomer_services as unknown as { name: string })?.name ?? 'grooming',
          lastBookingAt: row.starts_at,
        });
      }

      const { data: openDrafts } = await supabase
        .from('customer_reminders')
        .select('customer_id')
        .eq('groomer_id', groomer.id)
        .eq('status', 'draft');
      const alreadyDrafted = new Set((openDrafts ?? []).map((r) => r.customer_id));

      const lapsed = [...latestByCustomer.values()]
        .filter((c) => c.lastBookingAt < cutoff && c.customerEmail && !alreadyDrafted.has(c.customerId))
        .slice(0, MAX_DRAFTS_PER_GROOMER);

      if (lapsed.length === 0) continue;

      const drafts = await draftReminders(groomer.name, lapsed);
      if (drafts.length === 0) continue;

      const byCustomerId = new Map(lapsed.map((c) => [c.customerId, c]));
      const rows = drafts
        .filter((d) => byCustomerId.has(d.customer_id))
        .map((d) => {
          const customer = byCustomerId.get(d.customer_id)!;
          return {
            groomer_id: groomer.id,
            customer_id: d.customer_id,
            customer_email: customer.customerEmail,
            last_booking_at: customer.lastBookingAt,
            draft_subject: d.subject,
            draft_body: d.body,
          };
        });

      if (rows.length === 0) continue;

      // Plain insert, not upsert: the "one open draft per customer" index is
      // partial (`where status = 'draft'`), which PostgREST's upsert can't
      // target via onConflict. The `alreadyDrafted` filter above already
      // prevents duplicates in the normal case; a unique-violation here would
      // only happen if this function overlapped with itself, which a single
      // daily cron trigger won't do.
      const { data: inserted, error: insertError } = await supabase
        .from('customer_reminders')
        .insert(rows)
        .select('id');

      if (insertError) {
        console.error(`Failed to insert reminders for groomer ${groomer.id}`, insertError.message);
        continue;
      }

      const insertedCount = inserted?.length ?? 0;
      summary[groomer.id] = insertedCount;

      if (insertedCount > 0 && groomer.user_id) {
        const tokens = await pushTokensForUser(supabase, groomer.user_id);
        await sendExpoPushToTokens(
          tokens,
          'Customers to reconnect with',
          `${insertedCount} customer${insertedCount === 1 ? '' : 's'} haven't booked in a while - review draft reminders.`
        );
      }
    }

    return jsonResponse({ summary });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
