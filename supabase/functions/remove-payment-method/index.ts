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
    const { paymentMethodId } = (await req.json()) as { paymentMethodId: string };

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

    const { data: row, error: rowError } = await supabase
      .from('customer_payment_methods')
      .select('id, stripe_payment_method_id')
      .eq('id', paymentMethodId)
      .single();

    if (rowError || !row) {
      return jsonResponse({ error: 'Payment method not found' }, 404);
    }

    const detachResponse = await fetch(
      `https://api.stripe.com/v1/payment_methods/${row.stripe_payment_method_id}/detach`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      }
    );
    if (!detachResponse.ok) {
      console.warn('Stripe detach failed', await detachResponse.text());
    }

    const { error: deleteError } = await supabase.from('customer_payment_methods').delete().eq('id', row.id);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
