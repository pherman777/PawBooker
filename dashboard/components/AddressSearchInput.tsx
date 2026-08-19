'use client';

import { useEffect, useRef, useState } from 'react';

import { retrieveAddress, suggestAddresses, type AddressSuggestion } from '@/lib/mapbox';

import styles from './AddressSearchInput.module.css';

export type SelectedLocation = {
  label: string;
  latitude: number;
  longitude: number;
  zipCode?: string;
  city?: string;
  state?: string;
};

type Props = {
  onSelect: (location: SelectedLocation) => void;
  onClear?: () => void;
};

const DEBOUNCE_MS = 300;

// Ported from components/AddressSearchInput.tsx - same Mapbox Search Box flow
// (debounced suggest, retrieve-on-select, zip fallback when nothing matches),
// a dropdown instead of a bottom-sheet-style list since this is a normal text
// field on a form. Fixes the gap that left a web-signed-up groomer with no
// latitude/longitude (invisible to nearby search in the app) - see
// lib/groomer.ts and app/sign-up, business-info/page.tsx for the callers.
export function AddressSearchInput({ onSelect, onClear }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const sessionTokenRef = useRef(crypto.randomUUID());
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
    sessionTokenRef.current = crypto.randomUUID();
    onSelect({
      label: resolved.formattedAddress,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      zipCode: resolved.postcode,
      city: resolved.city,
      state: resolved.state,
    });
  }

  function handleUseZipAsTyped() {
    const zipMatch = query.match(/\d{5}/);
    if (!zipMatch) return;
    handleUseZip(zipMatch[0]);
  }

  async function handleUseZip(zip: string) {
    const results = await suggestAddresses(zip, sessionTokenRef.current);
    const zipSuggestion = results[0];
    if (!zipSuggestion) return;
    const resolved = await retrieveAddress(zipSuggestion.id, sessionTokenRef.current);
    if (!resolved) return;

    setSuggestions([]);
    setSearched(false);
    onSelect({
      label: `Near ${zip}`,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      zipCode: resolved.postcode ?? zip,
      city: resolved.city,
      state: resolved.state,
    });
  }

  const showNoResults = searched && !loading && suggestions.length === 0;

  function handleClear() {
    setQuery('');
    setSuggestions([]);
    setSearched(false);
    onClear?.();
  }

  return (
    <div className={styles.container}>
      <input
        className="field-input"
        placeholder="Search by address or zip code"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
      />

      {loading && <span className={`${styles.loading} spinner`} aria-hidden />}

      {!loading && query.length > 0 && (
        <button type="button" className={styles.clearButton} onClick={handleClear} aria-label="Clear">
          ✕
        </button>
      )}

      {!loading && suggestions.length > 0 && (
        <div className={styles.dropdown}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              className={styles.suggestionRow}
              onClick={() => handleSelectSuggestion(suggestion)}>
              <p className={styles.suggestionName}>{suggestion.name}</p>
              <p className={styles.suggestionDetail}>{suggestion.placeFormatted}</p>
            </button>
          ))}
        </div>
      )}

      {showNoResults && (
        <div className={styles.dropdown}>
          <p className={styles.noResultsText}>No address found</p>
          {/\d{5}/.test(query) ? (
            <button type="button" className={styles.suggestionRow} onClick={handleUseZipAsTyped}>
              <p className={styles.suggestionName}>Search near {query.match(/\d{5}/)?.[0]}</p>
              <p className={styles.suggestionDetail}>Use this zip code instead</p>
            </button>
          ) : (
            <p className={styles.noResultsHint}>Try entering just your zip code.</p>
          )}
        </div>
      )}
    </div>
  );
}
