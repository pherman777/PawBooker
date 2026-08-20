import { FunctionsHttpError } from '@supabase/supabase-js';

import { customerSupabase } from '@/lib/customerSupabase';

// Customer-facing port of services/stripe.ts. Deliberately a separate file
// from lib/stripe.ts (the groomer dashboard's, using the groomer supabase
// client) rather than added to it - no name collisions today, but keeping
// the two Supabase clients' callers in separate files avoids ever mixing
// them up in one function body.
export const isStripeTestMode = !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live');

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
  const { data, error } = await customerSupabase.functions.invoke<SetupIntentResponse>('stripe-setup-intent');
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
  const { data, error } = await customerSupabase.functions.invoke<FinalizePaymentMethodResponse>(
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
  const { data, error } = await customerSupabase.functions.invoke<RemovePaymentMethodResponse>('remove-payment-method', {
    body: { paymentMethodId },
  });
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from remove-payment-method');
  return data;
}

export type ChargeTipResponse = {
  success: boolean;
  tipAmountCents: number;
};

export async function chargeTip(bookingId: string, tipAmountCents: number): Promise<ChargeTipResponse> {
  const { data, error } = await customerSupabase.functions.invoke<ChargeTipResponse>('stripe-charge-tip', {
    body: { bookingId, tipAmountCents },
  });
  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('No response from stripe-charge-tip');
  return data;
}
