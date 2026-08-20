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

function bubbleLabel(senderType: ChatSenderType) {
  if (senderType === 'bot') return 'Assistant';
  if (senderType === 'groomer') return 'Groomer';
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
          const label = bubbleLabel(item.senderType);
          return (
            <div key={item.id} className={`${styles.bubbleRow} ${isOwn ? styles.bubbleRowOwn : ''}`}>
              <div className={`${styles.bubble} ${isOwn ? styles.bubbleOwn : styles.bubbleOther}`}>
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
