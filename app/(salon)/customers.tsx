import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { fetchGroomerCustomers, type CustomerSummary } from '@/services/customers';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';

function initials(label: string): string {
  return label
    .split(/[\s@.]/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function CustomersScreen() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const rows = await fetchGroomerCustomers(query.trim());
        if (!cancelled) setCustomers(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timeout = setTimeout(load, query ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [groomerProfile, query]);

  return (
    <SafeAreaView style={[styles.container, webContentWidth('content')]} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>
      <Text style={styles.title}>Customers</Text>
      <Text style={styles.subtitle}>Everyone linked to your salon - a redeemed invite code or a past booking.</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by name or email"
        placeholderTextColor={Colors.light.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}
      {error && <Text style={styles.error}>Couldn&apos;t load customers: {error}</Text>}

      {!loading && !error && (
        <FlatList
          showsVerticalScrollIndicator={false}
          data={customers}
          keyExtractor={(item) => item.customerId}
          style={webFlushScroll}
          contentContainerStyle={[styles.list, webContentWidth('content')]}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: '/(salon)/customer/[customerId]', params: { customerId: item.customerId } })}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(item.name || item.email)}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowName}>{item.name || item.email}</Text>
                {item.name && <Text style={styles.rowSub}>{item.email}</Text>}
              </View>
              <Text style={styles.rowMeta}>
                {item.pets.length === 0 ? 'No pets yet' : `${item.pets.length} pet${item.pets.length > 1 ? 's' : ''}`}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.light.textMuted} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <View style={styles.emptyIllustration}>
                <Ionicons name="people-outline" size={34} color={Colors.light.tint} />
              </View>
              <Text style={styles.emptyTitle}>{query ? 'No matches' : 'No customers yet'}</Text>
              <Text style={styles.emptyBody}>
                {query
                  ? 'Try a different name or email.'
                  : 'Customers show up here once they redeem your invite code or book with you.'}
              </Text>
            </View>
          }
        />
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
  searchInput: {
    marginTop: 16,
    height: 46,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.light.text,
  },
  loading: {
    marginTop: 40,
  },
  error: {
    marginTop: 24,
    fontSize: 15,
    color: Colors.light.danger,
  },
  list: {
    paddingTop: 16,
    paddingBottom: 40,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.light.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.tint,
  },
  rowBody: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  rowSub: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  rowMeta: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.light.border,
    borderRadius: 20,
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIllustration: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(107,143,114,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
});
