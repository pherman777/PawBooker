import { customerSupabase } from '@/lib/customerSupabase';

// Port of services/chat.ts.

export async function getOrCreateGroomerThread(customerId: string, groomerId: string): Promise<string> {
  const { data: existing } = await customerSupabase
    .from('chat_threads')
    .select('id')
    .eq('customer_id', customerId)
    .eq('groomer_id', groomerId)
    .eq('thread_type', 'groomer')
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await customerSupabase
    .from('chat_threads')
    .insert({ customer_id: customerId, groomer_id: groomerId, thread_type: 'groomer' })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? 'Could not start conversation');
  }
  return created.id;
}

export async function getOrCreateAppSupportThread(userId: string): Promise<string> {
  const { data: existing } = await customerSupabase
    .from('chat_threads')
    .select('id')
    .eq('customer_id', userId)
    .eq('thread_type', 'app_support')
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await customerSupabase
    .from('chat_threads')
    .insert({ customer_id: userId, thread_type: 'app_support' })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? 'Could not start conversation');
  }
  return created.id;
}

export async function sendGroomerChatMessage(threadId: string, body: string) {
  const { error } = await customerSupabase.functions.invoke('send-chat-message', {
    body: { threadId, body },
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendChatMessage(threadId: string, message: string) {
  const { data, error } = await customerSupabase.functions.invoke('chat-agent', {
    body: { threadId, message },
  });

  if (error) {
    throw new Error(error.message);
  }
  return data as {
    reply?: string;
    escalated?: boolean;
    handledByHuman?: boolean;
    freeTier?: boolean;
    error?: string;
  };
}
