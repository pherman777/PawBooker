import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { pushTokensForUser, sendExpoPushToTokens } from '../_shared/push.ts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

    const { data: supplies, error: suppliesError } = await supabase
      .from('groomer_supplies')
      .select('groomer_id, quantity_on_hand, reorder_threshold, groomers(user_id)');

    if (suppliesError) {
      return jsonResponse({ error: suppliesError.message }, 500);
    }

    // Column-to-column comparison (quantity vs. threshold) isn't expressible
    // as a simple PostgREST filter, so pull everything and count in code -
    // same approach the dashboard banner uses client-side.
    const lowCountByGroomer = new Map<string, number>();
    const userIdByGroomer = new Map<string, string | null>();
    for (const row of supplies ?? []) {
      const userId = (row.groomers as unknown as { user_id: string | null } | null)?.user_id ?? null;
      userIdByGroomer.set(row.groomer_id, userId);
      if (row.quantity_on_hand <= row.reorder_threshold) {
        lowCountByGroomer.set(row.groomer_id, (lowCountByGroomer.get(row.groomer_id) ?? 0) + 1);
      }
    }

    const summary: Record<string, number> = {};

    for (const [groomerId, count] of lowCountByGroomer) {
      summary[groomerId] = count;

      const userId = userIdByGroomer.get(groomerId);
      if (!userId) continue;

      const tokens = await pushTokensForUser(supabase, userId);
      await sendExpoPushToTokens(
        tokens,
        'Supplies running low',
        `${count} suppl${count === 1 ? 'y is' : 'ies are'} at or below your reorder point - check Supplies to restock.`
      );
    }

    return jsonResponse({ summary });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
