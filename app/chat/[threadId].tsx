import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatView } from '@/components/ChatView';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { sendChatMessage, sendGroomerChatMessage } from '@/services/chat';
import { supabase } from '@/services/supabase';
import type { ChatMessage } from '@/types';
import { notify } from '@/utils/confirm';

export default function ChatScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { session, groomerProfile } = useAuth();
  const isGroomer = Boolean(groomerProfile);
  const [isAppSupport, setIsAppSupport] = useState(false);
  const [groomerName, setGroomerName] = useState('');
  const [groomerPlan, setGroomerPlan] = useState('pro');
  const [needsHuman, setNeedsHuman] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  // In an app_support thread there's no second party to reply as "groomer" -
  // everyone (customer or groomer role) is just the person asking, and the
  // bot (or, once escalated, the PawBooker team) is the only other side.
  // Only treat the current user as "the human replying directly" for a real
  // groomer <-> customer thread, never for app_support.
  const isGroomerReply = isGroomer && !isAppSupport;

  const load = useCallback(async () => {
    const [threadResult, messagesResult] = await Promise.all([
      supabase
        .from('chat_threads')
        .select('needs_human, thread_type, groomers(name, plan)')
        .eq('id', threadId)
        .single(),
      supabase
        .from('chat_messages')
        .select('id, thread_id, sender_type, sender_id, body, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true }),
    ]);

    let threadIsAppSupport = false;
    if (threadResult.data) {
      setNeedsHuman(threadResult.data.needs_human);
      threadIsAppSupport = threadResult.data.thread_type === 'app_support';
      setIsAppSupport(threadIsAppSupport);
      const groomer = threadResult.data.groomers as unknown as { name: string; plan: string } | null;
      setGroomerName(groomer?.name ?? '');
      setGroomerPlan(groomer?.plan ?? 'pro');
    }

    if (messagesResult.data) {
      setMessages(
        messagesResult.data.map((row) => ({
          id: row.id,
          threadId: row.thread_id,
          senderType: row.sender_type,
          senderId: row.sender_id ?? undefined,
          body: row.body,
          createdAt: row.created_at,
        }))
      );
    }

    setLoading(false);

    if (session) {
      const column = isGroomer && !threadIsAppSupport ? 'groomer_last_read_at' : 'customer_last_read_at';
      await supabase
        .from('chat_threads')
        .update({ [column]: new Date().toISOString() })
        .eq('id', threadId);
    }
  }, [threadId, session, isGroomer]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`chat_messages:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            thread_id: string;
            sender_type: ChatMessage['senderType'];
            sender_id: string | null;
            body: string;
            created_at: string;
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const newMessage: ChatMessage = {
              id: row.id,
              threadId: row.thread_id,
              senderType: row.sender_type,
              senderId: row.sender_id ?? undefined,
              body: row.body,
              createdAt: row.created_at,
            };
            // Replace the optimistic entry handleSend added (rather than
            // appending a second copy) - it has a client-only id, so it
            // never matches row.id above and would otherwise show
            // duplicated until the post-send load() replaces the whole list.
            const optimisticIndex = prev.findIndex(
              (m) => m.id.startsWith('optimistic-') && m.senderType === row.sender_type && m.body === row.body
            );
            if (optimisticIndex !== -1) {
              const next = [...prev];
              next[optimisticIndex] = newMessage;
              return next;
            }
            return [...prev, newMessage];
          });
        }
      )
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

    if (isGroomerReply) {
      setMessages((prev) => [
        ...prev,
        {
          id: `optimistic-${Date.now()}`,
          threadId: threadId as string,
          senderType: 'groomer',
          body: text,
          createdAt: new Date().toISOString(),
        },
      ]);
      try {
        await sendGroomerChatMessage(threadId as string, text);
      } catch (err) {
        notify('Message not sent', err instanceof Error ? err.message : 'Something went wrong.');
      }
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: `optimistic-${Date.now()}`,
          threadId: threadId as string,
          senderType: 'customer',
          body: text,
          createdAt: new Date().toISOString(),
        },
      ]);
      try {
        await sendChatMessage(threadId as string, text);
      } catch (err) {
        notify('Message not sent', err instanceof Error ? err.message : 'Something went wrong.');
      }
    }

    setSending(false);
    await load();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ChatView
        messages={messages}
        ownSenderTypes={isGroomerReply ? ['groomer'] : ['customer']}
        value={value}
        onChangeValue={setValue}
        onSend={handleSend}
        sending={sending}
        banner={
          isAppSupport
            ? needsHuman
              ? 'This has been passed to the PawBooker team — we’ll follow up soon'
              : undefined
            : isGroomerReply
              ? needsHuman
                ? 'This conversation was escalated to you'
                : undefined
              : needsHuman || groomerPlan !== 'pro'
                ? `${groomerName || 'Your groomer'} will respond here personally`
                : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  loading: {
    marginTop: 40,
  },
});
