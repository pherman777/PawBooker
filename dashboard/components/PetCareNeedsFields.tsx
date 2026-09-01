'use client';

import { careNeedsAnyFlag, type CareNeeds } from '@/lib/customerBookings';

import styles from './PetIdEmergencyFields.module.css';

const CARE_FLAGS: { key: keyof Omit<CareNeeds, 'careNotes'>; label: string }[] = [
  { key: 'isAnxious', label: 'Gets nervous or may nip during grooming' },
  { key: 'isMatted', label: 'Has matting or a very tangled coat' },
  { key: 'needsExtraCare', label: 'Needs extra time or special care (senior, health condition, very large)' },
];

type Props = {
  value: CareNeeds;
  onChange: (next: CareNeeds) => void;
  petType: 'dog' | 'cat';
};

// Port of components/PetCareNeedsFields.tsx - reuses PetIdEmergencyFields'
// checkbox-row CSS module since the visual pattern is identical.
export function PetCareNeedsFields({ value, onChange, petType }: Props) {
  const anyFlag = careNeedsAnyFlag(value);

  function toggle(key: keyof Omit<CareNeeds, 'careNotes'>) {
    onChange({ ...value, [key]: !value[key] });
  }

  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Does your {petType} need any special care this visit?</p>
      <p className={styles.subtitle} style={{ marginLeft: 0 }}>
        Check all that apply so your groomer can plan for a safe, comfortable visit.
      </p>

      {CARE_FLAGS.map((flag) => {
        const checked = value[flag.key];
        return (
          <button key={flag.key} type="button" className={styles.row} onClick={() => toggle(flag.key)}>
            <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`}>{checked && '✓'}</span>
            <span className={styles.rowLabel}>{flag.label}</span>
          </button>
        );
      })}

      {anyFlag && (
        <>
          <textarea
            className="field-input"
            placeholder={`Tell your groomer what helps keep your ${petType} calm and safe, and describe any matting or special needs…`}
            value={value.careNotes}
            onChange={(e) => onChange({ ...value, careNotes: e.target.value })}
            rows={4}
          />
          <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>Your groomer may adjust the final price based on your {petType}&apos;s needs.</p>
        </>
      )}
    </div>
  );
}
