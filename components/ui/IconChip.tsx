import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

type Tone = 'tint' | 'secondary' | 'success' | 'warning' | 'danger' | 'muted';

type Props = {
  name: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  size?: number;
};

const TONE_COLOR: Record<Tone, string> = {
  tint: Colors.light.tint,
  secondary: Colors.light.secondary,
  success: Colors.light.success,
  warning: Colors.light.warning,
  danger: Colors.light.danger,
  muted: Colors.light.textMuted,
};

// Marketing site's icon "chip": a tinted rounded square housing a stroked
// icon (public/styles/site.css's `.card .ic`, 44x44 there) - formalizes the
// ad hoc bannerIcon/statIconWrap circles built locally in
// app/(salon)/index.tsx into one reusable component.
export function IconChip({ name, tone = 'tint', size = 44 }: Props) {
  const color = TONE_COLOR[tone];
  return (
    <View
      style={[
        styles.chip,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: `${color}29`,
        },
      ]}>
      <Ionicons name={name} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
