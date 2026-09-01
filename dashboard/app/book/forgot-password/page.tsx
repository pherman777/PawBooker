'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AuthBrandMark } from '@/components/AuthBrandMark';
import { Button } from '@/components/Button';
import { customerSupabase } from '@/lib/customerSupabase';

// Port of app/(auth)/forgot-password.tsx, styled like
// app/dashboard/sign-in/page.tsx.
export default function CustomerForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);

    const { error: resetError } = await customerSupabase.auth.resetPasswordForEmail(email.trim());

    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setStep('reset');
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError('Enter the code we emailed you.');
      return;
    }
    if (password.length < 6) {
      setError('Use a password of at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: verifyError } = await customerSupabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'recovery',
    });

    if (verifyError) {
      setSubmitting(false);
      setError(verifyError.message);
      return;
    }

    const { error: updateError } = await customerSupabase.auth.updateUser({ password });

    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      return;
    }

    // Verifying the recovery code signs the user in - sign back out and make
    // them log in with the new password, same reasoning as native.
    await customerSupabase.auth.signOut();
    setSubmitting(false);
    router.replace('/book/sign-in');
  }

  return (
    <main className="sign-in-page">
      <div className="sign-in-card">
        <AuthBrandMark />
        {step === 'email' ? (
          <>
            <h1 className="sign-in-title">Reset your password</h1>
            <p className="sign-in-subtitle">Enter your email and we&apos;ll send you a code.</p>
            <form onSubmit={handleSendCode} className="sign-in-form">
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
              {error && <p className="sign-in-error">{error}</p>}
              <Button label="Send code" type="submit" loading={submitting} disabled={!email.trim()} />
            </form>
          </>
        ) : (
          <>
            <h1 className="sign-in-title">Enter your code</h1>
            <p className="sign-in-subtitle">Check your email for a code, then choose a new password for {email.trim()}.</p>
            <form onSubmit={handleResetPassword} className="sign-in-form">
              <div>
                <label className="field-label" htmlFor="code">
                  Code from email
                </label>
                <input id="code" className="field-input" type="text" value={code} onChange={(e) => setCode(e.target.value)} required />
              </div>
              <div>
                <label className="field-label" htmlFor="password">
                  New password
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
              <div>
                <label className="field-label" htmlFor="confirmPassword">
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  className="field-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && <p className="sign-in-error">{error}</p>}
              <Button label="Reset password" type="submit" loading={submitting} />
            </form>
          </>
        )}
        <button type="button" className="sign-in-footer-link sign-in-footer-link-center" onClick={() => router.push('/book/sign-in')}>
          Cancel
        </button>
      </div>
    </main>
  );
}
