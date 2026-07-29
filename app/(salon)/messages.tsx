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
  customerLabel: string;
  needsHuman: boolean;
  lastMessage?: string;
  lastMessageAt?: string;
  unread: boolean;
};

export default function SalonMessagesScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    const { data: threadRows } = await supabase
      .from('chat_threads')
      .select('id, customer_id, needs_human, groomer_last_read_at')
      .eq('groomer_id', groomerProfile.id)
      .eq('thread_type', 'groomer')
      .order('created_at', { ascending: false });

    if (!threadRows || threadRows.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }

    const threadIds = threadRows.map((t) => t.id);
    const customerIds = [...new Set(threadRows.map((t) => t.customer_id))];

    const [messagesResult, bookingsResult] = await Promise.all([
      supabase
        .from('chat_messages')
        .select('thread_id, sender_type, body, created_at')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('bookings')
        .select('customer_id, customer_email')
        .in('customer_id', customerIds)
        .eq('groomer_id', groomerProfile.id),
    ]);

    const lastByThread = new Map<string, { senderType: string; body: string; createdAt: string }>();
    for (const m of messagesResult.data ?? []) {
      if (!lastByThread.has(m.thread_id)) {
        lastByThread.set(m.thread_id, { senderType: m.sender_type, body: m.body, createdAt: m.created_at });
      }
    }

    const emailByCustomer = new Map<string, string>();
    for (const b of bookingsResult.data ?? []) {
      if (b.customer_email && !emailByCustomer.has(b.customer_id)) {
        emailByCustomer.set(b.customer_id, b.customer_email);
      }
    }

    setThreads(
      threadRows.map((t) => {
        const last = lastByThread.get(t.id);
        const unread = Boolean(
          last &&
            last.senderType !== 'groomer' &&
            (!t.groomer_last_read_at || new Date(last.createdAt) > new Date(t.groomer_last_read_at))
        );
        return {
          id: t.id,
          customerLabel: emailByCustomer.get(t.customer_id) ?? 'Customer',
          needsHuman: t.needs_human,
          lastMessage: last?.body,
          lastMessageAt: last?.createdAt,
          unread,
        };
      })
    );
    setLoading(false);
  }, [groomerProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleMarkAsRead(threadId: string) {
    await supabase
      .from('chat_threads')
      .update({ groomer_last_read_at: new Date().toISOString() })
      .eq('id', threadId);
    await load();
  }

  async function handleDelete(threadId: string) {
    await supabase.from('chat_threads').delete().eq('id', threadId);
    await load();
  }

  function handleLongPress(item: ThreadRow) {
    showActionSheet(item.customerLabel, [
      { label: 'Mark as read', onPress: () => handleMarkAsRead(item.id) },
      { label: 'Delete conversation', destructive: true, onPress: () => handleDelete(item.id) },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
        <Text style={styles.backLink}>← Back</Text>
      </Pressable>
      <AppHeader title="Messages" subtitle={groomerProfile?.name ?? ''} />

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}

      {!loading && (
        <FlatList
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
                <View style={styles.rowHeader}>
                  <Text style={styles.rowName}>{item.customerLabel}</Text>
                  {item.needsHuman && (
                    <View style={styles.needsHumanPill}>
                      <Text style={styles.needsHumanText}>Needs you</Text>
                    </View>
                  )}
                </View>
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
  backRow: {
    marginBottom: 12,
  },
  backLink: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
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
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  needsHumanPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Colors.light.danger,
  },
  needsHumanText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
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
  },
  emptyText: {
    fontSize: 15,
    color: Colors.light.textMuted,
  },
});
