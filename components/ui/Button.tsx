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

// Matches public/styles/site.css's .btn: 12px radius, ~700-weight label, a
// 1px press-down translate instead of an opacity fade. `ghost`/`danger` stay
// outlined (unfilled) rather than borrowing site.css's filled ghost hover
// state, matching how destructive/secondary actions already read elsewhere
// in the app.
export function Button({ label, onPress, variant = 'primary', size = 'md', loading, disabled, style }: Props) {
  const fill = variant === 'primary' || variant === 'secondary';
  const tone = variant === 'secondary' ? Colors.light.secondary : variant === 'danger' ? Colors.light.danger : Colors.light.tint;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        fill ? { backgroundColor: tone } : { borderWidth: StyleSheet.hairlineWidth, borderColor: tone },
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fill ? Colors.light.background : tone} size="small" />
      ) : (
        <Text
          style={[
            styles.label,
            size === 'sm' && styles.labelSm,
            { color: fill ? Colors.light.background : tone },
          ]}>
          {label}
        </Text>
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
