import { StyleSheet, Text, type TextStyle } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  children: string;
  color?: string;
  style?: TextStyle;
};

// Marketing site's signature section label (public/styles/site.css's
// .eyebrow: uppercase, letter-spaced, small, sage by default) - the app has
// no equivalent today.
export function Eyebrow({ children, color = Colors.light.tint, style }: Props) {
  return <Text style={[styles.text, { color }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
