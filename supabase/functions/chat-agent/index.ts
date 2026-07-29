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

const GROOMER_TOOLS = [
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
        'id, customer_id, groomer_id, thread_type, needs_human, groomers(name, phone, email, user_id, plan, timezone, groomer_services(name, price_cents, duration_minutes))'
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
      groomer_services: { name: string; price_cents: number; duration_minutes: number }[];
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

      systemPrompt = `You are the booking assistant for ${groomer!.name}, a pet grooming salon on the PawBooker app. You are chatting with a customer of this salon, in a real-time chat, like text messaging.

Current date/time: ${now.toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
        timeZone: groomer!.timezone,
      })}

Salon services: ${servicesSummary || 'Not listed'}

This customer's bookings with this salon:
${bookingsSummary}

You can help with: answering questions about services, hours, or their bookings; reporting what a booking was charged and its payment status (shown above); rescheduling or cancelling an existing booking listed above.

Rules:
- Never call reschedule_booking or cancel_booking until the customer has explicitly confirmed, in their most recent message, that they want you to proceed with a SPECIFIC change you already proposed. Always state the change in plain language first and wait for a clear yes.
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
