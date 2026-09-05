// The `groomers.stripe_connect_charges_enabled` column is only updated
// asynchronously by the `account.updated` webhook, so it can lag behind
// Stripe's real state. Gating a charge's destination routing on that cached
// column risks a race: if the account flips to charges_enabled shortly after
// onboarding but before the webhook lands, a charge fired in that window
// silently stays on the platform balance instead of routing to the groomer,
// with no error and no visible sign anything went wrong (caught in
// production 2026-09-05 - see memory `stripe_connect_charges_enabled_race`).
// Checking Stripe directly at charge time closes that window.
export async function getLiveChargesEnabled(
  stripeSecretKey: string,
  stripeConnectAccountId: string
): Promise<boolean> {
  const response = await fetch(`https://api.stripe.com/v1/accounts/${stripeConnectAccountId}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
  });
  if (!response.ok) return false;
  const account = await response.json();
  return Boolean(account.charges_enabled);
}
