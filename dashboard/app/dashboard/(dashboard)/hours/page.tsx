'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/Button';
import { Toggle } from '@/components/Toggle';
import { useAuth } from '@/lib/auth';
import { DAYS_OF_WEEK, dayLabel, type GroomerHours } from '@/lib/hours';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type DayDraft = {
  enabled: boolean;
  open: string;
  close: string;
};

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '17:00';

export default function HoursPage() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, DayDraft>>({});

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('groomers')
        .select('hours')
        .eq('id', groomerProfile!.id)
        .single();
      if (cancelled) return;

      const hours = (data?.hours ?? null) as GroomerHours | null;
      const initial: Record<string, DayDraft> = {};
      for (const day of DAYS_OF_WEEK) {
        const existing = hours?.[day];
        initial[day] = existing
          ? { enabled: true, open: existing.open, close: existing.close }
          : { enabled: false, open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
      }
      setDraft(initial);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  function setDay(day: string, patch: Partial<DayDraft>) {
    setDraft((current) => ({ ...current, [day]: { ...current[day], ...patch } }));
  }

  async function handleSave() {
    if (!groomerProfile) return;

    const hours: Record<string, { open: string; close: string } | null> = {};
    for (const day of DAYS_OF_WEEK) {
      const entry = draft[day];
      if (!entry?.enabled) {
        hours[day] = null;
        continue;
      }
      // Values come from <input type="time">, so they're already valid HH:MM;
      // just guard that closing is after opening (string compare works for
      // zero-padded 24h).
      if (entry.open >= entry.close) {
        window.alert(
          `Check your times\n\nClosing time must be after opening time on ${dayLabel(day as keyof GroomerHours)}.`
        );
        return;
      }
      hours[day] = { open: entry.open, close: entry.close };
    }

    setSaving(true);
    const { error } = await supabase.from('groomers').update({ hours }).eq('id', groomerProfile.id);
    setSaving(false);

    if (error) {
      window.alert(`Could not save\n\n${error.message}`);
      return;
    }
    window.alert('Saved\n\nYour hours have been updated.');
    router.back();
  }

  return (
    <div className="settings-page width-form">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Hours</h1>
      <p className="page-subtitle">Turn on the days you&apos;re open and set your hours.</p>

      {loading ? (
        <span className="spinner" aria-hidden />
      ) : (
        <>
          {DAYS_OF_WEEK.map((day) => {
            const entry = draft[day];
            return (
              <div key={day} className={styles.dayRow}>
                <div className={styles.dayHeader}>
                  <span className={styles.dayLabel}>{dayLabel(day)}</span>
                  <Toggle checked={entry?.enabled ?? false} onChange={(value) => setDay(day, { enabled: value })} />
                </div>
                {entry?.enabled && (
                  <div className={styles.timesRow}>
                    {/* The RN app uses a custom TimePickerModal (@/components/TimePickerModal);
                        a native <input type="time"> covers the same open/close entry on web
                        with far less code, and its value is already HH:MM (24h), matching the
                        stored format exactly. */}
                    <input
                      type="time"
                      className={styles.timeField}
                      value={entry.open}
                      onChange={(e) => setDay(day, { open: e.target.value })}
                    />
                    <span className={styles.toLabel}>to</span>
                    <input
                      type="time"
                      className={styles.timeField}
                      value={entry.close}
                      onChange={(e) => setDay(day, { close: e.target.value })}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <Button label="Save" onClick={handleSave} loading={saving} style={{ marginTop: 28 }} />
        </>
      )}
    </div>
  );
}
