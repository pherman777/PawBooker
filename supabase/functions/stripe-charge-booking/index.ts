import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

import { generateInvoicePdf } from './invoice-pdf.ts';
import { pushTokensForUser, sendExpoPushToTokens } from '../_shared/push.ts';

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

// Grooming is performed at the groomer's own location, so tax is calculated
// based on the groomer's jurisdiction (origin-based), not the customer's.
// Requires Stripe Tax to be enabled + a tax registration for that jurisdiction
// in the Stripe dashboard; if not configured, this falls back to no tax
// rather than blocking the charge.
async function calculateTax(subtotalCents: number, bookingId: string, groomerState: string | null, groomerZip: string | null) {
  if (!groomerState || !groomerZip) return null;

  const { ok, data } = await stripePost('tax/calculations', {
    currency: 'usd',
    'customer_details[address][country]': 'US',
    'customer_details[address][state]': groomerState,
    'customer_details[address][postal_code]': groomerZip,
    'customer_details[address_source]': 'shipping',
    'line_items[0][amount]': String(subtotalCents),
    'line_items[0][reference]': `booking_${bookingId}`,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { bookingId } = (await req.json()) as { bookingId: string };

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(
        'id, customer_id, customer_email, status, groomers(name, state, zip_code), groomer_services(name), pets(name)'
      )
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return jsonResponse({ error: bookingError?.message ?? 'Booking not found' }, 404);
    }

    if (booking.status === 'completed' || booking.status === 'cancelled') {
      return jsonResponse({ error: `Booking is already ${booking.status}` }, 400);
    }

    const { data: lineItems, error: lineItemsError } = await supabase
      .from('booking_line_items')
      .select('description, amount_cents')
      .eq('booking_id', bookingId);

    if (lineItemsError || !lineItems || lineItems.length === 0) {
      return jsonResponse({ error: 'No line items to charge' }, 400);
    }

    const subtotalCents = lineItems.reduce((sum, item) => sum + item.amount_cents, 0);
    if (subtotalCents <= 0) {
      return jsonResponse({ error: 'Invoice total must be greater than zero' }, 400);
    }

    const groomer = booking.groomers as unknown as { name: string; state: string | null; zip_code: string | null };
    const service = booking.groomer_services as unknown as { name: string };
    const pet = booking.pets as unknown as { name: string };

    const tax = await calculateTax(subtotalCents, bookingId, groomer.state, groomer.zip_code);
    const taxAmountCents = tax?.taxAmountCents ?? 0;
    const grandTotalCents = tax?.totalCents ?? subtotalCents;

    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: billing } = await serviceRoleClient
      .from('customer_billing')
      .select('stripe_customer_id, default_payment_method_id')
      .eq('user_id', booking.customer_id)
      .maybeSingle();

    if (!billing) {
      return jsonResponse({ error: 'Customer has no payment method on file' }, 400);
    }

    const { ok, data: paymentIntent } = await stripePost('payment_intents', {
      amount: String(grandTotalCents),
      currency: 'usd',
      customer: billing.stripe_customer_id,
      payment_method: billing.default_payment_method_id,
      off_session: 'true',
      confirm: 'true',
    });

    if (!ok || paymentIntent.status !== 'succeeded') {
      await supabase.from('bookings').update({ payment_status: 'failed' }).eq('id', bookingId);
      return jsonResponse({ error: paymentIntent.error?.message ?? 'Charge failed' }, 402);
    }

    if (tax?.calculationId) {
      const { ok: taxOk, data: taxTxError } = await stripePost('tax/transactions/create_from_calculation', {
        calculation: tax.calculationId,
        reference: bookingId,
      });
      if (!taxOk) console.warn('Failed to record tax transaction', taxTxError);
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'completed',
        payment_status: 'paid',
        stripe_payment_intent_id: paymentIntent.id,
        invoice_total_cents: grandTotalCents,
        tax_amount_cents: taxAmountCents,
        invoice_sent_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    const pushTokens = await pushTokensForUser(serviceRoleClient, booking.customer_id);
    await sendExpoPushToTokens(
      pushTokens,
      'Invoice ready',
      `Your ${service.name} appointment for ${pet.name} is complete — $${(grandTotalCents / 100).toFixed(2)} charged.`,
      { bookingId }
    );

    if (booking.customer_email) {
      const taxLine = taxAmountCents > 0 ? `  Sales tax: $${(taxAmountCents / 100).toFixed(2)}\n` : '';
      const lines = lineItems
        .map((item) => `  ${item.description}: $${(item.amount_cents / 100).toFixed(2)}`)
        .join('\n');
      const text = `Your ${service.name} appointment for ${pet.name} at ${groomer.name} is complete.\n\nInvoice:\n${lines}\n${taxLine}\nTotal charged: $${(grandTotalCents / 100).toFixed(2)}\n\nA detailed PDF invoice is attached.\n\nThank you for using PawBooker!`;

      const pdfBytes = await generateInvoicePdf({
        groomerName: groomer.name,
        petName: pet.name,
        serviceName: service.name,
        customerEmail: booking.customer_email,
        date: new Date(),
        lineItems,
        taxAmountCents,
        totalCents: grandTotalCents,
      });

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: booking.customer_email,
          subject: `Invoice for your ${service.name} appointment`,
          text,
          attachments: [
            {
              filename: 'invoice.pdf',
              content: encodeBase64(pdfBytes),
            },
          ],
        }),
      });

      if (!emailResponse.ok) {
        console.warn('Resend invoice email failed', await emailResponse.text());
      }
    }

    return jsonResponse({ success: true, subtotalCents, taxAmountCents, totalCents: grandTotalCents });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
