'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { AddressSearchInput, type SelectedLocation } from '@/components/AddressSearchInput';
import { AuthBrandMark } from '@/components/AuthBrandMark';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { createGroomer, savePendingGroomer, type CreateGroomerInput } from '@/lib/groomer';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Ported from app/groomer-signup.tsx - same two paths (create account + salon
// together, or just the salon if already signed in), same
// pending-until-email-confirmed handoff via lib/groomer.ts + lib/auth.tsx's
// resolveGroomerProfile. Once the salon exists, this is the web entry point
// that gets a groomer straight to the setup checklist, same as the app.
export default function SignUpPage() {
  const router = useRouter();
  const { session, groomerProfile, loading, refreshGroomerProfile } = useAuth();
  const loggedIn = Boolean(session);

  const [name, setName] = useState('');
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  // Bounces someone who lands here with a salon already set up - but not the
  // moment this page's own submit just created one (that redirects itself to
  // /welcome). Without the ref, refreshGroomerProfile()'s state update races
  // this effect and it wins, overriding the /welcome redirect back to /.
  const justCreatedRef = useRef(false);
  useEffect(() => {
    if (!loading && groomerProfile && !justCreatedRef.current) router.replace('/dashboard');
  }, [loading, groomerProfile, router]);

  useEffect(() => {
    if (session?.user.email) setEmail(session.user.email);
  }, [session]);

  function pendingFrom(): CreateGroomerInput {
    return {
      name: name.trim(),
      address: location!.label,
      latitude: location!.latitude,
      longitude: location!.longitude,
      zipCode: location!.zipCode,
      city: location!.city,
      state: location!.state,
      phone: phone.trim(),
      email: email.trim(),
    };
  }

  async function finishAndGoToSalon(details: CreateGroomerInput) {
    await createGroomer(details);
    justCreatedRef.current = true;
    await refreshGroomerProfile();
    router.replace('/dashboard/welcome');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter your business name.');
      return;
    }
    if (!location) {
      setError('Search for and select your business address.');
      return;
    }
    if (email.trim() && !isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!loggedIn && (!email.trim() || password.length < 6)) {
      setError('Enter an email and a password of at least 6 characters to create your account.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (loggedIn) {
        await finishAndGoToSalon(pendingFrom());
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password });
      if (signUpError) {
        setError(signUpError.message);
        setSubmitting(false);
        return;
      }

      if (data.session) {
        await finishAndGoToSalon(pendingFrom());
      } else {
        savePendingGroomer(pendingFrom());
        setConfirmSent(true);
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not list your business.');
      setSubmitting(false);
    }
  }

  if (loading || (!loading && groomerProfile)) {
    return (
      <div className="page-loading">
        <span className="spinner" aria-hidden />
      </div>
    );
  }

  if (confirmSent) {
    return (
      <main className="sign-in-page">
        <div className="sign-in-card">
          <AuthBrandMark />
          <h1 className="sign-in-title">Confirm your email</h1>
          <div className={styles.confirmBox}>
            <p className={styles.subtitle} style={{ marginTop: 0 }}>
              We sent a confirmation link to {email.trim()}. Confirm it, then sign in — we&apos;ll finish setting up{' '}
              {name.trim() || 'your salon'} automatically.
            </p>
            <Button label="Go to sign in" onClick={() => router.replace('/dashboard/sign-in')} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="sign-in-page">
      <div className="sign-in-card sign-in-card-wide">
        <AuthBrandMark />
        <h1 className="sign-in-title">List your grooming business</h1>
        <p className={styles.subtitle}>
          Set up your salon in one step. You&apos;ll add services, hours, and payouts next — your salon stays
          private until it&apos;s ready.
        </p>

        <form onSubmit={handleSubmit} className="sign-in-form">
        <div>
          <label className="field-label" htmlFor="name">
            Business name
          </label>
          <input
            id="name"
            className="field-input"
            placeholder="e.g. Happy Tails Grooming"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="field-label">Business address</label>
          {location ? (
            <button type="button" className="selected-address-chip" onClick={() => setLocation(null)}>
              <span>{location.label}</span>
              <span className="selected-address-change">Change</span>
            </button>
          ) : (
            <AddressSearchInput onSelect={setLocation} />
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            className="field-input"
            placeholder="Contact number for customers"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {loggedIn ? (
          <div>
            <label className="field-label" htmlFor="email">
              Contact email
            </label>
            <input
              id="email"
              className="field-input"
              placeholder="Where bookings should reach you"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        ) : (
          <>
            <p className={styles.sectionHeader}>Create your account</p>
            <div>
              <label className="field-label" htmlFor="signup-email">
                Email
              </label>
              <input
                id="signup-email"
                className="field-input"
                placeholder="you@business.com"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="signup-password">
                Password
              </label>
              <input
                id="signup-password"
                className="field-input"
                placeholder="At least 6 characters"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="button" className={styles.inlineLink} onClick={() => router.push('/dashboard/sign-in')}>
              Already have an account? Sign in first
            </button>
          </>
        )}

        {error && <p className="sign-in-error">{error}</p>}

        <Button label={loggedIn ? 'Create my salon' : 'Create account & salon'} type="submit" loading={submitting} />
        </form>
      </div>
    </main>
  );
}
