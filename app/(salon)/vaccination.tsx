import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';
import { notify } from '@/utils/confirm';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

export default function VaccinationScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [required, setRequired] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!groomerProfile) return;
      const { data } = await supabase
        .from('groomers')
        .select('requires_rabies_vaccination')
        .eq('id', groomerProfile.id)
        .single();
      if (cancelled) return;
      setRequired(data?.requires_rabies_vaccination ?? true);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  async function handleSave() {
    if (!groomerProfile) return;
    setSaving(true);
    const { error } = await supabase
      .from('groomers')
      .update({ requires_rabies_vaccination: required })
      .eq('id', groomerProfile.id);
    setSaving(false);

    if (error) {
      notify('Could not save', error.message);
      return;
    }
    notify('Saved', required ? 'Rabies vaccination is now required to book.' : 'Rabies vaccination is no longer required to book.');
    router.back();
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
        <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, webContentWidth('form')]} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>
      <ScrollView style={webFlushScroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, webContentWidth('form')]}>
        <Text style={styles.title}>Vaccination requirement</Text>
        <Text style={styles.subtitle}>
          Require customers to have a current rabies vaccination on file before they can book with
          you. Not every salon requires this — turn it off if you don&apos;t need it.
        </Text>

        <View style={styles.enableRow}>
          <Text style={styles.enableLabel}>Require rabies vaccination to book</Text>
          <Switch value={required} onValueChange={setRequired} trackColor={{ true: Colors.light.tint }} />
        </View>

        <Button label="Save" onPress={handleSave} loading={saving} style={styles.button} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: 20,
  },
  loading: {
    marginTop: 60,
  },
  topRow: {
    flexDirection: 'row',
  },
  backLink: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 20,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textMuted,
  },
  enableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 1,
  },
  enableLabel: {
    flex: 1,
    marginRight: 12,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  button: {
    marginTop: 32,
    width: '100%',
  },
});
