'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/Button';
import { Toggle } from '@/components/Toggle';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

export default function VaccinationPage() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [required, setRequired] = useState(true);

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('groomers')
        .select('requires_rabies_vaccination')
        .eq('id', groomerProfile!.id)
        .single();
      if (cancelled) return;
      setRequired(data?.requires_rabies_vaccination ?? true);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  async function handleSave() {
    if (!groomerProfile) return;
    setSaving(true);
    const { error } = await supabase
      .from('groomers')
      .update({ requires_rabies_vaccination: required })
      .eq('id', groomerProfile.id);
    setSaving(false);

    if (error) {
      window.alert(`Could not save\n\n${error.message}`);
      return;
    }
    window.alert(
      required
        ? 'Saved\n\nRabies vaccination is now required to book.'
        : 'Saved\n\nRabies vaccination is no longer required to book.'
    );
    router.back();
  }

  return (
    <div className="settings-page width-form">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Vaccination requirement</h1>
      <p className="page-subtitle">
        Require customers to have a current rabies vaccination on file before they can book with you. Not every
        salon requires this — turn it off if you don&apos;t need it.
      </p>

      {loading ? (
        <span className="spinner" aria-hidden />
      ) : (
        <>
          <div className={styles.enableRow}>
            <span className={styles.enableLabel}>Require rabies vaccination to book</span>
            <Toggle checked={required} onChange={setRequired} />
          </div>

          <Button label="Save" onClick={handleSave} loading={saving} style={{ marginTop: 32 }} />
        </>
      )}
    </div>
  );
}
