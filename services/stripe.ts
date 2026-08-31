import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';

// Derived from the publishable key itself (rather than a second env var to
// keep in sync) so switching Stripe to live mode automatically flips this too.
export const isStripeTestMode = !process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live');

// Lets beta-test builds through the "must have a saved card" gate before
// booking, since the shared backend only has a live Stripe secret key - a
// test publishable key wouldn't actually work end-to-end. Never set this in
// production; it's for handing testers a build that doesn't require a real card.
export const skipPaymentMethodRequirement = process.env.EXPO_PUBLIC_SKIP_PAYMENT_REQUIREMENT === 'true';

// supabase-js's default error for a non-2xx Edge Function response is the
// generic "Edge Function returned a non-2xx status code" - it doesn't surface
// the function's actual {error: "..."} response body. Unwrap it so callers
// (and the notify() dialogs they feed) show the real reason.
async function unwrapFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string') return new Error(body.error);
    } catch {
      // response wasn't JSON - fall through to the generic message below
    }
  }
  return error instanceof Error ? error : new Error('Something went wrong.');
}

export type SetupIntentResponse = {
  customerId: string;
  ephemeralKey: string;
  setupIntentClientSecret: string;
};

export async function createSetupIntent(): Promise<SetupIntentResponse> {
  const { data, error } = await supabase.functions.invoke<SetupIntentResponse>('stripe-setup-intent');
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-setup-intent');
  return data;
}

export type FinalizePaymentMethodResponse = {
  success: boolean;
  brand: string | null;
  last4: string | null;
  walletType: string | null;
  isDefault: boolean;
};

export async function finalizePaymentMethod(setupIntentId: string): Promise<FinalizePaymentMethodResponse> {
  const { data, error } = await supabase.functions.invoke<FinalizePaymentMethodResponse>(
    'finalize-payment-method',
    { body: { setupIntentId } }
  );
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from finalize-payment-method');
  return data;
}

export type RemovePaymentMethodResponse = {
  success: boolean;
};

export async function removePaymentMethod(paymentMethodId: string): Promise<RemovePaymentMethodResponse> {
  const { data, error } = await supabase.functions.invoke<RemovePaymentMethodResponse>('remove-payment-method', {
    body: { paymentMethodId },
  });
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from remove-payment-method');
  return data;
}

export type ChargeBookingResponse = {
  success: boolean;
  totalCents: number;
};

export async function chargeBooking(bookingId: string): Promise<ChargeBookingResponse> {
  const { data, error } = await supabase.functions.invoke<ChargeBookingResponse>('stripe-charge-booking', {
    body: { bookingId },
  });
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-charge-booking');
  return data;
}

export type ChargeGroupResponse = {
  success: boolean;
  totalCents: number;
  petCount: number;
};

// Charges every ready-to-bill pet in a multi-pet group as ONE payment to the
// customer's card, while still recording each pet's own itemized invoice. Line
// items must already be saved per booking before calling.
export async function chargeBookingGroup(groupId: string): Promise<ChargeGroupResponse> {
  const { data, error } = await supabase.functions.invoke<ChargeGroupResponse>('stripe-charge-group', {
    body: { groupId },
  });
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-charge-group');
  return data;
}

export type ChargeTipResponse = {
  success: boolean;
  tipAmountCents: number;
};

export async function chargeTip(bookingId: string, tipAmountCents: number): Promise<ChargeTipResponse> {
  const { data, error } = await supabase.functions.invoke<ChargeTipResponse>('stripe-charge-tip', {
    body: { bookingId, tipAmountCents },
  });
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-charge-tip');
  return data;
}

export type MarkPaidCashResponse = {
  success: boolean;
  totalCents: number;
};

export async function markBookingPaidCash(bookingId: string): Promise<MarkPaidCashResponse> {
  const { data, error } = await supabase.functions.invoke<MarkPaidCashResponse>('mark-booking-paid-cash', {
    body: { bookingId },
  });
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from mark-booking-paid-cash');
  return data;
}

export type ConnectOnboardingResponse = {
  url: string;
};

export async function createConnectOnboardingLink(): Promise<ConnectOnboardingResponse> {
  const { data, error } = await supabase.functions.invoke<ConnectOnboardingResponse>('stripe-connect-onboard');
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-connect-onboard');
  return data;
}

export type ConnectDashboardLinkResponse = {
  url: string;
};

export async function createConnectDashboardLink(): Promise<ConnectDashboardLinkResponse> {
  const { data, error } = await supabase.functions.invoke<ConnectDashboardLinkResponse>(
    'stripe-connect-dashboard-link'
  );
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-connect-dashboard-link');
  return data;
}

export type CancelSubscriptionResponse = {
  success: boolean;
  currentPeriodEnd: string | null;
};

export async function cancelSubscription(): Promise<CancelSubscriptionResponse> {
  const { data, error } = await supabase.functions.invoke<CancelSubscriptionResponse>(
    'stripe-cancel-subscription'
  );
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-cancel-subscription');
  return data;
}
