import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { DOG_BREEDS, MIXED_BREED } from '@/constants/dog-breeds';

type Props = {
  value: string;
  onChange: (breed: string) => void;
};

export function BreedPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const all = [MIXED_BREED, ...DOG_BREEDS];
    if (!query.trim()) return all;
    const q = query.trim().toLowerCase();
    return all.filter((breed) => breed.toLowerCase().includes(q));
  }, [query]);

  function handleSelect(breed: string) {
    onChange(breed);
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={value ? styles.fieldValue : styles.fieldPlaceholder}>
          {value || 'Select a breed...'}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select a breed</Text>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="Search breeds"
            placeholderTextColor={Colors.light.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />

          <FlatList showsVerticalScrollIndicator={false}
            data={options}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => handleSelect(item)}>
                <Text style={styles.rowText}>{item}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No breeds match &quot;{query}&quot;.</Text>}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginBottom: 14,
  },
  fieldValue: {
    fontSize: 16,
    color: Colors.light.text,
  },
  fieldPlaceholder: {
    fontSize: 16,
    color: Colors.light.textMuted,
  },
  modal: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
  },
  closeText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  searchInput: {
    height: 46,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Colors.light.text,
    marginBottom: 12,
  },
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  rowText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  emptyText: {
    marginTop: 20,
    fontSize: 14,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
});
