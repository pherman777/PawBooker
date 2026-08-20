'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AuthBrandMark } from '@/components/AuthBrandMark';
import { Button } from '@/components/Button';
import { customerSupabase } from '@/lib/customerSupabase';

// Port of app/(auth)/sign-up.tsx, styled like app/dashboard/sign-in/page.tsx.
export default function CustomerSignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { data, error: signUpError } = await customerSupabase.auth.signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message);
    } else if (!data.session) {
      setConfirmationSent(true);
    } else {
      if (name.trim()) {
        await customerSupabase.from('profiles').upsert({ user_id: data.session.user.id, name: name.trim() });
      }
      router.replace('/book');
    }
    setSubmitting(false);
  }

  if (confirmationSent) {
    return (
      <main className="sign-in-page">
        <div className="sign-in-card">
          <AuthBrandMark />
          <h1 className="sign-in-title">Check your email</h1>
          <p className="sign-in-subtitle">We sent a confirmation link to {email}. Confirm it, then sign in.</p>
          <button type="button" className="sign-in-footer-link sign-in-footer-link-center" onClick={() => router.push('/book/sign-in')}>
            Back to sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="sign-in-page">
      <div className="sign-in-card">
        <AuthBrandMark />
        <h1 className="sign-in-title">Create an account</h1>
        <p className="sign-in-subtitle">Book grooming appointments for your pets.</p>
        <form onSubmit={handleSignUp} className="sign-in-form">
          <div>
            <label className="field-label" htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              className="field-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
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
              autoComplete="new-password"
              required
            />
          </div>
          {error && <p className="sign-in-error">{error}</p>}
          <Button label="Sign up" type="submit" loading={submitting} block />
        </form>
        <button type="button" className="sign-in-footer-link sign-in-footer-link-center" onClick={() => router.push('/book/sign-in')}>
          Already have an account? Sign in
        </button>
      </div>
    </main>
  );
}
