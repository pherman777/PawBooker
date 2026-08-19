import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
};

// Matches public/styles/site.css's card treatment: surface-2, 1px border,
// 16px radius, a tight near-black shadow plus a large soft diffuse one for
// real depth (vs. the flat, borders-only cards scattered through the app
// today).
export function Card({ children, onPress, style }: Props) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[styles.card, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.surfaceElevated,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 3,
  },
});
