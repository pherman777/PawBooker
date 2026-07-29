import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL')!;
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
    const { bookingId, reason, details } = (await req.json()) as {
      bookingId: string;
      reason: string;
      details?: string;
    };

    if (!reason) {
      return jsonResponse({ error: 'A reason is required' }, 400);
    }

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

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(
        'id, customer_id, customer_email, groomers(name, user_id), groomer_services(name), pets(name)'
      )
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return jsonResponse({ error: bookingError?.message ?? 'Booking not found' }, 404);
    }

    const groomer = booking.groomers as unknown as { name: string; user_id: string | null };
    const service = booking.groomer_services as unknown as { name: string };
    const pet = booking.pets as unknown as { name: string };

    const reporterIsCustomer = user.id === booking.customer_id;
    const reportedUserId = reporterIsCustomer ? groomer.user_id : booking.customer_id;

    const { error: insertError } = await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_user_id: reportedUserId,
      booking_id: bookingId,
      reason,
      details: details ?? null,
    });

    if (insertError) {
      return jsonResponse({ error: insertError.message }, 500);
    }

    if (ADMIN_EMAIL && RESEND_API_KEY) {
      const reportedLabel = reporterIsCustomer ? `groomer "${groomer.name}"` : `customer ${booking.customer_email ?? booking.customer_id}`;
      const text = `A ${reporterIsCustomer ? 'customer' : 'groomer'} filed a report.

Reported: ${reportedLabel}
Reason: ${reason}
${details ? `Details: ${details}\n` : ''}
Booking: ${service?.name ?? 'Service'} for ${pet?.name ?? 'a pet'} (id ${bookingId})
Reporter: ${user.email ?? user.id}`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: ADMIN_EMAIL,
          subject: `New report: ${reason}`,
          text,
        }),
      });
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
