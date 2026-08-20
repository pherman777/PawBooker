'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ChatView } from '@/components/ChatView';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fetchThreadDetail, fetchThreadMessages, markThreadRead, sendGroomerChatMessage, type ChatMessage } from '@/lib/groomerChat';

// Port of app/chat/[threadId].tsx's groomer-reply branch (isGroomerReply is
// always true here - this page only exists inside /dashboard, which only a
// groomer session reaches).
export default function GroomerChatPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const router = useRouter();
  const { session, groomerProfile } = useAuth();

  const [customerLabel, setCustomerLabel] = useState('');
  const [needsHuman, setNeedsHuman] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    const [detail, msgs] = await Promise.all([fetchThreadDetail(threadId, groomerProfile.id), fetchThreadMessages(threadId)]);
    setCustomerLabel(detail.customerLabel);
    setNeedsHuman(detail.needsHuman);
    setMessages(msgs);
    setLoading(false);
    if (session) await markThreadRead(threadId);
  }, [threadId, session, groomerProfile]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`chat_messages:${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        const row = payload.new as { id: string; thread_id: string; sender_type: ChatMessage['senderType']; sender_id: string | null; body: string; created_at: string };
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          const newMessage: ChatMessage = { id: row.id, threadId: row.thread_id, senderType: row.sender_type, senderId: row.sender_id ?? undefined, body: row.body, createdAt: row.created_at };
          const optimisticIndex = prev.findIndex((m) => m.id.startsWith('optimistic-') && m.senderType === row.sender_type && m.body === row.body);
          if (optimisticIndex !== -1) {
            const next = [...prev];
            next[optimisticIndex] = newMessage;
            return next;
          }
          return [...prev, newMessage];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  async function handleSend() {
    const text = value.trim();
    if (!text || !session) return;

    setValue('');
    setSending(true);
    setMessages((prev) => [...prev, { id: `optimistic-${Date.now()}`, threadId, senderType: 'groomer', body: text, createdAt: new Date().toISOString() }]);

    try {
      await sendGroomerChatMessage(threadId, text);
    } catch {
      // message already appended optimistically; a real failure surfaces on
      // reload since the row never gets inserted server-side
    }

    setSending(false);
    await load();
  }

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" aria-hidden />
      </div>
    );
  }

  return (
    <div>
      <button type="button" className="back-link" onClick={() => router.push('/dashboard/messages')}>
        ← Back
      </button>
      <ChatView
        messages={messages}
        ownSenderTypes={['groomer']}
        value={value}
        onChangeValue={setValue}
        onSend={handleSend}
        sending={sending}
        banner={needsHuman ? 'This conversation was escalated to you' : undefined}
      />
      <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>Conversation with {customerLabel}</p>
    </div>
  );
}
