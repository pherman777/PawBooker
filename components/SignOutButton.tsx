import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import { supabase } from '@/services/supabase';

export function SignOutButton() {
  return (
    <Pressable style={styles.button} onPress={() => supabase.auth.signOut()} hitSlop={8}>
      <Ionicons name="log-out-outline" size={19} color={Colors.light.danger} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
});
