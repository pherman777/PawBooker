'use client';

import styles from './Toggle.module.css';

// Web stand-in for React Native's <Switch> (used by vaccination.tsx and
// hours.tsx) - no native switch element on the web, so this is a styled
// button: a pill track + circle thumb that slides, driven by the same
// boolean state the RN screens use.
type Props = {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

export function Toggle({ checked, onChange, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`${styles.track} ${checked ? styles.trackOn : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className={`${styles.thumb} ${checked ? styles.thumbOn : ''}`} />
    </button>
  );
}
