'use client';

import { createContext, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

import styles from '@/app/marketing.module.css';

type ModalState = { open: boolean } | null;

type NotifyContextValue = {
  inviteCode: string | null;
  openModal: (opts?: { groomer?: boolean }) => void;
};

const NotifyContext = createContext<NotifyContextValue>({ inviteCode: null, openModal: () => {} });

// Lets any button on the page (hero CTA, notify-band CTA, nav, etc.) open the
// shared modal without prop-drilling - mirrors the original inline script's
// `[data-open-modal]` delegation, just as React context instead of a DOM
// query.
export function useNotifyModal() {
  return useContext(NotifyContext);
}

type Props = {
  children: React.ReactNode;
};

// Ported from public/index.html's inline <script>: the ?invite=CODE banner +
// localStorage persistence, and the "get notified" modal + email capture.
// The only functional change is where the email capture posts to - the
// original hardcoded a Supabase URL/anon key in a plain fetch(); this uses
// the app's real configured client (same anon key, no key duplicated in
// source) via a normal insert().
export function NotifyModalProvider({ children }: Props) {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [email, setEmail] = useState('');
  const [isGroomer, setIsGroomer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('invite');
    if (fromUrl) {
      setInviteCode(fromUrl);
      try {
        localStorage.setItem('pawbooker_invite_code', fromUrl);
      } catch {
        // localStorage can be unavailable (private browsing) - the banner is
        // a nice-to-have, not worth failing the page load over.
      }
      return;
    }
    try {
      setInviteCode(localStorage.getItem('pawbooker_invite_code'));
    } catch {
      // same as above
    }
  }, []);

  // ?notify=1 - lets a link from elsewhere in the app (e.g. the sign-in
  // page's "sign up" link, for a visitor who isn't a groomer, or middleware
  // redirecting a pre-launch host away from real sign-in/sign-up) land here
  // with the waitlist modal already open, since real account creation isn't
  // live on this host yet - this *is* the signup flow for now. `groomer=1`
  // pre-checks "I'm a groomer" for a groomer who was redirected off of
  // /dashboard/sign-up specifically.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('notify') === '1') {
      setEmail('');
      setIsGroomer(params.get('groomer') === '1');
      setError(false);
      setSuccess(false);
      setModal({ open: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openModal(opts?: { groomer?: boolean }) {
    setEmail('');
    setIsGroomer(Boolean(opts?.groomer));
    setError(false);
    setSuccess(false);
    setModal({ open: true });
  }

  function closeModal() {
    setModal(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !modal) return;
    setSubmitting(true);
    setError(false);

    const { error: insertError } = await supabase
      .from('marketing_leads')
      .insert({ email: email.trim(), source: isGroomer ? 'homepage-groomer' : 'homepage' });

    setSubmitting(false);
    if (insertError) {
      setError(true);
      return;
    }
    setSuccess(true);
  }

  const showBanner = Boolean(inviteCode) && !bannerDismissed;

  return (
    <NotifyContext.Provider value={{ inviteCode, openModal }}>
      {showBanner && (
        <div className={styles.inviteBanner}>
          <div className={`${styles.wrap} ${styles.inviteBannerInner}`}>
            <p>
              <strong>Your groomer invited you to PawBooker.</strong> We&rsquo;ll email you the moment we launch &mdash; your
              invite code is <strong>{inviteCode}</strong>. Save it, you&rsquo;ll enter it in the app to link up with them.
            </p>
            <button
              type="button"
              className={styles.inviteBannerClose}
              aria-label="Dismiss"
              onClick={() => setBannerDismissed(true)}>
              &times;
            </button>
          </div>
        </div>
      )}

      {children}

      {modal?.open && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            {success ? (
              <>
                <h3>You&rsquo;re on the list!</h3>
                <p>We&rsquo;ll email you as soon as PawBooker is ready for you.</p>
                <div className={styles.modalActions}>
                  <button type="button" className={`btn ${styles.btnSage}`} onClick={closeModal}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>{isGroomer ? 'Get early access' : 'Get notified at launch'}</h3>
                <p>
                  {isGroomer
                    ? "Tell us where to reach you and we'll help you get set up on PawBooker as we bring on new groomers."
                    : "PawBooker isn't available to download just yet — leave your email and we'll let you know the moment it is."}
                  {inviteCode && !isGroomer ? ` Your invite code is ${inviteCode} — save it for when you sign in.` : ''}
                </p>
                <form onSubmit={handleSubmit}>
                  <label htmlFor="notify-email">Email</label>
                  <input
                    type="email"
                    id="notify-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                  <label className={styles.checkboxRow} htmlFor="notify-groomer">
                    <input
                      type="checkbox"
                      id="notify-groomer"
                      checked={isGroomer}
                      onChange={(e) => setIsGroomer(e.target.checked)}
                    />
                    <span>I&rsquo;m a groomer</span>
                  </label>
                  {error && <p className={styles.modalError}>Something went wrong &mdash; please try again.</p>}
                  <div className={styles.modalActions}>
                    <button type="button" className="btn btn-ghost" onClick={closeModal}>
                      Cancel
                    </button>
                    <button type="submit" className={`btn ${styles.btnSage}`} disabled={submitting}>
                      {submitting ? 'Sending…' : 'Notify me'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </NotifyContext.Provider>
  );
}
