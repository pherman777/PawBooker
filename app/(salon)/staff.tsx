import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import { confirmAsync, notify } from '@/utils/confirm';

type Staff = {
  id: string;
  name: string;
};

export default function StaffScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    const { data, error: queryError } = await supabase
      .from('salon_staff')
      .select('id, name')
      .eq('salon_id', groomerProfile.id)
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (queryError) {
      setError(queryError.message);
    } else {
      setStaff((data ?? []).map((row) => ({ id: row.id, name: row.name })));
    }
    setLoading(false);
  }, [groomerProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRemove(member: Staff) {
    const confirmed = await confirmAsync(
      'Remove groomer',
      `Remove ${member.name}? Existing bookings with them stay, but customers can no longer choose them.`
    );
    if (!confirmed) return;

    // Deactivate rather than delete so past bookings keep their staff reference.
    const { error: updateError } = await supabase.from('salon_staff').update({ active: false }).eq('id', member.id);
    if (updateError) {
      notify('Could not remove', updateError.message);
      return;
    }
    setStaff((current) => current.filter((s) => s.id !== member.id));
  }

  async function handleAdd() {
    if (!groomerProfile || !newName.trim()) {
      notify('Name required', "Enter the groomer's name first.");
      return;
    }

    setAdding(true);
    const { data, error: insertError } = await supabase
      .from('salon_staff')
      .insert({ salon_id: groomerProfile.id, name: newName.trim() })
      .select('id, name')
      .single();
    setAdding(false);

    if (insertError || !data) {
      notify('Could not add groomer', insertError?.message ?? 'Something went wrong.');
      return;
    }

    setStaff((current) => [...current, { id: data.id, name: data.name }]);
    setNewName('');
    setShowAddForm(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>
      <Text style={styles.title}>Groomers</Text>
      <Text style={styles.subtitle}>
        Add the groomers who work at your salon. Customers can then request a specific groomer, and
        the booking calendar only offers times that groomer is free.
      </Text>

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}
      {error && <Text style={styles.error}>Couldn&apos;t load groomers: {error}</Text>}

      {!loading && !error && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.addToggle} onPress={() => setShowAddForm((v) => !v)}>
            <Text style={styles.addToggleText}>{showAddForm ? 'Cancel' : '+ Add groomer'}</Text>
          </Pressable>

          {showAddForm && (
            <View style={styles.addForm}>
              <TextInput
                style={styles.input}
                placeholder="Groomer's name"
                placeholderTextColor={Colors.light.textMuted}
                value={newName}
                onChangeText={setNewName}
                autoFocus
              />
              <Pressable style={styles.saveButton} onPress={handleAdd} disabled={adding}>
                {adding ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          )}

          {staff.length === 0 && !showAddForm && (
            <Text style={styles.emptyText}>
              No groomers added yet. Until you add some, bookings apply to the salon as a whole.
            </Text>
          )}

          {staff.map((member) => (
            <View key={member.id} style={styles.card}>
              <Text style={styles.cardName}>{member.name}</Text>
              <Pressable onPress={() => handleRemove(member)}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: 20,
  },
  topRow: {
    flexDirection: 'row',
  },
  backLink: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  title: {
    marginTop: 12,
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textMuted,
  },
  loading: {
    marginTop: 40,
  },
  error: {
    marginTop: 24,
    fontSize: 15,
    color: Colors.light.danger,
  },
  content: {
    paddingTop: 24,
    paddingBottom: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 21,
    color: Colors.light.textMuted,
  },
  addToggle: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  addToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  addForm: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    gap: 10,
  },
  input: {
    fontSize: 14,
    color: Colors.light.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.light.background,
  },
  saveButton: {
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.tint,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  removeText: {
    fontSize: 13,
    color: Colors.light.textMuted,
    textDecorationLine: 'underline',
  },
});
