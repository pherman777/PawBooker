import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

// Read-only display of the groomer's own private grooming note (blade/guard,
// temperament) right where they're about to work on the pet - so they don't
// have to tab over to Customers mid-appointment. Editing happens there, not
// here.
export function PetNoteBox({ note }: { note: string }) {
  if (!note.trim()) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Grooming notes</Text>
      <Text style={styles.note}>{note.trim()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: Colors.light.textMuted,
  },
  note: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.text,
  },
});
