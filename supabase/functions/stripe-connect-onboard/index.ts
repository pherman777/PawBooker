import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
// Stripe's Account Links API requires a real https:// URL here — it won't
// accept a custom app scheme like pawbooker://. The groomer just needs to
// manually switch back to the app after finishing; the Payouts screen
// refreshes its status on focus regardless of how they got back.
const RETURN_URL = 'https://paw-booker.com';

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
      .select('id, stripe_connect_account_id')
      .eq('user_id', user.id)
      .single();

    if (groomerError || !groomer) {
      return jsonResponse({ error: 'Groomer profile not found' }, 404);
    }

    let accountId = groomer.stripe_connect_account_id as string | null;

    if (!accountId) {
      const account = await stripePost('accounts', {
        type: 'express',
        country: 'US',
        email: user.email ?? '',
        'capabilities[card_payments][requested]': 'true',
        'capabilities[transfers][requested]': 'true',
      });
      accountId = account.id;

      const serviceRoleClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      const { error: updateError } = await serviceRoleClient
        .from('groomers')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', groomer.id);

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500);
      }
    }

    const accountLink = await stripePost('account_links', {
      account: accountId!,
      refresh_url: RETURN_URL,
      return_url: RETURN_URL,
      type: 'account_onboarding',
    });

    return jsonResponse({ url: accountLink.url });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
