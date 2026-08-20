'use client';

import { Star } from 'lucide-react';

type Props = {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
};

// Port of components/StarRating.tsx.
export function StarRating({ value, onChange, size = 22 }: Props) {
  const stars = [1, 2, 3, 4, 5];
  const interactive = Boolean(onChange);

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {stars.map((star) =>
        interactive ? (
          <button
            key={star}
            type="button"
            onClick={() => onChange?.(star)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}>
            <Star size={size} color="var(--warning)" fill={star <= value ? 'var(--warning)' : 'none'} strokeWidth={1.5} />
          </button>
        ) : (
          <Star key={star} size={size} color="var(--warning)" fill={star <= value ? 'var(--warning)' : 'none'} strokeWidth={1.5} />
        )
      )}
    </div>
  );
}
