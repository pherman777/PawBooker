import type { CSSProperties } from 'react';

import type { BookingStatus } from '@/lib/bookings';

const STATUS_TONE: Record<BookingStatus, string> = {
  pending: 'var(--warning)',
  confirmed: 'var(--success)',
  completed: 'var(--muted)',
  cancelled: 'var(--danger)',
  declined: 'var(--warning)',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const style = { '--tone': STATUS_TONE[status] } as CSSProperties;
  return (
    <span className="status-badge" style={style}>
      {status}
    </span>
  );
}
