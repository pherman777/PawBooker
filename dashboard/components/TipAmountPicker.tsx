'use client';

import { useEffect, useState } from 'react';

import styles from './TipAmountPicker.module.css';

type Props = {
  subtotalCents: number;
  onChange: (tipAmountCents: number) => void;
};

const PRESET_PERCENTAGES = [15, 20, 25];

export function TipAmountPicker({ subtotalCents, onChange }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom' | null>(null);
  const [customAmount, setCustomAmount] = useState('');

  const tipAmountCents =
    selectedPreset === 'custom'
      ? Math.round((parseFloat(customAmount) || 0) * 100)
      : selectedPreset != null
        ? Math.round((subtotalCents * selectedPreset) / 100)
        : 0;

  useEffect(() => {
    onChange(tipAmountCents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipAmountCents]);

  return (
    <div>
      <div className={styles.presetRow}>
        {PRESET_PERCENTAGES.map((pct) => (
          <button
            key={pct}
            type="button"
            className={`${styles.presetChip} ${selectedPreset === pct ? styles.presetChipSelected : ''}`}
            onClick={() => setSelectedPreset(pct)}>
            <span className={styles.presetChipPct}>{pct}%</span>
            <span className={styles.presetChipAmount}>${((subtotalCents * pct) / 100 / 100).toFixed(2)}</span>
          </button>
        ))}
        <button
          type="button"
          className={`${styles.presetChip} ${selectedPreset === 'custom' ? styles.presetChipSelected : ''}`}
          onClick={() => setSelectedPreset('custom')}>
          <span className={styles.presetChipPct}>Custom</span>
        </button>
      </div>

      {selectedPreset === 'custom' && (
        <div className={styles.customRow}>
          <span className={styles.customDollarSign}>$</span>
          <input
            className={styles.customInput}
            placeholder="0.00"
            inputMode="decimal"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
