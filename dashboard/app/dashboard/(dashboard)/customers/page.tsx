'use client';

import { Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { fetchGroomerCustomers, type CustomerSummary } from '@/lib/customers';

import styles from './page.module.css';

function initials(label: string) {
  return label
    .split(/[\s@.]/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function CustomersPage() {
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
    <div className="settings-page width-content">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Customers</h1>
      <p className="page-subtitle">Everyone who&apos;s linked to your salon - a redeemed invite code or a past booking.</p>

      <input
        className="field-input"
        placeholder="Search by name or email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 20 }}
      />

      {loading && <span className="spinner" aria-hidden />}
      {error && <p className={styles.error}>Couldn&apos;t load customers: {error}</p>}

      {!loading && !error && customers.length === 0 && (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIllustration}>
            <Users size={38} strokeWidth={1.6} />
          </div>
          <p className={styles.emptyTitle}>{query ? 'No matches' : 'No customers yet'}</p>
          <p className={styles.emptyBody}>
            {query
              ? 'Try a different name or email.'
              : 'Customers show up here once they redeem your invite code or book with you.'}
          </p>
        </div>
      )}

      {!loading && !error && customers.length > 0 && (
        <div className={styles.list}>
          {customers.map((c) => (
            <Link key={c.customerId} href={`/dashboard/customers/${c.customerId}`} className={`card ${styles.row}`}>
              <div className={styles.rowLeft}>
                <div className={styles.avatar}>{initials(c.name || c.email)}</div>
                <div>
                  <p className={styles.rowName}>{c.name || c.email}</p>
                  {c.name && <p className={styles.rowSub}>{c.email}</p>}
                </div>
              </div>
              <span className={styles.rowMeta}>
                {c.pets.length === 0 ? 'No pets yet' : `${c.pets.length} pet${c.pets.length > 1 ? 's' : ''}`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
