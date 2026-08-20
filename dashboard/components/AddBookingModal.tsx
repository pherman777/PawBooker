'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { createManualBooking, searchGroomerCustomers, type MatchedCustomer, type MatchedPet } from '@/lib/manualBooking';
import type { SalonStaff } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

import styles from './AddBookingModal.module.css';

type GroomerService = { id: string; name: string };

type Props = {
  visible: boolean;
  staffList: SalonStaff[];
  onDismiss: () => void;
  onCreated: () => void;
};

export function AddBookingModal({ visible, staffList, onDismiss, onCreated }: Props) {
  const { groomerProfile } = useAuth();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<MatchedCustomer[] | null>(null);
  const [customer, setCustomer] = useState<MatchedCustomer | null>(null);
  const [pet, setPet] = useState<MatchedPet | null>(null);

  const [services, setServices] = useState<GroomerService[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetched alongside services so it's ready the instant a search comes up
  // empty - lets a walk-in/caller with no account scan or hear the code
  // without the groomer leaving this modal for the separate Invite page.
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults(null);
      setCustomer(null);
      setPet(null);
      setServiceId('');
      setStaffId('');
      setStartsAt('');
      setSearchError(null);
      setSubmitError(null);
      return;
    }
    if (!groomerProfile) return;
    supabase
      .from('groomer_services')
      .select('id, name')
      .eq('groomer_id', groomerProfile.id)
      .then(({ data }) => setServices(data ?? []));
    supabase
      .from('groomers')
      .select('invite_code')
      .eq('id', groomerProfile.id)
      .single()
      .then(({ data }) => setInviteCode(data?.invite_code ?? null));
  }, [visible, groomerProfile]);

  useEffect(() => {
    if (!inviteCode) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(`https://paw-booker.com/?invite=${inviteCode}`, {
      width: 160,
      margin: 1,
      color: { dark: '#2C302A', light: '#F2F1E9' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [inviteCode]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const matches = await searchGroomerCustomers(query.trim());
      setResults(matches);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit() {
    if (!customer || !pet || !serviceId || !startsAt) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createManualBooking({
        customerId: customer.customerId,
        petId: pet.id,
        serviceId,
        staffId: staffId || null,
        startsAt: new Date(startsAt).toISOString(),
      });
      onCreated();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not create booking.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className={`card ${styles.panel}`} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Add a booking</h3>

        {!customer ? (
          <>
            <p className={styles.hint}>
              Search by the customer&apos;s email. They need a PawBooker account already - if they&apos;re new, share your
              invite code from the <span className={styles.hintLink}>Invite your customers</span> menu item first.
            </p>
            <form className={styles.searchRow} onSubmit={handleSearch}>
              <input
                className="field-input"
                type="email"
                placeholder="customer@email.com"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <Button label="Search" type="submit" loading={searching} />
            </form>
            {searchError && <p className={styles.error}>{searchError}</p>}
            {results && results.length === 0 && (
              <div className={styles.noMatch}>
                <p className={styles.hint}>
                  No customer found with that email. Have them sign up with your code below, then search again once
                  they&apos;ve added a pet.
                </p>
                <div className={styles.inviteRow}>
                  {qrDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt="" width={120} height={120} className={styles.qr} />
                  )}
                  <div>
                    <p className={styles.inviteLabel}>Your invite code</p>
                    <p className={styles.inviteCode}>{inviteCode ?? '—'}</p>
                    <p className={styles.inviteHint}>Walk-in: have them scan the code. Caller: read it out.</p>
                  </div>
                </div>
              </div>
            )}
            {results && results.length > 0 && (
              <div className={styles.resultList}>
                {results.map((r) => (
                  <button key={r.customerId} className={styles.resultRow} onClick={() => setCustomer(r)}>
                    <span className={styles.resultEmail}>{r.name ? `${r.name} · ${r.email}` : r.email}</span>
                    <span className={styles.resultMeta}>
                      {r.pets.length === 0 ? 'No pets yet' : `${r.pets.length} pet${r.pets.length > 1 ? 's' : ''}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.selectedRow}>
              <span className={styles.resultEmail}>{customer.name ? `${customer.name} · ${customer.email}` : customer.email}</span>
              <button className={styles.changeBtn} onClick={() => setCustomer(null)}>
                Change
              </button>
            </div>

            {customer.pets.length === 0 ? (
              <p className={styles.hint}>
                {customer.email} hasn&apos;t added a pet yet. Ask them to add one in the PawBooker app, then try again.
              </p>
            ) : !pet ? (
              <>
                <p className={styles.hint}>Which pet?</p>
                <div className={styles.resultList}>
                  {customer.pets.map((p) => (
                    <button key={p.id} className={styles.resultRow} onClick={() => setPet(p)}>
                      <span className={styles.resultEmail}>{p.name}</span>
                      <span className={styles.resultMeta}>{p.breed ? `${p.breed}` : p.species}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className={styles.selectedRow}>
                  <span className={styles.resultEmail}>{pet.name}</span>
                  <button className={styles.changeBtn} onClick={() => setPet(null)}>
                    Change
                  </button>
                </div>

                <div className={styles.fieldGroup}>
                  <label className="field-label">Service</label>
                  <select className="field-input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                    <option value="">Select a service</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {staffList.length > 0 && (
                  <div className={styles.fieldGroup}>
                    <label className="field-label">Groomer (optional)</label>
                    <select className="field-input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                      <option value="">Unassigned</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={styles.fieldGroup}>
                  <label className="field-label">Date & time</label>
                  <input
                    className="field-input"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>

                {submitError && <p className={styles.error}>{submitError}</p>}

                <Button
                  label="Add booking"
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={!serviceId || !startsAt}
                  block
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
