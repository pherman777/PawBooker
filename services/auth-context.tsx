import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { supabase } from '@/services/supabase';

export type GroomerPlan = 'free' | 'pro';

export type GroomerProfile = {
  id: string;
  name: string;
  plan: GroomerPlan;
  payoutsEnabled: boolean;
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

async function fetchGroomerProfile(session: Session | null): Promise<GroomerProfile | null> {
  if (!session) return null;
  const { data } = await supabase
    .from('groomers')
    .select('id, name, plan, stripe_connect_payouts_enabled')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    plan: data.plan,
    payoutsEnabled: data.stripe_connect_payouts_enabled,
  };
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
      const profile = await fetchGroomerProfile(data.session);
      if (!cancelled) {
        setGroomerProfile(profile);
        setLoading(false);
      }
    }

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      fetchGroomerProfile(newSession).then((profile) => {
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
