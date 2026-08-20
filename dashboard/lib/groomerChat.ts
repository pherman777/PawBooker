import { supabase } from '@/lib/supabase';

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
  customerLabel: string;
  needsHuman: boolean;
  lastMessage?: string;
  lastMessageAt?: string;
  unread: boolean;
};

// Port of app/(salon)/messages.tsx's load query.
export async function fetchGroomerThreads(groomerId: string): Promise<ThreadRow[]> {
  const { data: threadRows } = await supabase
    .from('chat_threads')
    .select('id, customer_id, needs_human, groomer_last_read_at')
    .eq('groomer_id', groomerId)
    .eq('thread_type', 'groomer')
    .order('created_at', { ascending: false });

  if (!threadRows || threadRows.length === 0) return [];

  const threadIds = threadRows.map((t) => t.id);
  const customerIds = [...new Set(threadRows.map((t) => t.customer_id))];

  const [messagesResult, bookingsResult] = await Promise.all([
    supabase.from('chat_messages').select('thread_id, sender_type, body, created_at').in('thread_id', threadIds).order('created_at', { ascending: false }),
    supabase.from('bookings').select('customer_id, customer_email, customer_name').in('customer_id', customerIds).eq('groomer_id', groomerId),
  ]);

  const lastByThread = new Map<string, { senderType: string; body: string; createdAt: string }>();
  for (const m of messagesResult.data ?? []) {
    if (!lastByThread.has(m.thread_id)) {
      lastByThread.set(m.thread_id, { senderType: m.sender_type, body: m.body, createdAt: m.created_at });
    }
  }

  const labelByCustomer = new Map<string, string>();
  for (const b of bookingsResult.data ?? []) {
    if (!labelByCustomer.has(b.customer_id) && (b.customer_name || b.customer_email)) {
      labelByCustomer.set(b.customer_id, b.customer_name || b.customer_email);
    }
  }

  return threadRows.map((t) => {
    const last = lastByThread.get(t.id);
    const unread = Boolean(last && last.senderType !== 'groomer' && (!t.groomer_last_read_at || new Date(last.createdAt) > new Date(t.groomer_last_read_at)));
    return {
      id: t.id,
      customerLabel: labelByCustomer.get(t.customer_id) ?? 'Customer',
      needsHuman: t.needs_human,
      lastMessage: last?.body,
      lastMessageAt: last?.createdAt,
      unread,
    };
  });
}

export async function markThreadRead(threadId: string) {
  await supabase.from('chat_threads').update({ groomer_last_read_at: new Date().toISOString() }).eq('id', threadId);
}

export async function deleteThread(threadId: string) {
  await supabase.from('chat_threads').delete().eq('id', threadId);
}

export type ThreadDetail = {
  needsHuman: boolean;
  customerLabel: string;
};

export async function fetchThreadDetail(threadId: string, groomerId: string): Promise<ThreadDetail> {
  const { data } = await supabase.from('chat_threads').select('needs_human, customer_id').eq('id', threadId).single();
  let customerLabel = 'Customer';
  if (data?.customer_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('customer_name, customer_email')
      .eq('customer_id', data.customer_id)
      .eq('groomer_id', groomerId)
      .limit(1)
      .maybeSingle();
    customerLabel = booking?.customer_name || booking?.customer_email || 'Customer';
  }
  return { needsHuman: data?.needs_human ?? false, customerLabel };
}

export async function fetchThreadMessages(threadId: string): Promise<ChatMessage[]> {
  const { data } = await supabase.from('chat_messages').select('id, thread_id, sender_type, sender_id, body, created_at').eq('thread_id', threadId).order('created_at', { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    senderType: row.sender_type,
    senderId: row.sender_id ?? undefined,
    body: row.body,
    createdAt: row.created_at,
  }));
}

// Reused as-is on both sides (customer and groomer) - RLS now permits an
// insert from either, scoped by the new "Groomers create threads with
// their own customers" policy (migration 0060) on the groomer side.
export async function getOrCreateGroomerThread(customerId: string, groomerId: string): Promise<string> {
  const { data: existing } = await supabase.from('chat_threads').select('id').eq('customer_id', customerId).eq('groomer_id', groomerId).eq('thread_type', 'groomer').maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase.from('chat_threads').insert({ customer_id: customerId, groomer_id: groomerId, thread_type: 'groomer' }).select('id').single();

  if (error || !created) {
    throw new Error(error?.message ?? 'Could not start conversation');
  }
  return created.id;
}

export async function sendGroomerChatMessage(threadId: string, body: string) {
  const { error } = await supabase.functions.invoke('send-chat-message', {
    body: { threadId, body },
  });

  if (error) {
    throw new Error(error.message);
  }
}
