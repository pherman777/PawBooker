'use client';

import { PawPrint } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AddressSearchInput, type SelectedLocation } from '@/components/AddressSearchInput';
import { distanceInMiles } from '@/lib/geo';
import { fetchGroomers, type BrowseGroomer } from '@/lib/groomers';

import styles from './page.module.css';

const MAX_DISTANCE_MILES = 50;

// Port of app/(tabs)/browse.tsx.
export default function BrowsePage() {
  const [groomers, setGroomers] = useState<BrowseGroomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<SelectedLocation | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGroomers()
      .then((rows) => {
        if (!cancelled) setGroomers(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation((current) =>
          current ? current : { label: 'your location', latitude: position.coords.latitude, longitude: position.coords.longitude }
        );
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, []);

  const { rows, noneNearby } = useMemo(() => {
    if (!location) {
      return { rows: groomers.map((groomer) => ({ groomer, distance: undefined as number | undefined })), noneNearby: false };
    }

    const byDistance = groomers
      .map((groomer) => ({
        groomer,
        distance: groomer.latitude != null && groomer.longitude != null ? distanceInMiles(location, { latitude: groomer.latitude, longitude: groomer.longitude }) : Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.distance - b.distance);

    const nearby = byDistance.filter((row) => row.distance <= MAX_DISTANCE_MILES);
    if (nearby.length > 0) return { rows: nearby, noneNearby: false };
    return { rows: byDistance, noneNearby: byDistance.length > 0 };
  }, [groomers, location]);

  return (
    <div>
      <h1 className="page-title">Find a groomer</h1>
      <p className="page-subtitle">Grooming services near you.</p>

      <div className={styles.searchWrapper}>
        <AddressSearchInput onSelect={setLocation} onClear={() => setLocation(null)} />
      </div>

      {noneNearby && (
        <p className={styles.hint}>
          No groomers found within {MAX_DISTANCE_MILES} miles of {location?.label}. Showing all available groomers instead.
        </p>
      )}

      {loading && (
        <div className="page-loading">
          <span className="spinner" aria-hidden />
        </div>
      )}

      {error && <p className="sign-in-error">Couldn&apos;t load groomers: {error}</p>}

      {!loading && !error && (
        <div className={styles.list}>
          {rows.length === 0 && <p className={styles.hint}>No groomers available yet.</p>}
          {rows.map(({ groomer, distance }) => (
            <Link key={groomer.id} href={`/book/groomer/${groomer.id}`} className={`card ${styles.card}`}>
              <div className={styles.avatar}>
                {groomer.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={groomer.avatarUrl} alt="" />
                ) : (
                  <PawPrint size={22} strokeWidth={2} />
                )}
              </div>
              <div className={styles.body}>
                <div className={styles.name}>{groomer.name}</div>
                <div className={styles.address}>{groomer.address}</div>
                <div className={styles.footer}>
                  <span className={styles.rating}>
                    ★ {groomer.rating.toFixed(1)} ({groomer.reviewCount})
                    {distance != null && Number.isFinite(distance) ? ` · ${distance.toFixed(1)} mi` : ''}
                  </span>
                  <span className={styles.price}>from ${(groomer.priceFromCents / 100).toFixed(0)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
