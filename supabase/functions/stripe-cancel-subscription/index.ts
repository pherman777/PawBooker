import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;

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
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    const { data: groomer, error: groomerError } = await supabase
      .from('groomers')
      .select('id, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (groomerError || !groomer || !groomer.stripe_subscription_id) {
      return jsonResponse({ error: 'No active subscription to cancel' }, 400);
    }

    // No client-facing UPDATE policy on groomers (same reasoning as plan/rating),
    // so persisting the pending-cancellation flag needs the service-role client.
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions/${groomer.stripe_subscription_id}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ cancel_at_period_end: 'true' }),
      }
    );
    const data = await response.json();

    if (!response.ok) {
      return jsonResponse({ error: data.error?.message ?? 'Could not cancel subscription' }, 502);
    }

    await serviceRoleClient
      .from('groomers')
      .update({
        stripe_cancel_at_period_end: true,
        plan_current_period_end: data.current_period_end
          ? new Date(data.current_period_end * 1000).toISOString()
          : null,
      })
      .eq('id', groomer.id);

    return jsonResponse({
      success: true,
      currentPeriodEnd: data.current_period_end
        ? new Date(data.current_period_end * 1000).toISOString()
        : null,
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
