'use client';

import type { CSSProperties } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type Props = {
  label: string;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  type?: 'button' | 'submit';
  style?: CSSProperties;
};

export function Button({
  label,
  onClick,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  block,
  type = 'button',
  style,
}: Props) {
  const classes = ['btn', `btn-${variant}`, size === 'sm' && 'btn-sm', block && 'btn-block']
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled || loading} style={style}>
      {loading ? <span className="spinner" aria-hidden /> : label}
    </button>
  );
}
