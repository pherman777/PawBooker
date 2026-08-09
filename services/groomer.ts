import { supabase } from '@/services/supabase';

export type CreateGroomerInput = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  email: string;
};

// Creates the caller's salon via the create-groomer edge function (service-role
// insert, one salon per account) and returns the new groomer id. Callers should
// refreshGroomerProfile() afterward so the route guard moves them into (salon).
export async function createGroomer(input: CreateGroomerInput): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-groomer', { body: input });

  if (error) {
    // Edge function errors arrive as a generic FunctionsHttpError; the body holds
    // the real message we returned.
    let message = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }

  if (!data?.id) {
    throw new Error('Could not create your salon. Please try again.');
  }

  return data.id as string;
}

// Redeems a groomer's invite code so this customer is tagged as their referral
// (no acquisition fee). Returns the groomer's name on success.
export async function redeemInvite(code: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('redeem-invite', { body: { code } });

  if (error) {
    let message = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }

  return (data?.groomerName as string) ?? 'your groomer';
}
