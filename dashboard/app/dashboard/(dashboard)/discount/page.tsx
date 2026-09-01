'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/Button';
import { Toggle } from '@/components/Toggle';
import { useAuth } from '@/lib/auth';
import { parseMultiPetDiscount } from '@/lib/discount';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

const MIN_PET_OPTIONS = [2, 3, 4, 5];

export default function DiscountPage() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [minPets, setMinPets] = useState(3);
  const [type, setType] = useState<'percent' | 'flat'>('percent');
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('groomers')
        .select('multi_pet_discount')
        .eq('id', groomerProfile!.id)
        .single();
      if (cancelled) return;

      const rule = parseMultiPetDiscount(data?.multi_pet_discount);
      if (rule) {
        setEnabled(true);
        setMinPets(rule.minPets);
        setType(rule.type);
        // Flat is stored in cents; show it in dollars.
        setValue(rule.type === 'percent' ? String(rule.value) : (rule.value / 100).toFixed(0));
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  async function handleSave() {
    if (!groomerProfile) return;

    let payload: { min_pets: number; type: 'percent' | 'flat'; value: number } | null = null;

    if (enabled) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        window.alert('Check your discount\n\nEnter a discount amount greater than zero.');
        return;
      }
      if (type === 'percent' && numeric > 100) {
        window.alert("Check your discount\n\nA percentage discount can't be more than 100%.");
        return;
      }
      payload = {
        min_pets: minPets,
        type,
        // Store flat discounts in cents to match the rest of our money handling.
        value: type === 'percent' ? Math.round(numeric) : Math.round(numeric * 100),
      };
    }

    setSaving(true);
    const { error } = await supabase
      .from('groomers')
      .update({ multi_pet_discount: payload })
      .eq('id', groomerProfile.id);
    setSaving(false);

    if (error) {
      window.alert(`Could not save\n\n${error.message}`);
      return;
    }
    window.alert(enabled ? 'Saved\n\nYour multi-pet discount is live.' : 'Saved\n\nMulti-pet discount turned off.');
    router.back();
  }

  return (
    <div className="settings-page width-form">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Multi-pet discount</h1>
      <p className="page-subtitle">
        Reward customers who bring more than one pet at once. You set the rule — it applies automatically when they
        book a group, and you can still adjust any invoice at checkout.
      </p>

      {loading ? (
        <span className="spinner" aria-hidden />
      ) : (
        <>
          <div className={styles.enableRow}>
            <span className={styles.enableLabel}>Offer a multi-pet discount</span>
            <Toggle checked={enabled} onChange={setEnabled} />
          </div>

          {enabled && (
            <>
              <p className={styles.sectionTitle}>Applies when a customer books at least</p>
              <div className={styles.chipRow}>
                {MIN_PET_OPTIONS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={`${styles.chip} ${minPets === count ? styles.chipSelected : ''}`}
                    onClick={() => setMinPets(count)}
                  >
                    {count} pets
                  </button>
                ))}
              </div>

              <p className={styles.sectionTitle}>Discount type</p>
              <div className={styles.chipRow}>
                <button
                  type="button"
                  className={`${styles.chip} ${type === 'percent' ? styles.chipSelected : ''}`}
                  onClick={() => setType('percent')}
                >
                  Percentage off
                </button>
                <button
                  type="button"
                  className={`${styles.chip} ${type === 'flat' ? styles.chipSelected : ''}`}
                  onClick={() => setType('flat')}
                >
                  Dollar amount off
                </button>
              </div>

              <p className={styles.sectionTitle}>Amount</p>
              <div className={styles.amountRow}>
                {type === 'flat' && <span className={styles.amountAffix}>$</span>}
                <input
                  type="number"
                  inputMode="decimal"
                  className={`field-input ${styles.amountInput}`}
                  placeholder={type === 'percent' ? '10' : '15'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                {type === 'percent' && <span className={styles.amountAffix}>%</span>}
              </div>
              <p className={styles.helper}>
                {type === 'percent'
                  ? `e.g. 10% off the whole visit when ${minPets}+ pets come in.`
                  : `e.g. $15 off the whole visit when ${minPets}+ pets come in.`}
              </p>
            </>
          )}

          <Button label="Save" onClick={handleSave} loading={saving} style={{ marginTop: 32 }} />
        </>
      )}
    </div>
  );
}
