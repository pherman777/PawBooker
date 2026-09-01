'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AuthBrandMark } from '@/components/AuthBrandMark';
import { Button } from '@/components/Button';
import { useCustomerAuth } from '@/lib/customerAuth';
import { customerSupabase } from '@/lib/customerSupabase';

// Port of app/(auth)/sign-in.tsx, styled like app/dashboard/sign-in/page.tsx.
export default function CustomerSignInPage() {
  const router = useRouter();
  const { session, loading } = useCustomerAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace('/book');
  }, [loading, session, router]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await customerSupabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace('/book');
  }

  return (
    <main className="sign-in-page">
      <div className="sign-in-card">
        <AuthBrandMark />
        <h1 className="sign-in-title">Welcome back</h1>
        <p className="sign-in-subtitle">Sign in to book grooming appointments.</p>
        <form onSubmit={handleSignIn} className="sign-in-form">
          <div>
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="sign-in-error">{error}</p>}
          <Button label="Sign in" type="submit" loading={submitting} />
        </form>
        <button type="button" className="sign-in-footer-link sign-in-footer-link-center" onClick={() => router.push('/book/forgot-password')}>
          Forgot password?
        </button>
        <hr className="sign-in-divider" />
        <button type="button" className="sign-in-footer-link sign-in-footer-link-center" onClick={() => router.push('/book/sign-up')}>
          Don&apos;t have an account? Sign up
        </button>
      </div>
    </main>
  );
}
