'use client';

import { Calendar } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/Button';
import { ReportModal } from '@/components/ReportModal';
import { ReviewModal } from '@/components/ReviewModal';
import { TipModal } from '@/components/TipModal';
import { Modal } from '@/components/Modal';
import { buildGoogleCalendarUrl, downloadIcsEvent } from '@/lib/calendarLinks';
import { useCustomerAuth } from '@/lib/customerAuth';
import {
  cancelBookings,
  fetchCustomerBookings,
  groupEntries,
  groupStatus,
  submitBookingReview,
  type BookingEntry,
  type BookingRow,
  type BookingStatus,
} from '@/lib/customerBookingsList';
import { notifyGroomer, sendBookingEmail } from '@/lib/customerNotifications';
import { chargeTip } from '@/lib/customerStripe';
import { submitReport } from '@/lib/support';

import styles from './page.module.css';

const REPORT_REASONS = ['Overcharged me', 'Unsafe or unprofessional handling of my pet', 'Rude or unprofessional behavior', 'Did not show up', 'Other'];

const STATUS_COLOR_VAR: Record<BookingStatus, string> = {
  pending: 'var(--warning)',
  confirmed: 'var(--success)',
  completed: 'var(--muted)',
  cancelled: 'var(--danger)',
  declined: 'var(--warning)',
};

