import { supabase } from '@/services/supabase';

export type SetupIntentResponse = {
  customerId: string;
  ephemeralKey: string;
  setupIntentClientSecret: string;
};

export async function createSetupIntent(): Promise<SetupIntentResponse> {
  const { data, error } = await supabase.functions.invoke<SetupIntentResponse>('stripe-setup-intent');
  if (error) throw error;
  if (!data) throw new Error('No response from stripe-setup-intent');
  return data;
}

export type FinalizePaymentMethodResponse = {
  success: boolean;
  brand: string | null;
  last4: string | null;
};

export async function finalizePaymentMethod(setupIntentId: string): Promise<FinalizePaymentMethodResponse> {
  const { data, error } = await supabase.functions.invoke<FinalizePaymentMethodResponse>(
    'finalize-payment-method',
    { body: { setupIntentId } }
  );
  if (error) throw error;
  if (!data) throw new Error('No response from finalize-payment-method');
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
  if (error) throw error;
  if (!data) throw new Error('No response from stripe-charge-booking');
  return data;
}
