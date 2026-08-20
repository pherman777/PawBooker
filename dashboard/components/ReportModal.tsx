'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/Button';

import styles from './PetIdEmergencyFields.module.css';

type Props = {
  visible: boolean;
  reasons: string[];
  submitting: boolean;
  onDismiss: () => void;
  onSubmit: (reason: string, details: string) => void;
};

// Web equivalent of components/ReportModal.tsx - reuses
// PetIdEmergencyFields' checkbox-row CSS module for the radio-style list.
export function ReportModal({ visible, reasons, submitting, onDismiss, onSubmit }: Props) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (visible) {
      setReason('');
      setDetails('');
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="card modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Report an issue</h3>
        <p className="modal-subtitle">Let us know what happened - our team will follow up.</p>

        <div style={{ margin: '12px 0' }}>
          {reasons.map((r) => (
            <button key={r} type="button" className={styles.row} onClick={() => setReason(r)}>
              <span className={`${styles.checkbox} ${reason === r ? styles.checkboxChecked : ''}`}>{reason === r && '✓'}</span>
              <span className={styles.rowLabel}>{r}</span>
            </button>
          ))}
        </div>

        <textarea className="field-input" placeholder="Additional details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} rows={4} />

        <div className="modal-actions">
          <Button label="Cancel" variant="ghost" onClick={onDismiss} disabled={submitting} />
          <Button label="Submit" onClick={() => onSubmit(reason, details)} loading={submitting} disabled={!reason} />
        </div>
      </div>
    </div>
  );
}
