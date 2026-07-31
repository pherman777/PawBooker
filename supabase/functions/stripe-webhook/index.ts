import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// Two separate webhook endpoints are registered in Stripe - one scoped to
// "Your account" for platform-level events (subscriptions), one scoped to
// "Connected accounts" for events on a groomer's own Connect account
// (account.updated). Each endpoint has its own signing secret.
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const STRIPE_CONNECT_WEBHOOK_SECRET = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')!;
const MAX_TIMESTAMP_AGE_SECONDS = 5 * 60;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function verifyStripeSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    })
  );

  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_TIMESTAMP_AGE_SECONDS) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
  const expectedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return expectedHex === signature;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('stripe-signature');

    const verified =
      signatureHeader &&
      ((await verifyStripeSignature(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET)) ||
        (await verifyStripeSignature(rawBody, signatureHeader, STRIPE_CONNECT_WEBHOOK_SECRET)));

    if (!verified) {
      return jsonResponse({ error: 'Invalid signature' }, 400);
    }

    const event = JSON.parse(rawBody);
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object;

      // Subscriptions started via the website checkout (create-checkout-session)
      // carry the groomer's id directly in metadata. Older subscriptions started
      // from inside the app instead look up the groomer via their saved Stripe
      // customer id.
      let groomerId: string | null = subscription.metadata?.groomerId ?? null;
      console.log('subscription event', event.type, 'metadata', JSON.stringify(subscription.metadata));

      if (!groomerId) {
        const stripeCustomerId = subscription.customer as string;
        const { data: billing } = await serviceRoleClient
          .from('customer_billing')
          .select('user_id')
          .eq('stripe_customer_id', stripeCustomerId)
          .maybeSingle();

        if (billing) {
          const { data: groomer } = await serviceRoleClient
            .from('groomers')
            .select('id')
            .eq('user_id', billing.user_id)
            .maybeSingle();
          groomerId = groomer?.id ?? null;
        }

        console.log('fell back to customer_billing lookup, resolved groomerId:', groomerId);
      }

      if (groomerId) {
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';

        const { error: updateError, data: updateData } = await serviceRoleClient
          .from('groomers')
          .update({
            plan: isActive ? 'pro' : 'free',
            stripe_subscription_id: isActive ? subscription.id : null,
            stripe_cancel_at_period_end: isActive ? Boolean(subscription.cancel_at_period_end) : false,
            plan_current_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
          })
          .eq('id', groomerId)
          .select();

        console.log('groomer update result', JSON.stringify({ updateError, updateData }));
      } else {
        console.warn('Could not resolve a groomerId for subscription', subscription.id);
      }
    }

    if (event.type === 'account.updated') {
      const account = event.data.object;

      await serviceRoleClient
        .from('groomers')
        .update({
          stripe_connect_charges_enabled: Boolean(account.charges_enabled),
          stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
        })
        .eq('stripe_connect_account_id', account.id);
    }

    return jsonResponse({ received: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
