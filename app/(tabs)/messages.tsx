import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import { showActionSheet } from '@/utils/confirm';

type ThreadRow = {
  id: string;
  groomerName: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unread: boolean;
};

export default function MessagesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    const { data: threadRows } = await supabase
      .from('chat_threads')
      .select('id, customer_last_read_at, groomers(name)')
      .eq('customer_id', session.user.id)
      .eq('thread_type', 'groomer')
      .order('created_at', { ascending: false });

    if (!threadRows || threadRows.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }

    const threadIds = threadRows.map((t) => t.id);
    const { data: recentMessages } = await supabase
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

    setThreads(
      threadRows.map((t) => {
        const last = lastByThread.get(t.id);
        const groomer = t.groomers as unknown as { name: string } | null;
        const unread = Boolean(
          last &&
            last.senderType !== 'customer' &&
            (!t.customer_last_read_at || new Date(last.createdAt) > new Date(t.customer_last_read_at))
        );
        return {
          id: t.id,
          groomerName: groomer?.name ?? 'Groomer',
          lastMessage: last?.body,
          lastMessageAt: last?.createdAt,
          unread,
        };
      })
    );
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleMarkAsRead(threadId: string) {
    await supabase
      .from('chat_threads')
      .update({ customer_last_read_at: new Date().toISOString() })
      .eq('id', threadId);
    await load();
  }

  async function handleDelete(threadId: string) {
    await supabase.from('chat_threads').delete().eq('id', threadId);
    await load();
  }

  function handleLongPress(item: ThreadRow) {
    showActionSheet(item.groomerName, [
      { label: 'Mark as read', onPress: () => handleMarkAsRead(item.id) },
      { label: 'Delete conversation', destructive: true, onPress: () => handleDelete(item.id) },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="Messages" />

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}

      {!loading && (
        <FlatList showsVerticalScrollIndicator={false}
          data={threads}
          keyExtractor={(item) => item.id}
          style={styles.flatList}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: '/chat/[threadId]', params: { threadId: item.id } })}
              onLongPress={() => handleLongPress(item)}>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.groomerName}</Text>
                {item.lastMessage && (
                  <Text style={styles.rowPreview} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                )}
              </View>
              {item.unread && <View style={styles.unreadDot} />}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No conversations yet</Text>
              <Text style={styles.emptySubtext}>
                Message a groomer from their page to get started.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: 20,
  },
  loading: {
    marginTop: 24,
  },
  flatList: {
    flex: 1,
  },
  list: {
    marginTop: 16,
    gap: 10,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  rowPreview: {
    marginTop: 2,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.light.tint,
    marginLeft: 10,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    gap: 6,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.light.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
