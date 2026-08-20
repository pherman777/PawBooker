'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ChatView } from '@/components/ChatView';
import { sendChatMessage } from '@/lib/chat';
import { useCustomerAuth } from '@/lib/customerAuth';
import { customerSupabase } from '@/lib/customerSupabase';
import { fetchThreadDetail, fetchThreadMessages, markThreadRead, type ChatMessage } from '@/lib/customerChatList';

// Port of app/chat/[threadId].tsx - customer-only branch (the native file's
// isGroomerReply branch, only reachable from a groomer session, is out of
// scope here; see the plan).
export default function CustomerChatPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const router = useRouter();
  const { session } = useCustomerAuth();

  const [isAppSupport, setIsAppSupport] = useState(false);
  const [groomerName, setGroomerName] = useState('');
  const [needsHuman, setNeedsHuman] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const [detail, msgs] = await Promise.all([fetchThreadDetail(threadId), fetchThreadMessages(threadId)]);
    setIsAppSupport(detail.isAppSupport);
    setGroomerName(detail.groomerName);
    setNeedsHuman(detail.needsHuman);
    setMessages(msgs);
    setLoading(false);
    if (session) await markThreadRead(threadId);
  }, [threadId, session]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!threadId) return;

    const channel = customerSupabase
      .channel(`chat_messages:${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        const row = payload.new as { id: string; thread_id: string; sender_type: ChatMessage['senderType']; sender_id: string | null; body: string; created_at: string };
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [...prev, { id: row.id, threadId: row.thread_id, senderType: row.sender_type, senderId: row.sender_id ?? undefined, body: row.body, createdAt: row.created_at }];
        });
      })
      .subscribe();

    return () => {
      customerSupabase.removeChannel(channel);
    };
  }, [threadId]);

  async function handleSend() {
    const text = value.trim();
    if (!text || !session) return;

    setValue('');
    setSending(true);
    setMessages((prev) => [...prev, { id: `optimistic-${Date.now()}`, threadId, senderType: 'customer', body: text, createdAt: new Date().toISOString() }]);

    try {
      await sendChatMessage(threadId, text);
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

  const banner = isAppSupport ? (needsHuman ? "This has been passed to the PawBooker team — we'll follow up soon" : undefined) : needsHuman ? `${groomerName || 'Your groomer'} will respond here personally` : undefined;

  return (
    <div>
      <button type="button" className="back-link" onClick={() => router.push('/book/messages')}>
        ← Back
      </button>
      <ChatView messages={messages} ownSenderTypes={['customer']} value={value} onChangeValue={setValue} onSend={handleSend} sending={sending} banner={banner} />
    </div>
  );
}
