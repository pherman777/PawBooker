import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';

export type PickerOption = { id: string; label: string };

type Props = {
  title: string;
  placeholder: string;
  searchPlaceholder?: string;
  value: string | null;
  options: PickerOption[];
  onChange: (id: string) => void;
};

export function SearchablePicker({
  title,
  placeholder,
  searchPlaceholder = 'Search',
  value,
  options,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = options.find((o) => o.id === value)?.label;

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [query, options]);

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={selectedLabel ? styles.fieldValue : styles.fieldPlaceholder}>
          {selectedLabel || placeholder}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor={Colors.light.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />

          <FlatList
            showsVerticalScrollIndicator={false}
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => handleSelect(item.id)}>
                <Text style={styles.rowText}>{item.label}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No matches for &quot;{query}&quot;.</Text>}
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
