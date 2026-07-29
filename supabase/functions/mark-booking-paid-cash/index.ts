import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

import { generateInvoicePdf } from '../_shared/invoice-pdf.ts';
import { pushTokensForUser, sendExpoPushToTokens } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_ADDRESS = 'PawBooker <notifications@paw-booker.com>';

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
    const { bookingId } = (await req.json()) as { bookingId: string };

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, customer_id, customer_email, status, groomers(name), groomer_services(name), pets(name)')
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
      return jsonResponse({ error: 'No line items to record' }, 400);
    }

    const totalCents = lineItems.reduce((sum, item) => sum + item.amount_cents, 0);
    if (totalCents <= 0) {
      return jsonResponse({ error: 'Invoice total must be greater than zero' }, 400);
    }

    const groomer = booking.groomers as unknown as { name: string };
    const service = booking.groomer_services as unknown as { name: string };
    const pet = booking.pets as unknown as { name: string };

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'completed',
        payment_status: 'paid',
        payment_method: 'cash',
        invoice_total_cents: totalCents,
        tax_amount_cents: 0,
        invoice_sent_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const pushTokens = await pushTokensForUser(serviceRoleClient, booking.customer_id);
    await sendExpoPushToTokens(
      pushTokens,
      'Invoice ready',
      `Your ${service.name} appointment for ${pet.name} is complete — $${(totalCents / 100).toFixed(2)} paid in cash.`,
      { bookingId }
    );

    if (booking.customer_email) {
      const lines = lineItems
        .map((item) => `  ${item.description}: $${(item.amount_cents / 100).toFixed(2)}`)
        .join('\n');
      const text = `Your ${service.name} appointment for ${pet.name} at ${groomer.name} is complete.\n\nInvoice:\n${lines}\n\nTotal paid in cash: $${(totalCents / 100).toFixed(2)}\n\nA detailed PDF invoice is attached.\n\nThank you for using PawBooker!`;

      const pdfBytes = await generateInvoicePdf({
        groomerName: groomer.name,
        petName: pet.name,
        serviceName: service.name,
        customerEmail: booking.customer_email,
        date: new Date(),
        lineItems,
        taxAmountCents: 0,
        totalCents,
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

    return jsonResponse({ success: true, totalCents });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
