import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public, unauthenticated by design - this is opened directly in a browser
// (not called via fetch/XHR from the app), as the entry point for a groomer
// upgrading to Pro on the website instead of inside the app. Apple/Google
// require digital in-app features like Pro to be sold this way (or via each
// platform's own in-app purchase system) rather than processed in-app.
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_PRO_PRICE_ID = Deno.env.get('STRIPE_PRO_PRICE_ID')!;

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
  const url = new URL(req.url);
  const groomerId = url.searchParams.get('groomerId');

  if (!groomerId) {
    return new Response('Missing groomerId', { status: 400 });
  }

  const serviceRoleClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: groomer } = await serviceRoleClient
    .from('groomers')
    .select('id, email, plan')
    .eq('id', groomerId)
    .maybeSingle();

  if (!groomer) {
    return new Response('Groomer not found', { status: 404 });
  }

  if (groomer.plan === 'pro') {
    return new Response('This account is already on the Pro plan.', { status: 400 });
  }

  const { ok, data: session } = await stripePost('checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': STRIPE_PRO_PRICE_ID,
    'line_items[0][quantity]': '1',
    success_url: 'pawbooker://(salon)/plan?upgraded=1',
    cancel_url: 'pawbooker://(salon)/plan',
    ...(groomer.email ? { customer_email: groomer.email } : {}),
    'subscription_data[metadata][groomerId]': groomer.id,
  });

  if (!ok || !session.url) {
    return new Response(`Could not start checkout: ${session.error?.message ?? 'Unknown error'}`, {
      status: 502,
    });
  }

  return new Response(null, { status: 302, headers: { Location: session.url } });
});
