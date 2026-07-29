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

async function stripeGet(path: string) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? 'Stripe request failed');
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { setupIntentId } = (await req.json()) as { setupIntentId: string };

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

    const setupIntent = await stripeGet(`setup_intents/${setupIntentId}`);
    if (setupIntent.status !== 'succeeded' || !setupIntent.payment_method) {
      return jsonResponse({ error: 'Setup was not completed successfully' }, 400);
    }

    const paymentMethod = await stripeGet(`payment_methods/${setupIntent.payment_method}`);

    const { count: existingCount } = await supabase
      .from('customer_payment_methods')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Only auto-default the very first method someone adds; later additions
    // stay secondary until the customer explicitly makes them default.
    const isFirstMethod = !existingCount || existingCount === 0;

    const { error: insertError } = await supabase.from('customer_payment_methods').insert({
      user_id: user.id,
      stripe_customer_id: setupIntent.customer,
      stripe_payment_method_id: setupIntent.payment_method,
      card_brand: paymentMethod.card?.brand ?? null,
      card_last4: paymentMethod.card?.last4 ?? null,
      wallet_type: paymentMethod.card?.wallet?.type ?? null,
      is_default: isFirstMethod,
    });

    if (insertError) {
      return jsonResponse({ error: insertError.message }, 500);
    }

    return jsonResponse({
      success: true,
      brand: paymentMethod.card?.brand ?? null,
      last4: paymentMethod.card?.last4 ?? null,
      walletType: paymentMethod.card?.wallet?.type ?? null,
      isDefault: isFirstMethod,
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
