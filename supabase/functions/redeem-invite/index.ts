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

    const allowed = await checkRateLimit(serviceRoleClient, `redeem-invite:${user.id}`, 10, 3600);
    if (!allowed) {
      return jsonResponse({ error: 'Too many attempts. Please try again later.' }, 429);
    }

    const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
    const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (!normalized) {
      return jsonResponse({ error: 'Enter an invite code.' }, 400);
    }

    const { data: groomer } = await serviceRoleClient
      .from('groomers')
      .select('id, name, user_id')
      .eq('invite_code', normalized)
      .maybeSingle();

    if (!groomer) {
      return jsonResponse({ error: "That code isn't valid. Double-check it with your groomer." }, 404);
    }

    if (groomer.user_id === user.id) {
      return jsonResponse({ error: "That's your own salon's code." }, 400);
    }

    // Mark the pairing as referral so the acquisition fee is waived. If it's
    // already settled (a fee was charged or the window closed on a prior
    // booking), we leave it as-is - we can't un-charge a past fee.
    const { data: existing } = await serviceRoleClient
      .from('groomer_customers')
      .select('acquisition_settled')
      .eq('groomer_id', groomer.id)
      .eq('customer_id', user.id)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await serviceRoleClient
        .from('groomer_customers')
        .insert({ groomer_id: groomer.id, customer_id: user.id, origin: 'referral' });
      // A concurrent booking may have just created the row; that's fine.
      if (insertError && !insertError.message.toLowerCase().includes('duplicate')) {
        return jsonResponse({ error: insertError.message }, 500);
      }
    } else if (!existing.acquisition_settled) {
      const { error: updateError } = await serviceRoleClient
        .from('groomer_customers')
        .update({ origin: 'referral' })
        .eq('groomer_id', groomer.id)
        .eq('customer_id', user.id);
      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500);
      }
    }

    return jsonResponse({ success: true, groomerName: groomer.name });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
