'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/Button';
import { StarRating } from '@/components/StarRating';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  submitting: boolean;
  initialRating: number;
  initialComment: string;
  onDismiss: () => void;
  onSubmit: (rating: number, comment: string) => void;
};

// Web equivalent of components/ReviewModal.tsx.
export function ReviewModal({ visible, title, subtitle, submitting, initialRating, initialComment, onDismiss, onSubmit }: Props) {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);

  useEffect(() => {
    if (visible) {
      setRating(initialRating);
      setComment(initialComment);
    }
  }, [visible, initialRating, initialComment]);

  if (!visible) return null;

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="card modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        <div style={{ margin: '12px 0' }}>
          <StarRating value={rating} onChange={setRating} size={28} />
        </div>
        <textarea className="field-input" placeholder="Add a comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} autoFocus />
        <div className="modal-actions">
          <Button label="Cancel" variant="ghost" onClick={onDismiss} disabled={submitting} />
          <Button label="Submit" onClick={() => onSubmit(rating, comment)} loading={submitting} disabled={rating === 0} />
        </div>
      </div>
    </div>
  );
}
