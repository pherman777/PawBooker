import { Platform, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  size?: number;
  style?: StyleProp<TextStyle>;
};

// SF Pro Rounded is a real system font on iOS (no bundling needed); on other
// platforms this just falls back to the default system font.
const roundedFont = Platform.select({ ios: 'SF Pro Rounded', default: undefined });

export function Wordmark({ size = 20, style }: Props) {
  return (
    <Text style={[styles.base, { fontSize: size }, style]}>
      <Text style={styles.paw}>Paw</Text>
      <Text style={styles.booker}>Booker</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: roundedFont,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  paw: {
    color: Colors.light.text,
  },
  booker: {
    color: Colors.light.tint,
  },
});
