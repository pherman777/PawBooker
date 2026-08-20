'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/Button';

import styles from './TipModal.module.css';

type Props = {
  visible: boolean;
  subtotalCents: number;
  submitting: boolean;
  onDismiss: () => void;
  onSubmit: (tipAmountCents: number) => void;
};

const PRESET_PERCENTAGES = [15, 20, 25];

// Web equivalent of components/TipModal.tsx.
export function TipModal({ visible, subtotalCents, submitting, onDismiss, onSubmit }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom' | null>(null);
  const [customAmount, setCustomAmount] = useState('');

  useEffect(() => {
    if (visible) {
      setSelectedPreset(null);
      setCustomAmount('');
    }
  }, [visible]);

  if (!visible) return null;

  const tipAmountCents = selectedPreset === 'custom' ? Math.round((parseFloat(customAmount) || 0) * 100) : selectedPreset != null ? Math.round((subtotalCents * selectedPreset) / 100) : 0;

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="card modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Leave a tip</h3>
        <p className="modal-subtitle">100% goes to your groomer.</p>

        <div className={styles.presetRow}>
          {PRESET_PERCENTAGES.map((pct) => (
            <button key={pct} type="button" className={`${styles.presetChip} ${selectedPreset === pct ? styles.presetChipSelected : ''}`} onClick={() => setSelectedPreset(pct)}>
              <div className={styles.presetChipPct}>{pct}%</div>
              <div className={styles.presetChipAmount}>${((subtotalCents * pct) / 100 / 100).toFixed(2)}</div>
            </button>
          ))}
          <button type="button" className={`${styles.presetChip} ${selectedPreset === 'custom' ? styles.presetChipSelected : ''}`} onClick={() => setSelectedPreset('custom')}>
            <div className={styles.presetChipPct}>Custom</div>
          </button>
        </div>

        {selectedPreset === 'custom' && (
          <div className={styles.customRow}>
            <span className={styles.dollarSign}>$</span>
            <input className="field-input" placeholder="0.00" inputMode="decimal" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} autoFocus />
          </div>
        )}

        <div className="modal-actions">
          <Button label="Cancel" variant="ghost" onClick={onDismiss} disabled={submitting} />
          <Button label={tipAmountCents > 0 ? `Tip $${(tipAmountCents / 100).toFixed(2)}` : 'Tip'} onClick={() => onSubmit(tipAmountCents)} loading={submitting} disabled={tipAmountCents <= 0} />
        </div>
      </div>
    </div>
  );
}
