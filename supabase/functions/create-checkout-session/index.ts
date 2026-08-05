import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public, unauthenticated by design - reached only from the web upgrade form
// at paw-booker.com/upgrade, never linked or opened from inside the app.
// Apple and Google require Pro (it unlocks in-app features) to be sold via
// their own in-app purchase systems if the app itself sells or links to it -
// the app deliberately has no "Upgrade" button; it just tells groomers to
// visit the website, so this stays outside that requirement.
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
  const email = url.searchParams.get('email')?.trim().toLowerCase();

  if (!email) {
    return new Response('Missing email', { status: 400 });
  }

  const serviceRoleClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: groomer } = await serviceRoleClient
    .from('groomers')
    .select('id, email, plan')
    .ilike('email', email)
    .maybeSingle();

  if (!groomer) {
    return new Response(
      "We couldn't find a groomer account with that email. Double-check it matches the email on your PawBooker account.",
      { status: 404 }
    );
  }

  if (groomer.plan === 'pro') {
    return new Response('This account is already on the Pro plan.', { status: 400 });
  }

  const { ok, data: session } = await stripePost('checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': STRIPE_PRO_PRICE_ID,
    'line_items[0][quantity]': '1',
    success_url: 'https://paw-booker.com/upgrade?success=1',
    cancel_url: 'https://paw-booker.com/upgrade',
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
