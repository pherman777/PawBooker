import { customerSupabase } from '@/lib/customerSupabase';

export type ChatSenderType = 'customer' | 'groomer' | 'bot';

export type ChatMessage = {
  id: string;
  threadId: string;
  senderType: ChatSenderType;
  senderId?: string;
  body: string;
  createdAt: string;
};

export type ThreadRow = {
  id: string;
  groomerName: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unread: boolean;
};

// Port of app/(tabs)/messages.tsx's load query.
export async function fetchGroomerThreads(customerId: string): Promise<ThreadRow[]> {
  const { data: threadRows } = await customerSupabase
    .from('chat_threads')
    .select('id, customer_last_read_at, groomers(name)')
    .eq('customer_id', customerId)
    .eq('thread_type', 'groomer')
    .order('created_at', { ascending: false });

  if (!threadRows || threadRows.length === 0) return [];

  const threadIds = threadRows.map((t) => t.id);
  const { data: recentMessages } = await customerSupabase
    .from('chat_messages')
    .select('thread_id, sender_type, body, created_at')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false });

  const lastByThread = new Map<string, { senderType: string; body: string; createdAt: string }>();
  for (const m of recentMessages ?? []) {
    if (!lastByThread.has(m.thread_id)) {
      lastByThread.set(m.thread_id, { senderType: m.sender_type, body: m.body, createdAt: m.created_at });
    }
  }

  return threadRows.map((t) => {
    const last = lastByThread.get(t.id);
    const groomer = t.groomers as unknown as { name: string } | null;
    const unread = Boolean(last && last.senderType !== 'customer' && (!t.customer_last_read_at || new Date(last.createdAt) > new Date(t.customer_last_read_at)));
    return {
      id: t.id,
      groomerName: groomer?.name ?? 'Groomer',
      lastMessage: last?.body,
      lastMessageAt: last?.createdAt,
      unread,
    };
  });
}

export async function markThreadRead(threadId: string) {
  await customerSupabase.from('chat_threads').update({ customer_last_read_at: new Date().toISOString() }).eq('id', threadId);
}

export async function deleteThread(threadId: string) {
  await customerSupabase.from('chat_threads').delete().eq('id', threadId);
}

export type ThreadDetail = {
  needsHuman: boolean;
  isAppSupport: boolean;
  groomerName: string;
};

export async function fetchThreadDetail(threadId: string): Promise<ThreadDetail> {
  const { data } = await customerSupabase.from('chat_threads').select('needs_human, thread_type, groomers(name)').eq('id', threadId).single();
  const groomer = data?.groomers as unknown as { name: string } | null;
  return {
    needsHuman: data?.needs_human ?? false,
    isAppSupport: data?.thread_type === 'app_support',
    groomerName: groomer?.name ?? '',
  };
}

export async function fetchThreadMessages(threadId: string): Promise<ChatMessage[]> {
  const { data } = await customerSupabase.from('chat_messages').select('id, thread_id, sender_type, sender_id, body, created_at').eq('thread_id', threadId).order('created_at', { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    senderType: row.sender_type,
    senderId: row.sender_id ?? undefined,
    body: row.body,
    createdAt: row.created_at,
  }));
}
