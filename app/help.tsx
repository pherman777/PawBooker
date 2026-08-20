import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { getOrCreateAppSupportThread } from '@/services/chat';
import { notify } from '@/utils/confirm';

export default function HelpScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [openingChat, setOpeningChat] = useState(false);

  async function handleChatWithSupport() {
    if (!session) return;
    setOpeningChat(true);
    try {
      const threadId = await getOrCreateAppSupportThread(session.user.id);
      router.push({ pathname: '/chat/[threadId]', params: { threadId } });
    } catch (err) {
      notify('Could not start chat', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setOpeningChat(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.subtitle}>Get help with how the app works, or reach our team directly.</Text>

        <Pressable style={styles.optionCard} onPress={handleChatWithSupport} disabled={openingChat}>
          <View style={styles.optionIcon}>
            {openingChat ? (
              <ActivityIndicator color={Colors.light.tint} />
            ) : (
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={Colors.light.tint} />
            )}
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionTitle}>Chat with support</Text>
            <Text style={styles.optionSubtitle}>
              Quick questions about how PawBooker works. We&apos;ll loop in our team for anything bigger.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.light.textMuted} />
        </Pressable>

        <Pressable style={styles.optionCard} onPress={() => router.push('/contact-support')}>
          <View style={styles.optionIcon}>
            <Ionicons name="mail-outline" size={22} color={Colors.light.tint} />
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionTitle}>Email us</Text>
            <Text style={styles.optionSubtitle}>For disputes, account issues, or anything more involved.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.light.textMuted} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 20,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textMuted,
    marginBottom: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(107,143,114,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  optionSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textMuted,
  },
});
