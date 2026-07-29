import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { Logo } from './Logo';

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** Puts `right` on its own row below the title instead of beside it, so a
   * long/dynamic title never has to compete with it for width. */
  stackRight?: boolean;
};

export function AppHeader({ title, subtitle, right, stackRight }: Props) {
  const titleRow = (
    <View style={styles.left}>
      <Logo size={36} />
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );

  if (stackRight) {
    return (
      <View style={styles.stack}>
        {titleRow}
        {right && <View style={styles.stackedRight}>{right}</View>}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {titleRow}
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
  stack: {
    gap: 12,
  },
  stackedRight: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
