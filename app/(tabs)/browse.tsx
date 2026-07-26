import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressSearchInput, type SelectedLocation } from '@/components/AddressSearchInput';
import { AppHeader } from '@/components/AppHeader';
import { Colors } from '@/constants/theme';
import { supabase } from '@/services/supabase';
import type { Groomer } from '@/types';
import { distanceInMiles } from '@/utils/geo';

const MAX_DISTANCE_MILES = 50;

export default function BrowseScreen() {
  const router = useRouter();
  const [groomers, setGroomers] = useState<Groomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<SelectedLocation | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGroomers() {
      const { data, error: queryError } = await supabase
        .from('groomers')
        .select(
          'id, name, avatar_url, bio, address, zip_code, latitude, longitude, rating, review_count, groomer_services(id, name, price_cents, duration_minutes)'
        )
        .order('rating', { ascending: false });

      if (cancelled) return;

      if (queryError) {
        setError(queryError.message);
      } else {
        setGroomers(
          (data ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            avatarUrl: row.avatar_url ?? undefined,
            bio: row.bio ?? undefined,
            address: row.address,
            zipCode: row.zip_code ?? undefined,
            latitude: row.latitude ?? undefined,
            longitude: row.longitude ?? undefined,
            rating: row.rating,
            reviewCount: row.review_count,
            priceFromCents: Math.min(
              ...row.groomer_services.map((service) => service.price_cents)
            ),
            services: row.groomer_services.map((service) => ({
              id: service.id,
              name: service.name,
              priceCents: service.price_cents,
              durationMinutes: service.duration_minutes,
            })),
          }))
        );
      }

      setLoading(false);
    }

    loadGroomers();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo<{ groomer: Groomer; distance: number | undefined }[]>(() => {
    if (!location) {
      return groomers.map((groomer) => ({ groomer, distance: undefined }));
    }

    return groomers
      .map((groomer) => ({
        groomer,
        distance:
          groomer.latitude != null && groomer.longitude != null
            ? distanceInMiles(location, { latitude: groomer.latitude, longitude: groomer.longitude })
            : Number.POSITIVE_INFINITY,
      }))
      .filter((row) => row.distance <= MAX_DISTANCE_MILES)
      .sort((a, b) => a.distance - b.distance);
  }, [groomers, location]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="Find a groomer" subtitle="Grooming services near you." />

      <View style={styles.searchWrapper}>
        <AddressSearchInput onSelect={setLocation} />
      </View>

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}

      {error && <Text style={styles.error}>Couldn&apos;t load groomers: {error}</Text>}

      {!loading && !error && (
        <FlatList
          data={rows}
          keyExtractor={({ groomer }) => groomer.id}
          style={styles.flatList}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push({ pathname: '/groomer/[id]', params: { id: item.groomer.id } })}>
              <Text style={styles.cardName}>{item.groomer.name}</Text>
              <Text style={styles.cardAddress}>{item.groomer.address}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardRating}>
                  ★ {item.groomer.rating.toFixed(1)} ({item.groomer.reviewCount})
                  {item.distance != null && Number.isFinite(item.distance)
                    ? ` · ${item.distance.toFixed(1)} mi`
                    : ''}
                </Text>
                <Text style={styles.cardPrice}>
                  from ${(item.groomer.priceFromCents / 100).toFixed(0)}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.subtitle}>
              {location
                ? `No groomers found within ${MAX_DISTANCE_MILES} miles of ${location.label}.`
                : 'No groomers found yet.'}
            </Text>
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
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  searchWrapper: {
    marginTop: 16,
  },
  loading: {
    marginTop: 24,
  },
  error: {
    marginTop: 24,
    fontSize: 15,
    color: Colors.light.danger,
  },
  flatList: {
    flex: 1,
  },
  list: {
    marginTop: 16,
    gap: 12,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
  },
  cardAddress: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  cardFooter: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardRating: {
    fontSize: 14,
    color: Colors.light.text,
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
  },
});
