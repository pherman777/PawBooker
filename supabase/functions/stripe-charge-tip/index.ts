import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { pushTokensForUser, sendExpoPushToTokens } from '../_shared/push.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

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
    const { bookingId, tipAmountCents } = (await req.json()) as {
      bookingId: string;
      tipAmountCents: number;
    };

    if (!Number.isInteger(tipAmountCents) || tipAmountCents <= 0) {
      return jsonResponse({ error: 'Tip amount must be a positive number of cents' }, 400);
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(
        'id, customer_id, status, tip_amount_cents, groomers(name, user_id, stripe_connect_account_id, stripe_connect_charges_enabled), groomer_services(name), pets(name)'
      )
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return jsonResponse({ error: bookingError?.message ?? 'Booking not found' }, 404);
    }

    if (booking.status !== 'completed') {
      return jsonResponse({ error: 'You can only tip a completed appointment.' }, 400);
    }

    if (booking.tip_amount_cents != null) {
      return jsonResponse({ error: 'This appointment has already been tipped.' }, 400);
    }

    const groomer = booking.groomers as unknown as {
      name: string;
      user_id: string | null;
      stripe_connect_account_id: string | null;
      stripe_connect_charges_enabled: boolean;
    };
    const service = booking.groomer_services as unknown as { name: string };
    const pet = booking.pets as unknown as { name: string };

    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const allowed = await checkRateLimit(serviceRoleClient, `charge:${booking.customer_id}`, 5, 600);
    if (!allowed) {
      return jsonResponse({ error: 'Too many charge attempts - please wait a few minutes and try again.' }, 429);
    }

    const { data: paymentMethods } = await serviceRoleClient
      .from('customer_payment_methods')
      .select('stripe_customer_id, stripe_payment_method_id')
      .eq('user_id', booking.customer_id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (!paymentMethods || paymentMethods.length === 0) {
      return jsonResponse({ error: 'No payment method on file' }, 400);
    }

    // Tips are advertised as "100% goes to your groomer" — route the whole
    // amount to their connected account once they've finished Connect
    // onboarding (never take a platform cut of tips).
    let paymentIntent: { id: string; status: string; error?: { message?: string } } | undefined;
    let lastErrorMessage = 'Charge failed';

    // Try the default payment method first, then fall back through any other
    // saved methods (e.g. a backup card) before giving up on this charge.
    for (const method of paymentMethods) {
      const tipParams: Record<string, string> = {
        amount: String(tipAmountCents),
        currency: 'usd',
        customer: method.stripe_customer_id,
        payment_method: method.stripe_payment_method_id,
        off_session: 'true',
        confirm: 'true',
        description: `Tip for ${service.name} - ${pet.name}`,
      };
      if (groomer.stripe_connect_account_id && groomer.stripe_connect_charges_enabled) {
        tipParams['transfer_data[destination]'] = groomer.stripe_connect_account_id;
      }

      const { ok, data } = await stripePost('payment_intents', tipParams);
      paymentIntent = data;

      if (ok && data.status === 'succeeded') break;
      lastErrorMessage = data.error?.message ?? 'Charge failed';
    }

    if (!paymentIntent || paymentIntent.status !== 'succeeded') {
      const failureTokens = await pushTokensForUser(serviceRoleClient, booking.customer_id);
      await sendExpoPushToTokens(
        failureTokens,
        'Tip declined',
        `We couldn't charge your card for the tip on ${pet.name}'s ${service.name}. Please update your payment method.`,
        { bookingId, screen: 'profile' }
      );

      return jsonResponse({ error: lastErrorMessage }, 402);
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        tip_amount_cents: tipAmountCents,
        tip_payment_intent_id: paymentIntent.id,
        tip_paid_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    if (groomer.user_id) {
      const tokens = await pushTokensForUser(serviceRoleClient, groomer.user_id);
      await sendExpoPushToTokens(
        tokens,
        'You got a tip!',
        `$${(tipAmountCents / 100).toFixed(2)} tip for ${pet.name}'s ${service.name}.`,
        { bookingId }
      );
    }

    return jsonResponse({ success: true, tipAmountCents });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
