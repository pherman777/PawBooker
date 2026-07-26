import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { retrieveAddress, suggestAddresses, type AddressSuggestion } from '@/services/mapbox';

export type SelectedLocation = {
  label: string;
  latitude: number;
  longitude: number;
};

type Props = {
  onSelect: (location: SelectedLocation) => void;
};

const DEBOUNCE_MS = 300;

export function AddressSearchInput({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const sessionTokenRef = useRef(Crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    if (query.trim().length < 3) {
      setSuggestions([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await suggestAddresses(query, sessionTokenRef.current);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setSearched(true);
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function handleSelectSuggestion(suggestion: AddressSuggestion) {
    const resolved = await retrieveAddress(suggestion.id, sessionTokenRef.current);
    if (!resolved) return;

    skipNextSearchRef.current = true;
    setQuery(resolved.formattedAddress);
    setSuggestions([]);
    setSearched(false);
    sessionTokenRef.current = Crypto.randomUUID();
    onSelect({
      label: resolved.formattedAddress,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    });
  }

  function handleUseZipAsTyped() {
    const zipMatch = query.match(/\d{5}/);
    if (!zipMatch) return;
    handleUseZip(zipMatch[0]);
  }

  async function handleUseZip(zip: string) {
    const resolved = await retrieveZipCentroid(zip);
    if (!resolved) return;

    setSuggestions([]);
    setSearched(false);
    onSelect({ label: `Near ${zip}`, latitude: resolved.latitude, longitude: resolved.longitude });
  }

  async function retrieveZipCentroid(zip: string) {
    const results = await suggestAddresses(zip, sessionTokenRef.current);
    const zipSuggestion = results[0];
    if (!zipSuggestion) return null;
    return retrieveAddress(zipSuggestion.id, sessionTokenRef.current);
  }

  const showNoResults = searched && !loading && suggestions.length === 0;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Search by address or zip code"
        placeholderTextColor={Colors.light.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}

      {!loading && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.id}
              style={styles.suggestionRow}
              onPress={() => handleSelectSuggestion(suggestion)}>
              <Text style={styles.suggestionName}>{suggestion.name}</Text>
              <Text style={styles.suggestionDetail}>{suggestion.placeFormatted}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {showNoResults && (
        <View style={styles.dropdown}>
          <Text style={styles.noResultsText}>No address found</Text>
          {/\d{5}/.test(query) ? (
            <Pressable style={styles.suggestionRow} onPress={handleUseZipAsTyped}>
              <Text style={styles.suggestionName}>Search near {query.match(/\d{5}/)?.[0]}</Text>
              <Text style={styles.suggestionDetail}>Use this zip code instead</Text>
            </Pressable>
          ) : (
            <Text style={styles.noResultsHint}>Try entering just your zip code.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 10,
  },
  input: {
    height: 46,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Colors.light.text,
  },
  loading: {
    position: 'absolute',
    right: 14,
    top: 12,
  },
  dropdown: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  suggestionName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  suggestionDetail: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  noResultsText: {
    paddingHorizontal: 14,
    paddingTop: 10,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  noResultsHint: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
});
