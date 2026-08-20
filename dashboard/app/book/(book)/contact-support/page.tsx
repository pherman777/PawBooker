'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { contactSupport } from '@/lib/support';

// Port of app/contact-support.tsx.
export default function ContactSupportPage() {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = subject.trim().length > 0 && message.trim().length > 0;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await contactSupport(subject.trim(), message.trim());
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="settings-page width-form">
      <button type="button" className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Contact support</h1>
      <p className="page-subtitle">Send us a message and we&apos;ll reply by email.</p>

      <form onSubmit={handleSend}>
        <div style={{ marginBottom: 14 }}>
          <label className="field-label" htmlFor="subject">
            Subject
          </label>
          <input id="subject" className="field-input" placeholder="What's this about?" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="field-label" htmlFor="message">
            Message
          </label>
          <textarea
            id="message"
            className="field-input"
            placeholder="Tell us what's going on"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {error && <p className="sign-in-error">{error}</p>}

        <Button label="Send" type="submit" disabled={!canSend} loading={sending} block />
      </form>
    </div>
  );
}
