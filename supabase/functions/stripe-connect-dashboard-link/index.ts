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
      .select('stripe_connect_account_id')
      .eq('user_id', user.id)
      .single();

    if (groomerError || !groomer?.stripe_connect_account_id) {
      return jsonResponse({ error: 'Payouts have not been set up yet' }, 400);
    }

    const response = await fetch(
      `https://api.stripe.com/v1/accounts/${groomer.stripe_connect_account_id}/login_links`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      }
    );
    const data = await response.json();
    if (!response.ok) {
      return jsonResponse({ error: data.error?.message ?? 'Stripe request failed' }, 500);
    }

    return jsonResponse({ url: data.url });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
