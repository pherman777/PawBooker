'use client';

import { MessageCircle, ChevronRight, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useCustomerAuth } from '@/lib/customerAuth';
import { getOrCreateAppSupportThread } from '@/lib/chat';

import styles from './page.module.css';

// Port of app/help.tsx.
export default function HelpPage() {
  const router = useRouter();
  const { session } = useCustomerAuth();
  const [openingChat, setOpeningChat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChatWithSupport() {
    if (!session) return;
    setOpeningChat(true);
    setError(null);
    try {
      const threadId = await getOrCreateAppSupportThread(session.user.id);
      router.push(`/book/messages/${threadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setOpeningChat(false);
    }
  }

  return (
    <div className="settings-page width-form">
      <button type="button" className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Help</h1>
      <p className="page-subtitle">Get help with how the app works, or reach our team directly.</p>

      {error && <p className="sign-in-error">{error}</p>}

      <button type="button" className={`card ${styles.optionCard}`} onClick={handleChatWithSupport} disabled={openingChat}>
        <div className={styles.optionIcon}>{openingChat ? <span className="spinner" aria-hidden /> : <MessageCircle size={20} strokeWidth={2} />}</div>
        <div className={styles.optionTextWrap}>
          <div className={styles.optionTitle}>Chat with support</div>
          <div className={styles.optionSubtitle}>Quick questions about how PawBooker works. We&apos;ll loop in our team for anything bigger.</div>
        </div>
        <ChevronRight size={18} strokeWidth={2} color="var(--muted)" />
      </button>

      <button type="button" className={`card ${styles.optionCard}`} onClick={() => router.push('/book/contact-support')}>
        <div className={styles.optionIcon}>
          <Mail size={20} strokeWidth={2} />
        </div>
        <div className={styles.optionTextWrap}>
          <div className={styles.optionTitle}>Email us</div>
          <div className={styles.optionSubtitle}>For disputes, account issues, or anything more involved.</div>
        </div>
        <ChevronRight size={18} strokeWidth={2} color="var(--muted)" />
      </button>
    </div>
  );
}
