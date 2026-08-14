import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { pushTokensForUser, sendExpoPushToTokens } from '../_shared/push.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_ADDRESS = 'PawBooker <notifications@paw-booker.com>';

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

// Tax on the whole visit's combined subtotal, based on the groomer's
// jurisdiction (origin-based). Mirrors stripe-charge-booking; falls back to no
// tax rather than blocking the charge if Stripe Tax isn't configured.
async function calculateTax(subtotalCents: number, reference: string, state: string | null, zip: string | null) {
  if (!state || !zip) return null;
  const { ok, data } = await stripePost('tax/calculations', {
    currency: 'usd',
    'customer_details[address][country]': 'US',
    'customer_details[address][state]': state,
    'customer_details[address][postal_code]': zip,
    'customer_details[address_source]': 'shipping',
    'line_items[0][amount]': String(subtotalCents),
    'line_items[0][reference]': reference,
  });
  if (!ok) {
    console.warn('Stripe Tax calculation failed', data);
    return null;
  }
  return {
    calculationId: data.id as string,
    taxAmountCents: data.tax_amount_exclusive as number,
    totalCents: data.amount_total as number,
  };
}

type GroomerRel = {
  name: string;
  state: string | null;
  zip_code: string | null;
  plan: string;
  stripe_connect_account_id: string | null;
  stripe_connect_charges_enabled: boolean;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { groupId } = (await req.json()) as { groupId: string };

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    // Billable pets in this visit: service marked done, not yet charged.
    const { data: bookingRows, error: bookingError } = await supabase
      .from('bookings')
      .select(
        'id, customer_id, customer_email, status, service_completed_at, starts_at, groomer_id, groomers(name, state, zip_code, plan, stripe_connect_account_id, stripe_connect_charges_enabled), groomer_services(name), pets(name)'
      )
      .eq('group_id', groupId)
      .eq('status', 'confirmed')
      .order('starts_at', { ascending: true });

    if (bookingError) {
      return jsonResponse({ error: bookingError.message }, 500);
    }

    const billable = (bookingRows ?? []).filter((b) => b.service_completed_at);
    if (billable.length === 0) {
      return jsonResponse({ error: 'No pets are ready to bill in this visit.' }, 400);
    }

    const lead = billable[0];
    const customerId = lead.customer_id as string;
    const groomerId = lead.groomer_id as string;
    const groomer = lead.groomers as unknown as GroomerRel;

    const ids = billable.map((b) => b.id as string);

    // Per-pet line items → per-pet subtotal, and the combined visit subtotal.
    const { data: lineItems, error: lineItemsError } = await supabase
      .from('booking_line_items')
      .select('booking_id, description, amount_cents')
      .in('booking_id', ids);

    if (lineItemsError) {
      return jsonResponse({ error: lineItemsError.message }, 500);
    }

    const subtotalByBooking = new Map<string, number>();
    const itemsByBooking = new Map<string, { description: string; amount_cents: number }[]>();
    for (const item of lineItems ?? []) {
      subtotalByBooking.set(item.booking_id, (subtotalByBooking.get(item.booking_id) ?? 0) + item.amount_cents);
      const list = itemsByBooking.get(item.booking_id) ?? [];
      list.push({ description: item.description, amount_cents: item.amount_cents });
      itemsByBooking.set(item.booking_id, list);
    }

    // Every billable pet must have at least one line item.
    for (const id of ids) {
      if (!itemsByBooking.has(id)) {
        return jsonResponse({ error: 'Every pet needs at least one invoice item before charging.' }, 400);
      }
    }

    const combinedSubtotalCents = ids.reduce((sum, id) => sum + (subtotalByBooking.get(id) ?? 0), 0);
    if (combinedSubtotalCents <= 0) {
      return jsonResponse({ error: 'Invoice total must be greater than zero' }, 400);
    }

    const tax = await calculateTax(combinedSubtotalCents, `group_${groupId}`, groomer.state, groomer.zip_code);
    const taxAmountCents = tax?.taxAmountCents ?? 0;
    const grandTotalCents = tax?.totalCents ?? combinedSubtotalCents;

    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // One charge for the whole visit, so this counts as a single rate-limit hit.
    const allowed = await checkRateLimit(serviceRoleClient, `charge:${customerId}`, 5, 600);
    if (!allowed) {
      return jsonResponse({ error: 'Too many charge attempts - please wait a few minutes and try again.' }, 429);
    }

    // Acquisition fee applies once per customer, on the combined subtotal.
    const { data: pairing } = await serviceRoleClient
      .from('groomer_customers')
      .select('origin, acquisition_settled')
      .eq('groomer_id', groomerId)
      .eq('customer_id', customerId)
      .maybeSingle();

    const feeApplies =
      groomer.plan !== 'pro' &&
      (pairing?.origin ?? 'search') === 'search' &&
      !(pairing?.acquisition_settled ?? false);
    const acquisitionFeeCents = feeApplies ? Math.round(combinedSubtotalCents * 0.05) : 0;

    const { data: paymentMethods } = await serviceRoleClient
      .from('customer_payment_methods')
      .select('stripe_customer_id, stripe_payment_method_id')
      .eq('user_id', customerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (!paymentMethods || paymentMethods.length === 0) {
      return jsonResponse({ error: 'Customer has no payment method on file' }, 400);
    }

    const petNames = billable.map((b) => (b.pets as unknown as { name: string })?.name ?? 'Pet');

    let paymentIntent: { id: string; status: string; error?: { message?: string } } | undefined;
    let lastErrorMessage = 'Charge failed';

    for (const method of paymentMethods) {
      const params: Record<string, string> = {
        amount: String(grandTotalCents),
        currency: 'usd',
        customer: method.stripe_customer_id,
        payment_method: method.stripe_payment_method_id,
        off_session: 'true',
        confirm: 'true',
        description: `Grooming for ${petNames.join(', ')}`,
        'metadata[group_id]': groupId,
      };
      if (groomer.stripe_connect_account_id && groomer.stripe_connect_charges_enabled) {
        params['transfer_data[destination]'] = groomer.stripe_connect_account_id;
        if (acquisitionFeeCents > 0) {
          params['application_fee_amount'] = String(acquisitionFeeCents);
        }
      }

      const { ok, data } = await stripePost('payment_intents', params);
      paymentIntent = data;
      if (ok && data.status === 'succeeded') break;
      lastErrorMessage = data.error?.message ?? 'Charge failed';
    }

    if (!paymentIntent || paymentIntent.status !== 'succeeded') {
      await supabase.from('bookings').update({ payment_status: 'failed' }).in('id', ids);

      const failureTokens = await pushTokensForUser(serviceRoleClient, customerId);
      await sendExpoPushToTokens(
        failureTokens,
        'Payment declined',
        `We couldn't charge your card for the visit at ${groomer.name}. Please update your payment method.`,
        { screen: 'profile' }
      );

      return jsonResponse({ error: lastErrorMessage }, 402);
    }

    if (tax?.calculationId) {
      const { ok: taxOk, data: taxTxError } = await stripePost('tax/transactions/create_from_calculation', {
        calculation: tax.calculationId,
        reference: `group_${groupId}`,
      });
      if (!taxOk) console.warn('Failed to record tax transaction', taxTxError);
    }

    // Distribute the visit's tax across pets by each pet's share of the subtotal,
    // putting any rounding remainder on the lead booking so the parts sum exactly
    // to the tax charged. The 5% platform fee is recorded once, on the lead.
    let distributedTax = 0;
    const taxShareByBooking = new Map<string, number>();
    for (const id of ids) {
      const share = Math.round((taxAmountCents * (subtotalByBooking.get(id) ?? 0)) / combinedSubtotalCents);
      taxShareByBooking.set(id, share);
      distributedTax += share;
    }
    taxShareByBooking.set(lead.id, (taxShareByBooking.get(lead.id) ?? 0) + (taxAmountCents - distributedTax));

    const nowIso = new Date().toISOString();
    for (const id of ids) {
      const petSubtotal = subtotalByBooking.get(id) ?? 0;
      const petTax = taxShareByBooking.get(id) ?? 0;
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          status: 'completed',
          payment_status: 'paid',
          stripe_payment_intent_id: paymentIntent.id,
          invoice_total_cents: petSubtotal + petTax,
          tax_amount_cents: petTax,
          platform_fee_cents: id === lead.id ? acquisitionFeeCents : 0,
          invoice_sent_at: nowIso,
        })
        .eq('id', id);
      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500);
      }
    }

    // Close the acquisition window once (first visit completed).
    const settleUpdate: Record<string, unknown> = { acquisition_settled: true };
    if (acquisitionFeeCents > 0) settleUpdate.acquisition_fee_cents = acquisitionFeeCents;
    await serviceRoleClient
      .from('groomer_customers')
      .update(settleUpdate)
      .eq('groomer_id', groomerId)
      .eq('customer_id', customerId);

    const pushTokens = await pushTokensForUser(serviceRoleClient, customerId);
    await sendExpoPushToTokens(
      pushTokens,
      'Invoice ready',
      `Your visit at ${groomer.name} for ${petNames.length} pets is complete — $${(grandTotalCents / 100).toFixed(2)} charged.`,
      {}
    );

    if (lead.customer_email) {
      const petSections = billable
        .map((b) => {
          const name = (b.pets as unknown as { name: string })?.name ?? 'Pet';
          const items = (itemsByBooking.get(b.id) ?? [])
            .map((item) => `  ${item.description}: $${(item.amount_cents / 100).toFixed(2)}`)
            .join('\n');
          return `${name}:\n${items}`;
        })
        .join('\n\n');
      const taxLine = taxAmountCents > 0 ? `\nSales tax: $${(taxAmountCents / 100).toFixed(2)}` : '';
      const text = `Your visit at ${groomer.name} is complete.\n\nInvoice:\n\n${petSections}\n${taxLine}\n\nTotal charged: $${(grandTotalCents / 100).toFixed(2)}\n\nThank you for using PawBooker!`;

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: lead.customer_email,
          subject: `Invoice for your visit at ${groomer.name}`,
          text,
        }),
      });
      if (!emailResponse.ok) {
        console.warn('Resend group invoice email failed', await emailResponse.text());
      }
    }

    return jsonResponse({ success: true, totalCents: grandTotalCents, petCount: ids.length });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
