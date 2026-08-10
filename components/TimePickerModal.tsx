import { useMemo } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { formatTime } from '@/utils/hours';

const STEP_MINUTES = 15;
const ROW_HEIGHT = 48;

// Every quarter-hour of the day as a 24h "HH:MM" value; the label is rendered in
// AM/PM. The picker speaks AM/PM to the user but keeps the stored value 24h.
function allTimes(): string[] {
  const times: string[] = [];
  for (let m = 0; m < 24 * 60; m += STEP_MINUTES) {
    const hour = Math.floor(m / 60);
    const minute = m % 60;
    times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }
  return times;
}

type Props = {
  visible: boolean;
  value: string;
  title?: string;
  onSelect: (value: string) => void;
  onDismiss: () => void;
};

export function TimePickerModal({ visible, value, title, onSelect, onDismiss }: Props) {
  const times = useMemo(allTimes, []);
  const selectedIndex = Math.max(0, times.indexOf(value));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title ?? 'Select time'}</Text>
          <FlatList
            data={times}
            keyExtractor={(t) => t}
            style={styles.list}
            initialScrollIndex={selectedIndex}
            getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const selected = item === value;
              return (
                <Pressable
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => {
                    onSelect(item);
                    onDismiss();
                  }}>
                  <Text style={[styles.rowText, selected && styles.rowTextSelected]}>{formatTime(item)}</Text>
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.border,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowSelected: {
    backgroundColor: Colors.light.surface,
  },
  rowText: {
    fontSize: 17,
    color: Colors.light.text,
  },
  rowTextSelected: {
    fontWeight: '700',
    color: Colors.light.tint,
  },
});
