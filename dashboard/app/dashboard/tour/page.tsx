'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AuthBrandMark } from '@/components/AuthBrandMark';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// Public demo credentials, intended to be shared - see seed data for
// "Sudsy Tails Grooming". Not a real account, no real payment/business data.
const TOUR_EMAIL = 'demo-groomer@paw-booker.com';
const TOUR_PASSWORD = 'PawBookerDemo2026!';

export default function GroomerTourPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const isDemoSession = session?.user.email === TOUR_EMAIL;
  const isOtherSession = !!session && !isDemoSession;

  useEffect(() => {
    if (loading || session || signingIn || error) return;
    setSigningIn(true);
    supabase.auth.signInWithPassword({ email: TOUR_EMAIL, password: TOUR_PASSWORD }).then(({ error: signInError }) => {
      setSigningIn(false);
      if (signInError) setError('Could not start the tour right now. Please try again in a moment.');
    });
  }, [loading, session, signingIn, error]);

  useEffect(() => {
    if (isDemoSession) router.replace('/dashboard');
  }, [isDemoSession, router]);

  if (loading) {
    return (
      <main className="sign-in-page">
        <div className="sign-in-card">
          <AuthBrandMark />
          <span className="spinner" aria-hidden />
        </div>
      </main>
    );
  }

  if (isOtherSession) {
    return (
      <main className="sign-in-page">
        <div className="sign-in-card">
          <AuthBrandMark />
          <h1 className="sign-in-title">You&apos;re already signed in</h1>
          <p className="sign-in-subtitle">Sign out first to look around the demo salon.</p>
          <Button label="Sign out and start tour" onClick={() => supabase.auth.signOut()} block />
        </div>
      </main>
    );
  }

  return (
    <main className="sign-in-page">
      <div className="sign-in-card">
        <AuthBrandMark />
        <h1 className="sign-in-title">Loading your tour&hellip;</h1>
        <p className="sign-in-subtitle">Signing you into a demo salon so you can look around.</p>
        {error ? (
          <>
            <p className="sign-in-error">{error}</p>
            <Button label="Try again" onClick={() => setError(null)} block />
          </>
        ) : (
          <span className="spinner" aria-hidden />
        )}
      </div>
    </main>
  );
}