// Port of app/(tabs)/bookings.tsx.
export default function BookingsPage() {
  const router = useRouter();
  const { session } = useCustomerAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<{ ids: string[]; groomerId: string } | null>(null);
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [tipTarget, setTipTarget] = useState<{ bookingId: string; subtotalCents: number } | null>(null);
  const [submittingTip, setSubmittingTip] = useState(false);
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setBookings(await fetchCustomerBookings(session.user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const entries = useMemo(() => groupEntries(bookings), [bookings]);

  async function handleConfirmCancel(reason: string) {
    if (!cancelTarget) return;
    const { ids, groomerId } = cancelTarget;
    setUpdatingId(ids[0]);
    try {
      await cancelBookings(ids, reason);
      setCancelTarget(null);
      await load();
      sendBookingEmail(ids[0], 'customer_cancelled');
      notifyGroomer(groomerId, ids[0], 'booking_cancelled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSubmitReview(rating: number, comment: string) {
    if (!reviewTargetId || !session) return;
    const booking = bookings.find((b) => b.id === reviewTargetId);
    if (!booking) return;

    setSubmittingReview(true);
    try {
      await submitBookingReview({ bookingId: booking.id, groomerId: booking.groomerId, customerId: session.user.id, rating, comment });
      setReviewTargetId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review not saved');
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleSubmitTip(tipAmountCents: number) {
    if (!tipTarget) return;
    setSubmittingTip(true);
    try {
      await chargeTip(tipTarget.bookingId, tipAmountCents);
      setTipTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tip not sent');
    } finally {
      setSubmittingTip(false);
    }
  }

  async function handleSubmitReport(reason: string, details: string) {
    if (!reportTargetId) return;
    setSubmittingReport(true);
    try {
      await submitReport(reportTargetId, reason, details || undefined);
      setReportTargetId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit report');
    } finally {
      setSubmittingReport(false);
    }
  }

  function renderCard(entry: BookingEntry) {
    const rows = entry.bookings;
    const lead = entry.lead;
    const status = groupStatus(rows);
    const isGroup = rows.length > 1;
    const petNames = rows.map((b) => b.petName).join(', ');
    const ids = rows.map((b) => b.id);
    const cancellable = status === 'pending' || status === 'confirmed';
    const allCompleted = rows.every((b) => b.status === 'completed');
    const totalPaidCents = rows.reduce((sum, b) => sum + (b.invoiceTotalCents ?? 0), 0);
    const anyPaymentFailed = rows.some((b) => b.paymentStatus === 'failed');
    const tipSubtotalCents = rows.reduce((sum, b) => sum + ((b.invoiceTotalCents ?? 0) - (b.taxAmountCents ?? 0)), 0);

    return (
      <div key={entry.key} className={`card ${styles.card}`}>
        <div className={styles.cardHeader}>
          <div className={styles.cardService}>{lead.serviceName}</div>
          <div className={styles.cardStatus} style={{ color: STATUS_COLOR_VAR[status] }}>
            {status}
          </div>
        </div>
        {isGroup && <div className={styles.groupBadge}>{rows.length} pets · one visit</div>}
        <div className={styles.cardMeta}>
          {lead.groomerName} · {isGroup ? petNames : `for ${lead.petName}`}
        </div>
        <div className={styles.cardMeta}>{new Date(lead.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>

        {status === 'cancelled' && lead.cancellationReason && <div className={styles.reasonText}>Reason: {lead.cancellationReason}</div>}

        {status === 'declined' && (
          <div className={styles.declinedBox}>
            <div className={styles.declinedLabel}>Note from {lead.groomerName}</div>
            <div className={styles.declinedNote}>{lead.cancellationReason || "They couldn't take this time. Try booking another."}</div>
            {!isGroup && (
              <div style={{ marginTop: 12 }}>
                <Button
                  label="Rebook a different time"
                  onClick={() => router.push(`/book/groomer/${lead.groomerId}/schedule?serviceId=${lead.serviceId}&petId=${lead.petId}&note=${encodeURIComponent(lead.cancellationReason ?? '')}`)}
                />
              </div>
            )}
          </div>
        )}

        {anyPaymentFailed && (
          <div className={styles.paymentFailedBanner}>
            <div className={styles.paymentFailedText}>We couldn&apos;t charge your card for this {isGroup ? 'visit' : 'appointment'}.</div>
            <button type="button" className={styles.paymentFailedLink} onClick={() => router.push('/book/account')}>
              Update payment method
            </button>
          </div>
        )}

        {(status === 'pending' || status === 'confirmed') && lead.groomerLatitude != null && lead.groomerLongitude != null && (
          <p className={styles.directionsWrapper}>
            <a className="sign-in-footer-link" href={`https://www.google.com/maps/dir/?api=1&destination=${lead.groomerLatitude},${lead.groomerLongitude}`} target="_blank" rel="noopener noreferrer">
              Get directions
            </a>
          </p>
        )}

        {(status === 'pending' || status === 'confirmed') && (
          <div className={styles.calendarLinks}>
            <a
              className={styles.calendarLink}
              href={buildGoogleCalendarUrl({
                title: `${lead.serviceName} - ${petNames} at ${lead.groomerName}`,
                startDate: new Date(lead.startsAt),
                durationMinutes: lead.serviceDurationMinutes,
                location: lead.groomerAddress,
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              Add to Google Calendar
            </a>
            <button
              type="button"
              className={styles.calendarLink}
              onClick={() =>
                downloadIcsEvent({
                  title: `${lead.serviceName} - ${petNames} at ${lead.groomerName}`,
                  startDate: new Date(lead.startsAt),
                  durationMinutes: lead.serviceDurationMinutes,
                  location: lead.groomerAddress,
                })
              }
            >
              Add to Apple/Outlook Calendar
            </button>
          </div>
        )}

        <div className={styles.actionsRow}>
          {cancellable && (
            <Button label="Cancel booking" variant="danger" size="sm" onClick={() => setCancelTarget({ ids, groomerId: lead.groomerId })} loading={updatingId === ids[0]} />
          )}

          {allCompleted && <Button label={lead.review ? 'Edit review' : 'Leave a review'} variant="secondary" size="sm" onClick={() => setReviewTargetId(lead.id)} />}

          {allCompleted && totalPaidCents > 0 && (lead.tipAmountCents != null ? (
            <div className={styles.tippedText}>Tipped ${(lead.tipAmountCents / 100).toFixed(2)}{isGroup ? ' for the visit' : ''}</div>
          ) : (
            <Button label={isGroup ? 'Leave a tip for the visit' : 'Leave a tip'} size="sm" onClick={() => setTipTarget({ bookingId: lead.id, subtotalCents: tipSubtotalCents })} />
          ))}

          {allCompleted && totalPaidCents > 0 && <div className={styles.tippedText}>Paid ${(totalPaidCents / 100).toFixed(2)} total</div>}
        </div>

        {(status === 'completed' || status === 'cancelled' || status === 'confirmed') && (
          <div className={styles.reportLink}>
            <button type="button" className={styles.reportLinkText} onClick={() => setReportTargetId(lead.id)}>
              Report an issue
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className="page-title">Your bookings</h1>
        <Link href="/book/browse" className="btn btn-primary btn-sm">
          + New booking
        </Link>
      </div>

      {loading && (
        <div className="page-loading">
          <span className="spinner" aria-hidden />
        </div>
      )}
      {error && <p className="sign-in-error">{error}</p>}

      {!loading && !error && (
        <div className={styles.list}>
          {entries.length === 0 && (
            <div className={styles.empty}>
              <div className={styles.emptyIllustration}>
                <Calendar size={34} strokeWidth={2} />
              </div>
              <p className={styles.emptyText}>No bookings yet</p>
              <Button label="Book an appointment" onClick={() => router.push('/book/browse')} />
            </div>
          )}
          {entries.map(renderCard)}
        </div>
      )}

      <Modal
        visible={cancelTarget != null}
        title="Cancel booking?"
        subtitle={cancelTarget && cancelTarget.ids.length > 1 ? `This cancels all ${cancelTarget.ids.length} pets booked in this visit.` : undefined}
        placeholder="Reason (optional)"
        confirmLabel="Cancel booking"
        submitting={cancelTarget != null && updatingId === cancelTarget.ids[0]}
        onDismiss={() => setCancelTarget(null)}
        onConfirm={handleConfirmCancel}
      />

      <ReviewModal
        visible={reviewTargetId != null}
        title="Rate this appointment"
        subtitle={bookings.find((b) => b.id === reviewTargetId)?.groomerName}
        submitting={submittingReview}
        initialRating={bookings.find((b) => b.id === reviewTargetId)?.review?.rating ?? 0}
        initialComment={bookings.find((b) => b.id === reviewTargetId)?.review?.comment ?? ''}
        onDismiss={() => setReviewTargetId(null)}
        onSubmit={handleSubmitReview}
      />

      <TipModal visible={tipTarget != null} subtotalCents={tipTarget?.subtotalCents ?? 0} submitting={submittingTip} onDismiss={() => setTipTarget(null)} onSubmit={handleSubmitTip} />

      <ReportModal visible={reportTargetId != null} reasons={REPORT_REASONS} submitting={submittingReport} onDismiss={() => setReportTargetId(null)} onSubmit={handleSubmitReport} />
    </div>
  );
}
