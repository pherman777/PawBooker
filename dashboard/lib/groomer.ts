import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

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

export type CreateGroomerInput = {
  name: string;
  address: string;
  phone: string;
  email: string;
  latitude?: number | null;
  longitude?: number | null;
  zipCode?: string | null;
  city?: string | null;
  state?: string | null;
};

export async function createGroomer(input: CreateGroomerInput): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ id: string }>('create-groomer', {
    body: {
      ...input,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    },
  });
  if (error) throw await unwrapFunctionError(error);
  if (!data?.id) throw new Error('Could not create your salon. Please try again.');
  return data.id;
}

// Ported from services/groomer.ts's AsyncStorage-backed pending-signup save,
// using localStorage instead. Covers the same gap: sign-up submitted while
// logged out, Supabase requires email confirmation before a session comes
// back, so the salon can't be created yet. lib/auth.tsx's resolveGroomerProfile
// finishes creating it automatically the moment they confirm and sign in.
const PENDING_KEY = 'pawbooker_pending_groomer';

export function savePendingGroomer(input: CreateGroomerInput): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(input));
  } catch {
    // localStorage unavailable (private browsing, etc.) - the confirm-email
    // screen still tells them to sign in manually, so this is just lost convenience.
  }
}

export function consumePendingGroomer(): CreateGroomerInput | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw) as CreateGroomerInput;
  } catch {
    return null;
  }
}
