'use client';

import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { customerSupabase } from '@/lib/customerSupabase';

type CustomerAuthContextValue = {
  session: Session | null;
  loading: boolean;
};

const CustomerAuthContext = createContext<CustomerAuthContextValue>({
  session: null,
  loading: true,
});

// Parallel to lib/auth.tsx's AuthProvider, but for customers - deliberately
// not shared with the groomer context. Unlike groomers, customers have no
// global "profile" concept in the native app either; screens fetch
// profiles/pets directly as needed, so this only tracks session/loading.
export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    customerSupabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = customerSupabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return <CustomerAuthContext.Provider value={{ session, loading }}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  return useContext(CustomerAuthContext);
}
