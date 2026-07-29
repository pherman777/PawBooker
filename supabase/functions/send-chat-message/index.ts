import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { pushTokensForUser, sendExpoPushToTokens } from '../_shared/push.ts';

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
    const { threadId, body } = (await req.json()) as { threadId: string; body: string };
    const authHeader = req.headers.get('Authorization')!;

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: thread, error: threadError } = await supabase
      .from('chat_threads')
      .select('id, customer_id, groomers(name)')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      return jsonResponse({ error: threadError?.message ?? 'Thread not found' }, 404);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('chat_messages').insert({
      thread_id: threadId,
      sender_type: 'groomer',
      sender_id: user?.id,
      body,
    });

    if (insertError) {
      return jsonResponse({ error: insertError.message }, 500);
    }

    const groomer = thread.groomers as unknown as { name: string } | null;
    const tokens = await pushTokensForUser(serviceRoleClient, thread.customer_id);
    await sendExpoPushToTokens(tokens, groomer?.name ?? 'New message', body, { threadId });

    return jsonResponse({ sent: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
