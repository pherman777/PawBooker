import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/services/supabase';

export type CreateGroomerInput = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  email: string;
};

// When someone starts "List your business" while logged out, we save their
// business details here before creating their account. If the account comes
// back with a session immediately we finish right away; if email confirmation
// is required, this lets us finish automatically the moment they sign in.
const PENDING_KEY = 'pendingGroomerSignup';

export async function savePendingGroomer(input: CreateGroomerInput): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(input));
}

export async function clearPendingGroomer(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
}

// Reads and removes any pending business details. Returns null if there are none.
export async function consumePendingGroomer(): Promise<CreateGroomerInput | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(PENDING_KEY);
  try {
    return JSON.parse(raw) as CreateGroomerInput;
  } catch {
    return null;
  }
}

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
