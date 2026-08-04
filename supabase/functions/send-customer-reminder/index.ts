import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_ADDRESS = 'PawBooker <notifications@paw-booker.com>';

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
    const { reminderId } = (await req.json()) as { reminderId: string };
    const authHeader = req.headers.get('Authorization')!;

    // Bound to the caller's JWT, so RLS only lets a groomer read their own
    // reminders - this is what stops one groomer from sending another's draft.
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: reminder, error } = await supabase
      .from('customer_reminders')
      .select('id, customer_email, draft_subject, draft_body, status')
      .eq('id', reminderId)
      .single();

    if (error || !reminder) {
      return jsonResponse({ error: error?.message ?? 'Reminder not found' }, 404);
    }
    if (reminder.status !== 'draft') {
      return jsonResponse({ error: `Reminder is already ${reminder.status}.` }, 409);
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: reminder.customer_email,
        subject: reminder.draft_subject,
        text: reminder.draft_body,
      }),
    });

    if (!resendResponse.ok) {
      const body = await resendResponse.text();
      return jsonResponse({ error: `Resend failed: ${body}` }, 502);
    }

    // Service role client for the write: the groomer-facing RLS update policy
    // deliberately does not allow setting status to 'sent' directly (see
    // migration 0036) - only this function, after Resend has actually
    // accepted the email, is trusted to do that.
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { error: updateError } = await serviceRoleClient
      .from('customer_reminders')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', reminderId);

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    return jsonResponse({ sent: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
