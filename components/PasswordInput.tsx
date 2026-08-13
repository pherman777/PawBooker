import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * Secure text field with a show/hide eye toggle. Spreads through TextInput props
 * (pass `textContentType`/`autoComplete` for password-manager AutoFill), and
 * defaults to the non-autocorrecting, non-capitalizing behavior passwords want.
 * Assumes a ~48pt tall field, matching the app's shared `input` style.
 */
export function PasswordInput({ style, ...props }: TextInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={[style, styles.input]}
        secureTextEntry={!visible}
      />
      <Pressable
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={22}
          color={Colors.light.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  input: {
    paddingRight: 46,
  },
  toggle: {
    position: 'absolute',
    right: 6,
    top: 0,
    height: 48,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
