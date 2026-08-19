import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatView } from '@/components/ChatView';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import type { ChatMessage } from '@/types';
import { notify } from '@/utils/confirm';

export function BusinessAssistantFab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groomerProfile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const isPro = groomerProfile?.plan === 'pro';

  const loadMessages = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('business_assistant_messages')
      .select('id, groomer_id, sender_type, body, created_at')
      .eq('groomer_id', groomerProfile.id)
      .order('created_at', { ascending: true });

    if (!error) {
      setMessages(
        (data ?? []).map((row) => ({
          id: row.id,
          threadId: row.groomer_id,
          senderType: row.sender_type,
          body: row.body,
          createdAt: row.created_at,
        }))
      );
    }
    setLoading(false);
  }, [groomerProfile]);

  function handleOpen() {
    if (!isPro) {
      router.push('/(salon)/plan');
      return;
    }
    setVisible(true);
    loadMessages();
  }

  async function handleSend() {
    const text = value.trim();
    if (!text || !groomerProfile) return;

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      threadId: groomerProfile.id,
      senderType: 'groomer',
      body: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setValue('');
    setSending(true);

    const history = messages.slice(-10).map((m) => ({ role: m.senderType === 'bot' ? 'assistant' : 'user', body: m.body }));

    const { data, error } = await supabase.functions.invoke('business-assistant', {
      body: { message: text, history },
    });

    setSending(false);

    if (error) {
      notify('Assistant unavailable', error instanceof Error ? error.message : 'Something went wrong.');
      return;
    }

    if (data?.reply) {
      setMessages((current) => [
        ...current,
        {
          id: `local-bot-${Date.now()}`,
          threadId: groomerProfile.id,
          senderType: 'bot',
          body: data.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }

  return (
    <>
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={handleOpen}
        hitSlop={8}>
        <Ionicons name="sparkles" size={24} color="#fff" />
        {!isPro && (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={10} color="#fff" />
          </View>
        )}
      </Pressable>

      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        {/* RN's Modal renders in its own native window on iOS, which doesn't inherit the
            app's root SafeAreaProvider - without this nested one, insets read as zero and
            the header renders under the status bar. */}
        <SafeAreaProvider>
          <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Business Assistant</Text>
                <Text style={styles.headerSubtitle}>Ask about customers, revenue, or supplies</Text>
              </View>
              <Pressable onPress={() => setVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={26} color={Colors.light.text} />
              </Pressable>
            </View>

            {messages.length === 0 && !loading && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  Try asking: "Which customers haven't booked in 3 months?", "How's revenue looking this month?", or
                  "What's low on supplies?"
                </Text>
              </View>
            )}

            <ChatView
              messages={messages}
              ownSenderTypes={['groomer']}
              value={value}
              onChangeValue={setValue}
              onSend={handleSend}
              sending={sending}
            />
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    // Every View on web defaults to position:relative, so 'absolute' here
    // resolves against the nearest ancestor View - which, on the groomer
    // web dashboard, is a centered content column narrower than the actual
    // browser window. 'fixed' pins it to the real viewport corner instead,
    // matching how a floating action button is supposed to behave. Native
    // has no such wrapper, so 'absolute' (relative to the screen) is right.
    position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.light.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  modal: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  emptyState: {
    padding: 24,
  },
  emptyStateText: {
    fontSize: 14,
    color: Colors.light.textMuted,
    lineHeight: 20,
    textAlign: 'center',
  },
});
