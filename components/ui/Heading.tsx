import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, type TextStyle } from 'react-native';

import { Colors } from '@/constants/theme';

type Level = 1 | 2 | 3;

type Props = {
  children: ReactNode;
  level?: Level;
  color?: string;
  style?: TextStyle;
};

// Marketing site's serif headings (public/styles/site.css), gated to web
// only - that font list is a real system-font stack on macOS/iOS Safari but
// has nothing to resolve to as a bare RN `fontFamily` string on native, so
// native keeps the system sans instead of falling back to something odd.
const SERIF_STACK =
  "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";

const SIZE: Record<Level, number> = { 1: 32, 2: 24, 3: 19 };

export function Heading({ children, level = 2, color = Colors.light.text, style }: Props) {
  return (
    <Text
      style={[
        styles.text,
        { fontSize: SIZE[level], color },
        Platform.OS === 'web' ? webFontStyle : null,
        style,
      ]}>
      {children}
    </Text>
  );
}

// react-native-web accepts a literal CSS font-family list; native ignores
// this branch entirely (see Platform.OS check above).
const webFontStyle = { fontFamily: SERIF_STACK } as TextStyle;

const styles = StyleSheet.create({
  text: {
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
