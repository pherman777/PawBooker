import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

// Matches dashboard/app/globals.css's .btn family exactly: primary fills
// with the dark `band` color (the "dark as deliberate accent" move from the
// Hybrid redesign - not sage), secondary fills with clay, ghost/danger stay
// outlined. 12px radius, ~700-weight label, a 1px press-down translate
// instead of an opacity fade.
export function Button({ label, onPress, variant = 'primary', size = 'md', loading, disabled, style }: Props) {
  const fill = variant === 'primary' || variant === 'secondary';
  const fillColor = variant === 'primary' ? Colors.light.band : Colors.light.secondary;
  const outlineColor = variant === 'danger' ? Colors.light.danger : Colors.light.border;
  const textColor = variant === 'primary' ? Colors.light.bandText : variant === 'danger' ? Colors.light.danger : Colors.light.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        fill ? { backgroundColor: fillColor } : { borderWidth: StyleSheet.hairlineWidth, borderColor: outlineColor },
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  md: {
    height: 46,
    paddingHorizontal: 22,
  },
  sm: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  pressed: {
    transform: [{ translateY: 1 }],
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
  labelSm: {
    fontSize: 13,
  },
});
