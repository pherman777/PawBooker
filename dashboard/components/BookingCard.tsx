'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/Button';
import { PetCareBox } from '@/components/PetCareBox';
import { StatusBadge } from '@/components/StatusBadge';
import { groupSalonStatus, type SalonEntry } from '@/lib/bookings';

type Props = {
  entry: SalonEntry;
  busy: boolean;
  onAccept: (ids: string[], unassigned: boolean) => void;
  onDecline: (ids: string[]) => void;
  onCompleteService: (ids: string[]) => void;
  onCancel: (ids: string[]) => void;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function BookingCard({ entry, busy, onAccept, onDecline, onCompleteService, onCancel }: Props) {
  const router = useRouter();
  const rows = entry.bookings;
  const lead = entry.lead;
  const status = groupSalonStatus(rows);
  const ids = rows.map((b) => b.id);
  const isGroup = rows.length > 1;
  const active = status === 'pending' || status === 'confirmed';

  const petNames = rows.map((b) => b.petName).join(', ');
  const uniqueServices = Array.from(new Set(rows.map((b) => b.serviceName)));
  const headerLabel = isGroup && uniqueServices.length > 1 ? `${uniqueServices.length} services` : lead.serviceName;
  const notServiceDone = rows.filter((b) => b.status === 'confirmed' && !b.serviceCompletedAt);
  const readyToBill = rows.filter((b) => b.status === 'confirmed' && b.serviceCompletedAt);
  const billed = rows.filter((b) => b.status === 'completed');
  const totalPaidCents = billed.reduce((sum, b) => sum + (b.invoiceTotalCents ?? 0), 0);

  return (
    <div className="card booking-card">
      <div className="booking-card-header">
        <h3 className="booking-card-service">{headerLabel}</h3>
        <StatusBadge status={status} />
      </div>

      {isGroup && <span className="booking-group-badge">{rows.length} pets · one visit</span>}

      <p className="booking-card-meta">
        {isGroup ? petNames : `for ${lead.petName}`}
        {lead.customerName ? ` — ${lead.customerName}` : ''}
        {lead.staffName ? ` · with ${lead.staffName}` : ''}
      </p>
      <p className="booking-card-meta">{formatWhen(lead.startsAt)}</p>

      {status !== 'cancelled' && status !== 'declined' && (
        <>
          {isGroup ? (
            rows.map((b) => (
              <div key={b.id} className="booking-pet-block">
                <p className="booking-pet-name">
                  {b.petName} <span className="booking-pet-service">· {b.serviceName}</span>
                </p>
                <PetCareBox info={b.petCare} />
              </div>
            ))
          ) : (
            <PetCareBox info={lead.petCare} />
          )}
        </>
      )}

      {(status === 'declined' || status === 'cancelled') && lead.cancellationReason && (
        <p className="booking-reason">
          {status === 'declined' ? 'Your note' : 'Reason'}: {lead.cancellationReason}
        </p>
      )}

      {billed.length > 0 && totalPaidCents > 0 && <p className="booking-paid">Paid ${(totalPaidCents / 100).toFixed(2)} total</p>}

      {status === 'pending' && (
        <div className="booking-actions">
          <Button label={isGroup ? 'Accept all' : 'Accept'} onClick={() => onAccept(ids, !lead.staffId)} loading={busy} />
          <Button label="Decline" variant="danger" onClick={() => onDecline(ids)} disabled={busy} />
        </div>
      )}

      {status === 'confirmed' && notServiceDone.length > 0 && (
        <Button
          label={`Complete service${notServiceDone.length < rows.length ? ` (${notServiceDone.length} left)` : ''}`}
          onClick={() => onCompleteService(notServiceDone.map((b) => b.id))}
          loading={busy}
          block
        />
      )}

      {readyToBill.length > 0 && (
        <Button
          label={`Complete & invoice (${readyToBill.length} ${readyToBill.length === 1 ? 'pet' : 'pets'})`}
          onClick={() =>
            router.push(isGroup ? `/complete-group/${entry.key}` : `/complete/${readyToBill[0].id}`)
          }
          block
        />
      )}

      {active && <Button label={isGroup ? 'Cancel visit' : 'Cancel'} variant="danger" onClick={() => onCancel(ids)} disabled={busy} block />}
    </div>
  );
}
