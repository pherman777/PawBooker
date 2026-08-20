'use client';

import { useState } from 'react';

import { formatPhoneAsTyped } from '@/lib/phone';

import styles from './PetIdEmergencyFields.module.css';

export type PetIdentity = {
  isMicrochipped: boolean;
  microchipNumber: string;
  vetName: string;
  vetPhone: string;
};

export const EMPTY_PET_IDENTITY: PetIdentity = {
  isMicrochipped: false,
  microchipNumber: '',
  vetName: '',
  vetPhone: '',
};

type Props = {
  value: PetIdentity;
  onChange: (next: PetIdentity) => void;
};

function hasIdentityInfo(value: PetIdentity): boolean {
  return (
    value.isMicrochipped ||
    value.microchipNumber.trim().length > 0 ||
    value.vetName.trim().length > 0 ||
    value.vetPhone.trim().length > 0
  );
}

// Port of components/PetIdEmergencyFields.tsx.
export function PetIdEmergencyFields({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState(() => hasIdentityInfo(value));

  return (
    <div>
      <button type="button" className={styles.row} onClick={() => setExpanded((prev) => !prev)}>
        <span className={`${styles.checkbox} ${expanded ? styles.checkboxChecked : ''}`}>{expanded && '✓'}</span>
        <span className={styles.rowLabel}>Add ID &amp; emergency info</span>
      </button>
      <p className={styles.subtitle}>Optional, but handy for your groomer if something comes up.</p>

      {expanded && (
        <div className={styles.fields}>
          <button
            type="button"
            className={styles.row}
            onClick={() => onChange({ ...value, isMicrochipped: !value.isMicrochipped })}>
            <span className={`${styles.checkbox} ${value.isMicrochipped ? styles.checkboxChecked : ''}`}>
              {value.isMicrochipped && '✓'}
            </span>
            <span className={styles.rowLabel}>My pet is microchipped</span>
          </button>

          {value.isMicrochipped && (
            <input
              className="field-input"
              placeholder="Microchip number (optional)"
              value={value.microchipNumber}
              onChange={(e) => onChange({ ...value, microchipNumber: e.target.value })}
            />
          )}

          <input
            className="field-input"
            placeholder="Vet name or clinic (optional)"
            value={value.vetName}
            onChange={(e) => onChange({ ...value, vetName: e.target.value })}
          />
          <input
            className="field-input"
            placeholder="Vet phone (optional)"
            value={value.vetPhone}
            maxLength={14}
            onChange={(e) => onChange({ ...value, vetPhone: formatPhoneAsTyped(e.target.value) })}
          />
        </div>
      )}
    </div>
  );
}
