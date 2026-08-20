'use client';

import { useEffect, useRef } from 'react';

import type { ChatMessage, ChatSenderType } from '@/lib/groomerChat';

import styles from './ChatView.module.css';

type Props = {
  messages: ChatMessage[];
  ownSenderTypes: ChatSenderType[];
  value: string;
  onChangeValue: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  banner?: string;
};

// Only ever rendered when `!isOwn` (see the bubble below), so a 'customer'
// label here never shows up on a customer's own messages when they're the
// one viewing - it only appears when a GROOMER is viewing the thread, where
// otherwise an unlabeled customer bubble sat indistinguishable next to
// labeled "Assistant" bubbles, looking like the bot replying to itself.
// Bot messages get their own centered, clay-tinted bubble style (see
// bubbleRowBot/bubbleBot below) so they're never mistaken for the other
// party's messages just because both fall outside `ownSenderTypes`.
function bubbleLabel(senderType: ChatSenderType) {
  if (senderType === 'bot') return 'Assistant';
  if (senderType === 'groomer') return 'Groomer';
  if (senderType === 'customer') return 'Customer';
  return '';
}

// Port of components/ChatView.tsx.
export function ChatView({ messages, ownSenderTypes, value, onChangeValue, onSend, sending, banner }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !sending) onSend();
    }
  }

  return (
    <div className={styles.container}>
      {banner && (
        <div className={styles.banner}>
          <span className={styles.bannerText}>{banner}</span>
        </div>
      )}

      <div className={styles.list} ref={listRef}>
        {messages.map((item) => {
          const isOwn = ownSenderTypes.includes(item.senderType);
          const isBot = item.senderType === 'bot';
          const label = bubbleLabel(item.senderType);
          const rowClass = isOwn ? styles.bubbleRowOwn : isBot ? styles.bubbleRowBot : '';
          const bubbleClass = isOwn ? styles.bubbleOwn : isBot ? styles.bubbleBot : styles.bubbleOther;
          return (
            <div key={item.id} className={`${styles.bubbleRow} ${rowClass}`}>
              <div className={`${styles.bubble} ${bubbleClass}`}>
                {label && !isOwn && <div className={styles.bubbleLabel}>{label}</div>}
                <div className={styles.bubbleText}>{item.body}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.inputRow}>
        <textarea className={styles.input} placeholder="Message" value={value} onChange={(e) => onChangeValue(e.target.value)} onKeyDown={handleKeyDown} rows={1} />
        <button type="button" className={styles.sendButton} onClick={onSend} disabled={!value.trim() || sending}>
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
