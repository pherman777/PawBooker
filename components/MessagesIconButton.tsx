import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { supabase } from '@/services/supabase';

type Props = {
  groomerId: string;
};

export function MessagesIconButton({ groomerId }: Props) {
  const router = useRouter();
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);

  const load = useCallback(async () => {
    const { data: threadRows } = await supabase
      .from('chat_threads')
      .select('id, needs_human, groomer_last_read_at')
      .eq('groomer_id', groomerId)
      .eq('thread_type', 'groomer');

    if (!threadRows || threadRows.length === 0) {
      setNeedsAttentionCount(0);
      return;
    }

    const threadIds = threadRows.map((t) => t.id);
    const { data: recentMessages } = await supabase
      .from('chat_messages')
      .select('thread_id, sender_type, created_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false });

    const lastByThread = new Map<string, { senderType: string; createdAt: string }>();
    for (const m of recentMessages ?? []) {
      if (!lastByThread.has(m.thread_id)) {
        lastByThread.set(m.thread_id, { senderType: m.sender_type, createdAt: m.created_at });
      }
    }

    const count = threadRows.filter((t) => {
      if (t.needs_human) return true;
      const last = lastByThread.get(t.id);
      return Boolean(
        last &&
          last.senderType !== 'groomer' &&
          (!t.groomer_last_read_at || new Date(last.createdAt) > new Date(t.groomer_last_read_at))
      );
    }).length;

    setNeedsAttentionCount(count);
  }, [groomerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Pressable style={styles.button} onPress={() => router.push('/(salon)/messages')} hitSlop={8}>
      <Ionicons name="chatbubble-ellipses-outline" size={17} color={Colors.light.text} />
      {needsAttentionCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{needsAttentionCount > 9 ? '9+' : needsAttentionCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Colors.light.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
