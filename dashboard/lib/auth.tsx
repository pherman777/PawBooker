'use client';

import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { consumePendingGroomer, createGroomer, savePendingGroomer } from '@/lib/groomer';
import { supabase } from '@/lib/supabase';

export type GroomerPlan = 'free' | 'pro';

export type GroomerProfile = {
  id: string;
  name: string;
  plan: GroomerPlan;
  payoutsEnabled: boolean;
  avatarUrl: string | null;
};

type AuthContextValue = {
  session: Session | null;
  groomerProfile: GroomerProfile | null;
  loading: boolean;
  refreshGroomerProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  groomerProfile: null,
  loading: true,
  refreshGroomerProfile: async () => {},
});

// Ported from services/auth-context.tsx's fetchGroomerProfile.
async function fetchGroomerProfile(session: Session | null): Promise<GroomerProfile | null> {
  if (!session) return null;
  const { data } = await supabase
    .from('groomers')
    .select('id, name, plan, stripe_connect_payouts_enabled, avatar_url')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    plan: data.plan,
    payoutsEnabled: data.stripe_connect_payouts_enabled,
    avatarUrl: data.avatar_url,
  };
}

// Like fetchGroomerProfile, but if the user has no salon yet and there's a
// pending sign-up saved (they created their account, then email confirmation
// interrupted the flow - see app/sign-up/page.tsx), finish creating the salon
// now that they're signed in. Ported from services/auth-context.tsx's version
// of the same fallback, since the web sign-up flow has the identical gap.
async function resolveGroomerProfile(session: Session | null): Promise<GroomerProfile | null> {
  const existing = await fetchGroomerProfile(session);
  if (existing || !session) return existing;

  const pending = consumePendingGroomer();
  if (!pending) return null;

  try {
    await createGroomer(pending);
    return await fetchGroomerProfile(session);
  } catch {
    savePendingGroomer(pending);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [groomerProfile, setGroomerProfile] = useState<GroomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refreshGroomerProfile = useCallback(async () => {
    const profile = await fetchGroomerProfile(sessionRef.current);
    setGroomerProfile(profile);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      const profile = await resolveGroomerProfile(data.session);
      if (!cancelled) {
        setGroomerProfile(profile);
        setLoading(false);
      }
    }

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      resolveGroomerProfile(newSession).then((profile) => {
        if (!cancelled) setGroomerProfile(profile);
      });
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, groomerProfile, loading, refreshGroomerProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
