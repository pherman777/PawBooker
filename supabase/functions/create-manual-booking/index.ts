import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { checkRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Lets a groomer create a booking directly for a customer who's already on
// PawBooker (a phone-in or walk-in the groomer wants to fit into a slot the
// self-service booking flow doesn't show as open). Deliberately narrow:
// - the customer must already be linked via groomer_customers (redeemed the
//   groomer's invite code, or has a past booking) - not a lookup of anyone
//   on the platform.
// - the pet must already exist, added by its own owner. This function never
//   creates or edits a pets row - nothing about a customer beyond their own
//   already-self-entered email and pets is ever read or written here.
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

    const allowed = await checkRateLimit(serviceRoleClient, `create-manual-booking:${user.id}`, 20, 3600);
    if (!allowed) {
      return jsonResponse({ error: 'Too many attempts. Please try again later.' }, 429);
    }

    const body = (await req.json().catch(() => ({}))) as {
      customerId?: unknown;
      petId?: unknown;
      serviceId?: unknown;
      staffId?: unknown;
      startsAt?: unknown;
    };

    const customerId = typeof body.customerId === 'string' ? body.customerId : '';
    const petId = typeof body.petId === 'string' ? body.petId : '';
    const serviceId = typeof body.serviceId === 'string' ? body.serviceId : '';
    const staffId = typeof body.staffId === 'string' ? body.staffId : null;
    const startsAt = typeof body.startsAt === 'string' ? body.startsAt : '';

    if (!customerId || !petId || !serviceId || !startsAt) {
      return jsonResponse({ error: 'Missing customer, pet, service, or time.' }, 400);
    }
    if (Number.isNaN(new Date(startsAt).getTime())) {
      return jsonResponse({ error: 'Invalid date/time.' }, 400);
    }

    const { data: groomer } = await serviceRoleClient
      .from('groomers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!groomer) {
      return jsonResponse({ error: 'Only groomers can create bookings this way.' }, 403);
    }

    const { data: link } = await serviceRoleClient
      .from('groomer_customers')
      .select('customer_id')
      .eq('groomer_id', groomer.id)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (!link) {
      return jsonResponse({ error: "This customer isn't linked to your salon yet." }, 403);
    }

    const { data: pet } = await serviceRoleClient
      .from('pets')
      .select('id, owner_id')
      .eq('id', petId)
      .maybeSingle();

    if (!pet || pet.owner_id !== customerId) {
      return jsonResponse({ error: "Couldn't find that pet on this customer's account." }, 404);
    }

    const { data: service } = await serviceRoleClient
      .from('groomer_services')
      .select('id')
      .eq('id', serviceId)
      .eq('groomer_id', groomer.id)
      .maybeSingle();

    if (!service) {
      return jsonResponse({ error: "That service isn't one of yours." }, 404);
    }

    if (staffId) {
      const { data: staff } = await serviceRoleClient
        .from('salon_staff')
        .select('id')
        .eq('id', staffId)
        .eq('salon_id', groomer.id)
        .maybeSingle();
      if (!staff) {
        return jsonResponse({ error: "That groomer isn't on your staff." }, 404);
      }
    }

    const { data: customerAuth } = await serviceRoleClient.auth.admin.getUserById(customerId);

    const { data: booking, error: insertError } = await serviceRoleClient
      .from('bookings')
      .insert({
        customer_id: customerId,
        customer_email: customerAuth?.user?.email ?? null,
        groomer_id: groomer.id,
        pet_id: petId,
        service_id: serviceId,
        staff_id: staffId,
        starts_at: startsAt,
        status: 'confirmed',
      })
      .select('id')
      .single();

    if (insertError || !booking) {
      return jsonResponse({ error: insertError?.message ?? 'Could not create booking' }, 500);
    }

    return jsonResponse({ success: true, bookingId: booking.id });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
