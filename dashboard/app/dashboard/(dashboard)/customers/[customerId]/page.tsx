'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import {
  fetchCustomerBookingHistory,
  fetchCustomerPetDetails,
  fetchGroomerCustomers,
  type CustomerBookingHistoryRow,
  type CustomerPetDetail,
  type CustomerSummary,
} from '@/lib/customers';
import { getOrCreateGroomerThread } from '@/lib/groomerChat';

import styles from './page.module.css';

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const { customerId } = useParams<{ customerId: string }>();
  const { groomerProfile } = useAuth();

  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [pets, setPets] = useState<CustomerPetDetail[]>([]);
  const [bookings, setBookings] = useState<CustomerBookingHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);

  async function handleMessage() {
    if (!groomerProfile) return;
    setMessaging(true);
    try {
      const threadId = await getOrCreateGroomerThread(customerId, groomerProfile.id);
      router.push(`/dashboard/messages/${threadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start conversation');
    } finally {
      setMessaging(false);
    }
  }

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [customers, petDetails, history] = await Promise.all([
          fetchGroomerCustomers(''),
          fetchCustomerPetDetails(customerId),
          fetchCustomerBookingHistory(groomerProfile!.id, customerId),
        ]);
        if (cancelled) return;
        setCustomer(customers.find((c) => c.customerId === customerId) ?? null);
        setPets(petDetails);
        setBookings(history);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile, customerId]);

  return (
    <div className="settings-page width-content">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>

      {loading && <span className="spinner" aria-hidden />}
      {error && <p className={styles.error}>Couldn&apos;t load this customer: {error}</p>}

      {!loading && !error && !customer && <p className={styles.error}>Customer not found.</p>}

      {!loading && !error && customer && (
        <>
          <h1 className="page-title">{customer.name || customer.email}</h1>
          <p className="page-subtitle">
            {customer.name ? customer.email : 'No name on file yet'}
            {customer.phone ? ` · ${customer.phone}` : ''}
          </p>

          <Button label="Message this customer" variant="secondary" onClick={handleMessage} loading={messaging} />

          <p className={styles.sectionTitle}>Pets</p>
          {pets.length === 0 && <p className={styles.emptyText}>No pets on file.</p>}
          {pets.map((p) => (
            <div key={p.id} className={`card ${styles.petCard}`}>
              <p className={styles.petName}>{p.name}</p>
              <p className={styles.petMeta}>
                {p.species[0].toUpperCase() + p.species.slice(1)}
                {p.breed ? ` · ${p.breed}` : ''}
                {p.color ? ` · ${p.color}` : ''}
                {p.weightLbs ? ` · ${p.weightLbs} lbs` : ''}
              </p>
              {(p.isMicrochipped || p.vetName || p.vetPhone) && (
                <p className={styles.petCare}>
                  {p.isMicrochipped && `Microchipped${p.microchipNumber ? ` · ${p.microchipNumber}` : ''}`}
                  {p.isMicrochipped && (p.vetName || p.vetPhone) ? ' · ' : ''}
                  {p.vetName ? `Vet: ${p.vetName}` : ''}
                  {p.vetPhone ? ` (${p.vetPhone})` : ''}
                </p>
              )}
            </div>
          ))}

          <p className={`${styles.sectionTitle} ${styles.sectionSpacing}`}>Booking history</p>
          {bookings.length === 0 && <p className={styles.emptyText}>No bookings with this customer yet.</p>}
          {bookings.map((b) => (
            <div key={b.id} className={styles.bookingRow}>
              <div>
                <p className={styles.bookingService}>
                  {b.serviceName} <span className={styles.bookingPet}>for {b.petName}</span>
                </p>
                <p className={styles.bookingWhen}>{formatWhen(b.startsAt)}</p>
              </div>
              <span className={styles.bookingStatus}>{b.status}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
