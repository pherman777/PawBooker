import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_PRO_PRICE_ID = Deno.env.get('STRIPE_PRO_PRICE_ID')!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function stripePost(path: string, params: Record<string, string>) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const data = await response.json();
  return { ok: response.ok, data };
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
      .select('id, plan')
      .eq('user_id', user.id)
      .maybeSingle();

    if (groomerError || !groomer) {
      return jsonResponse({ error: 'No groomer account found for this user' }, 400);
    }

    if (groomer.plan === 'pro') {
      return jsonResponse({ error: 'Already on the Pro plan' }, 400);
    }

    const { data: billing } = await supabase
      .from('customer_billing')
      .select('stripe_customer_id, default_payment_method_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!billing) {
      return jsonResponse({ error: 'Add a payment method first' }, 400);
    }

    await stripePost(`customers/${billing.stripe_customer_id}`, {
      'invoice_settings[default_payment_method]': billing.default_payment_method_id,
    });

    const { ok, data: subscription } = await stripePost('subscriptions', {
      customer: billing.stripe_customer_id,
      'items[0][price]': STRIPE_PRO_PRICE_ID,
      default_payment_method: billing.default_payment_method_id,
    });

    if (!ok || (subscription.status !== 'active' && subscription.status !== 'trialing')) {
      return jsonResponse({ error: subscription.error?.message ?? 'Subscription could not be started' }, 402);
    }

    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: updateError } = await serviceRoleClient
      .from('groomers')
      .update({
        plan: 'pro',
        stripe_subscription_id: subscription.id,
        stripe_cancel_at_period_end: false,
        plan_current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      })
      .eq('id', groomer.id);

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
