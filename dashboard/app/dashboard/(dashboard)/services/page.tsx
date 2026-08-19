'use client';

import { Scissors } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type Service = {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  description: string;
};

function dollarsToCents(text: string): number {
  const n = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function toInt(text: string): number {
  const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export default function ServicesPage() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    const { data, error: queryError } = await supabase
      .from('groomer_services')
      .select('id, name, price_cents, duration_minutes, description')
      .eq('groomer_id', groomerProfile.id)
      .order('name', { ascending: true });

    if (queryError) {
      setError(queryError.message);
    } else {
      setServices(
        (data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          priceCents: row.price_cents,
          durationMinutes: row.duration_minutes,
          description: row.description ?? '',
        }))
      );
    }
    setLoading(false);
  }, [groomerProfile]);

  // The RN screen re-fetches on useFocusEffect (tab focus). There's no
  // equivalent "focus" event in a plain Next.js page - a fresh mount on
  // navigation covers the same case.
  useEffect(() => {
    load();
  }, [load]);

  function updateLocal(id: string, field: 'priceCents' | 'durationMinutes', value: number) {
    setServices((current) => current.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }

  function updateLocalDescription(id: string, value: string) {
    setServices((current) => current.map((s) => (s.id === id ? { ...s, description: value } : s)));
  }

  async function persistField(id: string, field: 'price_cents' | 'duration_minutes', value: number) {
    const { error: updateError } = await supabase
      .from('groomer_services')
      .update({ [field]: value })
      .eq('id', id);
    if (updateError) {
      window.alert(`Could not save\n\n${updateError.message}`);
    }
  }

  async function persistDescription(id: string, value: string) {
    const { error: updateError } = await supabase
      .from('groomer_services')
      .update({ description: value.trim() || null })
      .eq('id', id);
    if (updateError) {
      window.alert(`Could not save\n\n${updateError.message}`);
    }
  }

  async function handleDelete(service: Service) {
    const confirmed = window.confirm(`Remove service\n\nRemove "${service.name}" from your services?`);
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from('groomer_services').delete().eq('id', service.id);
    if (deleteError) {
      window.alert(`Could not remove\n\n${deleteError.message}`);
      return;
    }
    setServices((current) => current.filter((s) => s.id !== service.id));
  }

  async function handleAdd() {
    if (!groomerProfile || !newName.trim()) {
      window.alert('Name required\n\nGive the service a name first.');
      return;
    }
    const priceCents = dollarsToCents(newPrice);
    const durationMinutes = toInt(newDuration);
    if (priceCents <= 0) {
      window.alert('Price required\n\nEnter a price greater than $0.');
      return;
    }
    if (durationMinutes <= 0) {
      window.alert('Duration required\n\nEnter how long the service takes, in minutes.');
      return;
    }

    setAdding(true);
    const { data, error: insertError } = await supabase
      .from('groomer_services')
      .insert({
        groomer_id: groomerProfile.id,
        name: newName.trim(),
        price_cents: priceCents,
        duration_minutes: durationMinutes,
        description: newDescription.trim() || null,
      })
      .select('id, name, price_cents, duration_minutes, description')
      .single();
    setAdding(false);

    if (insertError || !data) {
      window.alert(`Could not add service\n\n${insertError?.message ?? 'Something went wrong.'}`);
      return;
    }

    setServices((current) => [
      ...current,
      {
        id: data.id,
        name: data.name,
        priceCents: data.price_cents,
        durationMinutes: data.duration_minutes,
        description: data.description ?? '',
      },
    ]);
    setNewName('');
    setNewPrice('');
    setNewDuration('');
    setNewDescription('');
    setShowAddForm(false);
  }

  return (
    <div className="settings-page width-content">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Services</h1>
      <p className={styles.subtitle}>
        The services customers can book, with prices and how long each takes. You can update prices any time.
      </p>

      {loading && <span className="spinner" aria-hidden style={{ marginTop: 24 }} />}
      {error && <p className={styles.error}>Couldn&apos;t load services: {error}</p>}

      {!loading && !error && (
        <>
          <button className={styles.addToggle} onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? 'Cancel' : '+ Add service'}
          </button>

          {showAddForm && (
            <div className={`card ${styles.addForm}`}>
              <input
                className="field-input"
                placeholder="Name (e.g. Full groom - small dog)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <div className={styles.inputRow}>
                <input
                  className={`field-input ${styles.inputHalf}`}
                  placeholder="Price ($)"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  inputMode="decimal"
                />
                <input
                  className={`field-input ${styles.inputHalf}`}
                  placeholder="Minutes"
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <textarea
                className="field-input"
                placeholder="Description (optional) — what this service includes"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
              <Button label="Save" onClick={handleAdd} loading={adding} />
            </div>
          )}

          {services.length === 0 && !showAddForm && (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIllustration}>
                <Scissors size={38} strokeWidth={1.6} />
              </div>
              <p className={styles.emptyTitle}>No services yet</p>
              <p className={styles.emptyBody}>
                Add your first one so customers have something to book — pricing and duration only take a minute.
              </p>
              <Button label="+ Add service" onClick={() => setShowAddForm(true)} />
            </div>
          )}

          <div className={styles.list}>
            {services.map((service) => (
              <div key={service.id} className={`card ${styles.card}`}>
                <p className={styles.cardName}>{service.name}</p>
                <div className={styles.fieldsRow}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Price ($)</label>
                    <input
                      className={styles.fieldInput}
                      defaultValue={centsToDollars(service.priceCents)}
                      inputMode="decimal"
                      onChange={(e) => updateLocal(service.id, 'priceCents', dollarsToCents(e.target.value))}
                      onBlur={() => persistField(service.id, 'price_cents', service.priceCents)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Duration (min)</label>
                    <input
                      className={styles.fieldInput}
                      value={String(service.durationMinutes)}
                      inputMode="numeric"
                      onChange={(e) => updateLocal(service.id, 'durationMinutes', toInt(e.target.value))}
                      onBlur={() => persistField(service.id, 'duration_minutes', service.durationMinutes)}
                    />
                  </div>
                </div>
                <label className={`${styles.fieldLabel} ${styles.descriptionLabel}`}>Description (optional)</label>
                <textarea
                  className={`${styles.fieldInput} ${styles.descriptionInput}`}
                  defaultValue={service.description}
                  placeholder="What this service includes"
                  onChange={(e) => updateLocalDescription(service.id, e.target.value)}
                  onBlur={() => persistDescription(service.id, service.description)}
                />
                <button className={styles.deleteLink} onClick={() => handleDelete(service)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
