'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/Button';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  placeholder?: string;
  confirmLabel?: string;
  submitting?: boolean;
  onDismiss: () => void;
  onConfirm: (reason: string) => void;
};

// Ported from the app's CancelBookingModal - used for decline/cancel, where
// the groomer needs to leave the customer a reason.
export function Modal({
  visible,
  title,
  subtitle,
  placeholder,
  confirmLabel = 'Confirm',
  submitting,
  onDismiss,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="card modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        <textarea
          className="field-input"
          placeholder={placeholder}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className="modal-actions">
          <Button label="Cancel" variant="ghost" onClick={onDismiss} disabled={submitting} />
          <Button label={confirmLabel} variant="danger" onClick={() => onConfirm(reason)} loading={submitting} />
        </div>
      </div>
    </div>
  );
}
