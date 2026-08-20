import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import type { ChatMessage, ChatSenderType } from '@/types';

type Props = {
  messages: ChatMessage[];
  ownSenderTypes: ChatSenderType[];
  value: string;
  onChangeValue: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  banner?: string;
};

// Only ever rendered when `!isOwn` (see the bubble below), so a 'customer'
// label here never shows up on a customer's own messages when they're the
// one viewing - it only appears when a GROOMER is viewing the thread, where
// otherwise an unlabeled customer bubble sat indistinguishable next to
// labeled "Assistant" bubbles, looking like the bot replying to itself.
// Bot messages get their own centered, clay-tinted bubble style (see
// bubbleRowBot/bubbleBot below) so they're never mistaken for the other
// party's messages just because both fall outside `ownSenderTypes`.
function bubbleLabel(senderType: ChatSenderType) {
  if (senderType === 'bot') return 'Assistant';
  if (senderType === 'groomer') return 'Groomer';
  if (senderType === 'customer') return 'Customer';
  return '';
}

export function ChatView({ messages, ownSenderTypes, value, onChangeValue, onSend, sending, banner }: Props) {
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      // The keyboard opening pushes this whole view up (paddingBottom below)
      // without changing the FlatList's own scroll offset, so the last
      // message - previously flush with the bottom - ends up hidden behind
      // the keyboard until the user manually scrolls. Re-scroll to end once
      // the keyboard has actually finished animating in.
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), Platform.OS === 'ios' ? 0 : 100);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <View style={[styles.flex, { paddingBottom: keyboardHeight }]}>
      {banner && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
      )}

      <FlatList showsVerticalScrollIndicator={false}
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.flex}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isOwn = ownSenderTypes.includes(item.senderType);
          const isBot = item.senderType === 'bot';
          const label = bubbleLabel(item.senderType);
          return (
            <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn, isBot && styles.bubbleRowBot]}>
              <View style={[styles.bubble, isOwn ? styles.bubbleOwn : isBot ? styles.bubbleBot : styles.bubbleOther]}>
                {label && !isOwn && (
                  <Text style={[styles.bubbleLabel, isBot && styles.bubbleLabelBot]}>{label}</Text>
                )}
                <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{item.body}</Text>
              </View>
            </View>
          );
        }}
      />

      <View
        style={[
          styles.inputRow,
          { paddingBottom: keyboardHeight > 0 ? 12 : Math.max(insets.bottom, 12) },
        ]}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          placeholderTextColor={Colors.light.textMuted}
          value={value}
          onChangeText={onChangeValue}
          multiline
          autoCorrect
          autoCapitalize="sentences"
          spellCheck
          keyboardType="default"
        />
        <Pressable
          style={[styles.sendButton, (!value.trim() || sending) && styles.sendButtonDisabled]}
          onPress={onSend}
          disabled={!value.trim() || sending}>
          {sending ? <ActivityIndicator color={Colors.light.text} size="small" /> : <Text style={styles.sendButtonText}>Send</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  banner: {
    backgroundColor: Colors.light.warning,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bannerText: {
    color: Colors.light.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  list: {
    padding: 16,
    gap: 10,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowOwn: {
    justifyContent: 'flex-end',
  },
  bubbleRowBot: {
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOther: {
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  bubbleOwn: {
    backgroundColor: Colors.light.tint,
  },
  // Matches the web ChatView's `color-mix(in srgb, var(--clay) 14/35%, ...)`
  // tints (RN has no color-mix), so bot bubbles read the same on both
  // platforms - a clay tint, distinct from both the sage "own" bubble and
  // the plain "other" surface bubble.
  bubbleBot: {
    backgroundColor: '#F2E7DF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D0B9A9',
  },
  bubbleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.tint,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bubbleLabelBot: {
    color: Colors.light.secondary,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
    color: Colors.light.text,
  },
  bubbleTextOwn: {
    color: Colors.light.text,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.light.text,
  },
  sendButton: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: Colors.light.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
