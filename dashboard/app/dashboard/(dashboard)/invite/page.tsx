'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

// Web has no native share sheet - use the Web Share API where the browser
// supports it, otherwise fall back to copying the text to the clipboard.
// Ported from the RN screen's Share.share({ message }) call.
async function shareOrCopy(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch {
      // User cancelled the share sheet - not an error.
      return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export default function InvitePage() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [justCopied, setJustCopied] = useState(false);

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase.from('groomers').select('invite_code').eq('id', groomerProfile!.id).single();
      if (cancelled) return;
      setCode(data?.invite_code ?? null);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  // A walk-in can just scan this instead of the groomer reading out an
  // 8-character code out loud. Generated client-side (the `qrcode` package
  // needs no backend) - encodes the marketing site with the code as a query
  // param, so scanning at minimum gets them to the download links with the
  // code preserved for whenever the site picks it up automatically.
  useEffect(() => {
    if (!code) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(`https://paw-booker.com/?invite=${code}`, {
      width: 220,
      margin: 1,
      color: { dark: '#2b332c', light: '#fbfaf4' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [code]);

  async function handleShare() {
    if (!code) return;
    const message = `Book your pet's grooming with ${groomerProfile?.name ?? 'me'} on PawBooker! Download the app, then enter my invite code ${code} in Profile so we stay connected. https://paw-booker.com`;
    const result = await shareOrCopy(message);
    if (result === 'failed') {
      window.alert('Could not share\n\nTry again in a moment.');
      return;
    }
    if (result === 'copied') {
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    }
  }

  return (
    <div className="settings-page width-form">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Invite your customers</h1>
      <p className="page-subtitle">
        Bring your existing clients onto PawBooker with your personal code. Customers who join with your code are
        yours — no acquisition fee, ever. (New customers who find you through the app&apos;s search have a one-time
        5% fee on their first booking.)
      </p>

      {loading ? (
        <span className="spinner" aria-hidden />
      ) : (
        <>
          <div className={`card ${styles.codeCard}`}>
            <p className={styles.codeLabel}>Your invite code</p>
            <p className={styles.code}>{code ?? '—'}</p>
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="" width={140} height={140} className={styles.qr} />
            )}
            {qrDataUrl && <p className={styles.qrCaption}>Show this to a walk-in to scan instead of reading the code aloud</p>}
          </div>

          <Button
            label={justCopied ? 'Copied!' : 'Share invite'}
            onClick={handleShare}
            disabled={!code}
            block
            style={{ marginTop: 20 }}
          />

          <p className={styles.howTo}>
            Tell customers to download PawBooker, then open Profile → &ldquo;Have an invite code?&rdquo; and enter{' '}
            <span className={styles.howToCode}>{code}</span>.
          </p>
        </>
      )}
    </div>
  );
}
