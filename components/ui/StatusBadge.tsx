import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { BookingStatus } from '@/types';

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: Colors.light.warning,
  confirmed: Colors.light.success,
  completed: Colors.light.textMuted,
  cancelled: Colors.light.danger,
  declined: Colors.light.warning,
};

// Promoted out of app/(salon)/index.tsx, where this status-color mapping
// was originally built local to that one screen.
export function StatusBadge({ status }: { status: BookingStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}22` }]}>
      <Text style={[styles.text, { color }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
