import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { registerActionSheetHost, type ActionSheetState } from '@/utils/confirm';

// Web-only counterpart to showActionSheet's native Alert.alert path. Mounted
// once at the app root (see app/_layout.tsx's WebShell).
export function ActionSheetHost() {
  const [state, setState] = useState<ActionSheetState | null>(null);

  useEffect(() => {
    registerActionSheetHost(setState);
    return () => registerActionSheetHost(null);
  }, []);

  if (!state) return null;

  function close() {
    setState(null);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{state.title}</Text>
          {state.options.map((option, index) => (
            <Pressable
              key={index}
              style={styles.row}
              onPress={() => {
                close();
                option.onPress();
              }}>
              <Text style={[styles.rowText, option.destructive && styles.destructiveText]}>{option.label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancelRow} onPress={close}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    overflow: 'hidden',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textMuted,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.light.border,
  },
  rowText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  destructiveText: {
    color: Colors.light.danger,
  },
  cancelRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.light.border,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.tint,
    textAlign: 'center',
  },
});
