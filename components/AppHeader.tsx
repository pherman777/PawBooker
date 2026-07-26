import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { Logo } from './Logo';

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function AppHeader({ title, subtitle, right }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Logo size={36} />
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  titleWrap: {
    flexShrink: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
});
