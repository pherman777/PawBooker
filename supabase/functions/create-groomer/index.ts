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

type Payload = {
  name?: unknown;
  address?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  phone?: unknown;
  email?: unknown;
};

function cleanString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Caller-scoped client: identifies who is signed in from their JWT.
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

    const allowed = await checkRateLimit(serviceRoleClient, `create-groomer:${user.id}`, 5, 3600);
    if (!allowed) {
      return jsonResponse({ error: 'Too many attempts. Please try again later.' }, 429);
    }

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const name = cleanString(payload.name, 120);
    const address = cleanString(payload.address, 300);
    const phone = cleanString(payload.phone, 40);
    const email = cleanString(payload.email, 200);
    const latitude = typeof payload.latitude === 'number' ? payload.latitude : null;
    const longitude = typeof payload.longitude === 'number' ? payload.longitude : null;

    if (!name || !address) {
      return jsonResponse({ error: 'Business name and address are required.' }, 400);
    }

    // One salon per account. The unique index on groomers.user_id would reject a
    // duplicate anyway, but checking first lets us return a friendly message and,
    // if they already have a salon, hand back its id so the client can proceed.
    const { data: existing } = await serviceRoleClient
      .from('groomers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ id: existing.id, alreadyExisted: true });
    }

    const { data: inserted, error: insertError } = await serviceRoleClient
      .from('groomers')
      .insert({
        name,
        address,
        latitude,
        longitude,
        phone: phone || null,
        email: email || user.email || null,
        user_id: user.id,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      return jsonResponse({ error: insertError?.message ?? 'Could not create salon.' }, 500);
    }

    return jsonResponse({ id: inserted.id });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
