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

// Best-effort Stripe cleanup - a failure here (already-canceled subscription,
// already-deleted customer, etc.) should never block the account deletion
// itself, so callers just log and move on.
async function stripeDelete(path: string) {
  try {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    if (!response.ok) {
      console.warn(`Stripe DELETE ${path} failed`, await response.text());
    }
  } catch (err) {
    console.warn(`Stripe DELETE ${path} threw`, err instanceof Error ? err.message : err);
  }
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

    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Stop any active billing before the account (and our record of these
    // Stripe IDs) disappears - a groomer's Pro subscription, and the Stripe
    // Customer object backing a customer's saved payment methods.
    const { data: groomer } = await serviceRoleClient
      .from('groomers')
      .select('id, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (groomer?.stripe_subscription_id) {
      await stripeDelete(`subscriptions/${groomer.stripe_subscription_id}`);
    }

    // groomers.user_id sets null (not cascade) below, which on its own would
    // leave a live, bookable salon listing behind with no owner who could
    // ever respond - deactivate it explicitly. This doesn't touch their
    // services, past bookings, or reviews.
    if (groomer) {
      await serviceRoleClient.from('groomers').update({ deactivated_at: new Date().toISOString() }).eq('id', groomer.id);
    }

    const { data: billing } = await serviceRoleClient
      .from('customer_billing')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (billing?.stripe_customer_id) {
      await stripeDelete(`customers/${billing.stripe_customer_id}`);
    }

    // Strip the directly-identifying fields on bookings that aren't covered
    // by the customer_id -> null anonymization the FK handles below.
    await serviceRoleClient
      .from('bookings')
      .update({ customer_email: null, customer_name: null })
      .eq('customer_id', user.id);

    // Deleting the auth user cascades/nulls everything else: pets, saved
    // payment methods, chat threads+messages, app reviews, and win-back
    // reminders are removed outright; bookings and salon reviews keep their
    // row (service, invoice, rating) with customer_id/pet_id set to null;
    // if this user is also a groomer, groomers.user_id is set to null,
    // orphaning login access without deleting their public salon listing.
    const { error: deleteError } = await serviceRoleClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
