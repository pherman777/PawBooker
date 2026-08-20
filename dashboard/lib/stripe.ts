import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

// Ported from services/stripe.ts - Supabase Edge Functions wrap a non-2xx
// response in a generic FunctionsHttpError rather than surfacing the
// function's actual {error: "..."} response body. Unwrap it so callers show
// the real reason.
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

export async function createConnectOnboardingLink(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('stripe-connect-onboard');
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-connect-onboard');
  return data;
}

export async function createConnectDashboardLink(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('stripe-connect-dashboard-link');
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-connect-dashboard-link');
  return data;
}

export async function cancelSubscription(): Promise<{ success: boolean; currentPeriodEnd: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ success: boolean; currentPeriodEnd: string | null }>(
    'stripe-cancel-subscription'
  );
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-cancel-subscription');
  return data;
}

// Charges the customer's already-saved payment method server-side - no card
// entry UI needed here, same as the RN app's complete/[bookingId].tsx.
export async function chargeBooking(bookingId: string): Promise<{ success: boolean }> {
  const { data, error } = await supabase.functions.invoke<{ success: boolean }>('stripe-charge-booking', {
    body: { bookingId },
  });
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-charge-booking');
  return data;
}

// Charges a whole multi-pet visit as one payment.
export async function chargeBookingGroup(groupId: string): Promise<{ success: boolean }> {
  const { data, error } = await supabase.functions.invoke<{ success: boolean }>('stripe-charge-group', {
    body: { groupId },
  });
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-charge-group');
  return data;
}

export async function markBookingPaidCash(bookingId: string): Promise<{ success: boolean }> {
  const { data, error } = await supabase.functions.invoke<{ success: boolean }>('mark-booking-paid-cash', {
    body: { bookingId },
  });
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from mark-booking-paid-cash');
  return data;
}
