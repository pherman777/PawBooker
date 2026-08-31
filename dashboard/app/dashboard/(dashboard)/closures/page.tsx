'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type Closure = { id: string; start_date: string; end_date: string; note: string | null };

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ClosuresPage() {
  const { groomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [closures, setClosures] = useState<Closure[]>([]);

  const [adding, setAdding] = useState(false);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('groomer_closures')
        .select('id, start_date, end_date, note')
        .eq('groomer_id', groomerProfile!.id)
        .gte('end_date', todayKey())
        .order('start_date', { ascending: true });
      if (cancelled) return;
      setClosures(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  async function handleAdd() {
    if (!groomerProfile || !draftStart) return;
    const end = draftEnd || draftStart;
    if (end < draftStart) {
      window.alert('Check your dates\n\nThe end date must be on or after the start date.');
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('groomer_closures')
      .insert({
        groomer_id: groomerProfile.id,
        start_date: draftStart,
        end_date: end,
        note: draftNote.trim() || null,
      })
      .select('id, start_date, end_date, note')
      .single();
    setSaving(false);

    if (error || !data) {
      window.alert(`Could not add closure\n\n${error?.message ?? 'Please try again.'}`);
      return;
    }

    setClosures((prev) => [...prev, data].sort((a, b) => a.start_date.localeCompare(b.start_date)));
    setAdding(false);
    setDraftStart('');
    setDraftEnd('');
    setDraftNote('');
  }

  async function handleDelete(closure: Closure) {
    const confirmed = window.confirm(
      `Remove this closure?\n\n${formatDate(closure.start_date)}${closure.end_date !== closure.start_date ? ` – ${formatDate(closure.end_date)}` : ''} will show as open again.`
    );
    if (!confirmed) return;

    const { error } = await supabase.from('groomer_closures').delete().eq('id', closure.id);
    if (error) {
      window.alert(`Could not remove closure\n\n${error.message}`);
      return;
    }
    setClosures((prev) => prev.filter((c) => c.id !== closure.id));
  }

  return (
    <div className="settings-page width-form">
      <h1 className="page-title">Closures</h1>
      <p className="page-subtitle">
        Mark holidays, vacation, or other days off. These override your regular hours - customers won&apos;t be able to
        book, and the AI assistants won&apos;t offer these dates.
      </p>

      {loading ? (
        <span className="spinner" aria-hidden />
      ) : (
        <>
          {closures.length === 0 && !adding && <p className={styles.emptyText}>No upcoming closures.</p>}

          {closures.map((closure) => (
            <div key={closure.id} className={styles.closureRow}>
              <div>
                <div className={styles.closureDates}>
                  {formatDate(closure.start_date)}
                  {closure.end_date !== closure.start_date ? ` – ${formatDate(closure.end_date)}` : ''}
                </div>
                {closure.note && <div className={styles.closureNote}>{closure.note}</div>}
              </div>
              <button className={styles.removeLink} onClick={() => handleDelete(closure)}>
                Remove
              </button>
            </div>
          ))}

          {adding ? (
            <div className={styles.addForm}>
              <label className={styles.fieldLabel}>From</label>
              <input
                type="date"
                className={styles.dateField}
                value={draftStart}
                min={todayKey()}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraftStart(value);
                  if (!draftEnd || draftEnd < value) setDraftEnd(value);
                }}
              />

              <label className={styles.fieldLabel}>To</label>
              <input
                type="date"
                className={styles.dateField}
                value={draftEnd}
                min={draftStart || todayKey()}
                disabled={!draftStart}
                onChange={(e) => setDraftEnd(e.target.value)}
              />

              <label className={styles.fieldLabel}>Note (optional)</label>
              <input
                type="text"
                className={styles.noteField}
                placeholder="e.g. Vacation, Holiday"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
              />

              <div className={styles.addFormButtons}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onClick={() => {
                    setAdding(false);
                    setDraftStart('');
                    setDraftEnd('');
                    setDraftNote('');
                  }}
                  style={{ flex: 1 }}
                />
                <Button label="Save" onClick={handleAdd} loading={saving} disabled={!draftStart} style={{ flex: 1 }} />
              </div>
            </div>
          ) : (
            <Button label="+ Add a closure" variant="secondary" onClick={() => setAdding(true)} style={{ marginTop: 8 }} />
          )}
        </>
      )}
    </div>
  );
}
