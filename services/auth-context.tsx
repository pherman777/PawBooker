import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/services/supabase';

export type GroomerProfile = {
  id: string;
  name: string;
};

type AuthContextValue = {
  session: Session | null;
  groomerProfile: GroomerProfile | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  groomerProfile: null,
  loading: true,
});

async function fetchGroomerProfile(session: Session | null): Promise<GroomerProfile | null> {
  if (!session) return null;
  const { data } = await supabase
    .from('groomers')
    .select('id, name')
    .eq('user_id', session.user.id)
    .maybeSingle();
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [groomerProfile, setGroomerProfile] = useState<GroomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
    <AuthContext.Provider value={{ session, groomerProfile, loading }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
