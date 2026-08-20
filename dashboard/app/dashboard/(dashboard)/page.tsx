'use client';

import { AlertCircle, Banknote, Calendar, CheckCircle2, CreditCard, LayoutList, PawPrint, Star, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AddBookingModal } from '@/components/AddBookingModal';
import { AssignStaffSheet } from '@/components/AssignStaffSheet';
import { BookingCard } from '@/components/BookingCard';
import { Button } from '@/components/Button';
import { IconChip } from '@/components/IconChip';
import { Modal } from '@/components/Modal';
import { Schedule } from '@/components/Schedule';
import {
  fetchSalonBookings,
  groupSalonEntries,
  matchesStatFilterEntry,
  type SalonBookingRow,
  type SalonEntry,
  type StatFilter,
} from '@/lib/bookings';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fetchActiveStaff, sendBookingEmail, type SalonStaff } from '@/lib/notifications';

type ViewMode = 'list' | 'calendar';

export default function DashboardPage() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [bookings, setBookings] = useState<SalonBookingRow[]>([]);
  const [staffList, setStaffList] = useState<SalonStaff[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statFilter, setStatFilter] = useState<StatFilter>(null);
  const [declineTargetIds, setDeclineTargetIds] = useState<string[] | null>(null);
  const [cancelTargetIds, setCancelTargetIds] = useState<string[] | null>(null);
  const [assignIds, setAssignIds] = useState<string[] | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [addBookingOpen, setAddBookingOpen] = useState(false);

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);
    fetchActiveStaff(groomerProfile.id).then(setStaffList);
    try {
      const rows = await fetchSalonBookings(groomerProfile.id);
      setBookings(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setLoading(false);
  }, [groomerProfile]);

  useEffect(() => {
    load();
    if (!groomerProfile) return;
    supabase
      .from('groomer_supplies')
      .select('quantity_on_hand, reorder_threshold')
      .eq('groomer_id', groomerProfile.id)
      .then(({ data }) => {
        setLowStockCount((data ?? []).filter((s) => s.quantity_on_hand <= s.reorder_threshold).length);
      });
  }, [load, groomerProfile]);

  const entries = useMemo(() => groupSalonEntries(bookings), [bookings]);

  const stats = useMemo(() => {
    const pendingCount = entries.filter((e) => matchesStatFilterEntry(e, 'pending')).length;
    const upcomingCount = entries.filter((e) => matchesStatFilterEntry(e, 'upcoming')).length;
    const readyToBillCount = entries.filter((e) => matchesStatFilterEntry(e, 'ready_to_bill')).length;
    const customerCount = new Set(bookings.map((b) => b.customerId)).size;
    return { pendingCount, upcomingCount, readyToBillCount, customerCount };
  }, [entries, bookings]);

  const displayedEntries = useMemo(
    () => (statFilter ? entries.filter((e) => matchesStatFilterEntry(e, statFilter)) : entries),
    [entries, statFilter]
  );

  // Looked up by key (not stored directly) so the popover always reflects
  // fresh data after an action reloads `bookings` - a stored SalonEntry
  // object would go stale the moment its status changes.
  const selectedEntry = useMemo(
    () => entries.find((e) => e.key === selectedEntryKey) ?? null,
    [entries, selectedEntryKey]
  );

  // Deep-link from NotificationBell's ?booking=<id> - read directly off
  // window.location instead of useSearchParams() so this stays a plain client
  // effect with no Suspense boundary requirement. Runs once entries have
  // loaded, then clears the param so a refresh doesn't reopen it.
  useEffect(() => {
    if (entries.length === 0) return;
    const bookingId = new URLSearchParams(window.location.search).get('booking');
    if (!bookingId) return;
    const entry = entries.find((e) => e.bookings.some((b) => b.id === bookingId));
    if (entry) {
      setViewMode('list');
      setSelectedEntryKey(entry.key);
    }
    router.replace('/dashboard');
  }, [entries, router]);

  function toggleStatFilter(filter: StatFilter) {
    setStatFilter((current) => (current === filter ? null : filter));
  }

  async function confirmBookings(ids: string[], staffId: string | null) {
    setUpdatingId(ids[0]);
    const update: { status: 'confirmed'; staff_id?: string } = { status: 'confirmed' };
    if (staffId) update.staff_id = staffId;
    const { error: updateError } = await supabase.from('bookings').update(update).in('id', ids);
    setUpdatingId(null);
    if (updateError) {
      window.alert(`Update failed: ${updateError.message}`);
      return;
    }
    await load();
    sendBookingEmail(ids[0], 'accepted');
  }

  function handleAccept(ids: string[], unassigned: boolean) {
    if (unassigned && staffList.length >= 2) {
      setAssignIds(ids);
      return;
    }
    confirmBookings(ids, null);
  }

  async function handleCompleteService(ids: string[]) {
    setUpdatingId(ids[0]);
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ service_completed_at: new Date().toISOString() })
      .in('id', ids);
    setUpdatingId(null);
    if (updateError) {
      window.alert(`Update failed: ${updateError.message}`);
      return;
    }
    await load();
    sendBookingEmail(ids[0], 'service_completed');
  }

  async function handleConfirmDecline(reason: string) {
    if (!declineTargetIds) return;
    const ids = declineTargetIds;
    setUpdatingId(ids[0]);
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'declined', cancellation_reason: reason, cancelled_by: 'groomer' })
      .in('id', ids);
    setUpdatingId(null);
    setDeclineTargetIds(null);
    if (updateError) {
      window.alert(`Update failed: ${updateError.message}`);
      return;
    }
    await load();
    sendBookingEmail(ids[0], 'declined');
  }

  async function handleConfirmCancel(reason: string) {
    if (!cancelTargetIds) return;
    const ids = cancelTargetIds;
    setUpdatingId(ids[0]);
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancellation_reason: reason, cancelled_by: 'groomer' })
      .in('id', ids);
    setUpdatingId(null);
    setCancelTargetIds(null);
    if (updateError) {
      window.alert(`Update failed: ${updateError.message}`);
      return;
    }
    await load();
    sendBookingEmail(ids[0], 'groomer_cancelled');
  }

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" aria-hidden />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header-row">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="dashboard-title">{groomerProfile?.name}</h1>
        </div>
        <Button label="Add booking" size="sm" onClick={() => setAddBookingOpen(true)} />
      </div>

      {error && <p className="sign-in-error">Couldn&apos;t load bookings: {error}</p>}

      <div className="card banner-row">
        <IconChip icon={Star} tone="sage" size={28} />
        <span className="banner-text">
          {groomerProfile?.plan === 'pro' ? 'On the Pro plan' : 'Upgrade to Pro for more features'}
        </span>
      </div>

      <div className="card banner-row">
        <IconChip icon={groomerProfile?.payoutsEnabled ? CheckCircle2 : CreditCard} tone="sage" size={28} />
        <span className="banner-text">
          {groomerProfile?.payoutsEnabled ? 'Payouts active' : 'Connect your bank account to get paid'}
        </span>
      </div>

      {lowStockCount > 0 && (
        <div className="card banner-row">
          <IconChip icon={AlertCircle} tone="danger" size={28} />
          <span className="banner-text">
            {lowStockCount} suppl{lowStockCount === 1 ? 'y' : 'ies'} low on stock
          </span>
        </div>
      )}

      <div className="stat-grid">
        <button
          className={`card stat-card stat-card-warning${statFilter === 'pending' ? ' stat-card-active' : ''}`}
          onClick={() => toggleStatFilter('pending')}>
          <AlertCircle size={18} color={statFilter === 'pending' ? 'var(--ink)' : 'var(--warning)'} />
          <span className="stat-value">{stats.pendingCount}</span>
          <span className="stat-label">Pending requests</span>
        </button>
        <button
          className={`card stat-card stat-card-sage${statFilter === 'upcoming' ? ' stat-card-active' : ''}`}
          onClick={() => toggleStatFilter('upcoming')}>
          <Calendar size={18} color={statFilter === 'upcoming' ? 'var(--ink)' : 'var(--sage)'} />
          <span className="stat-value">{stats.upcomingCount}</span>
          <span className="stat-label">Upcoming</span>
        </button>
        <div className="card stat-card stat-card-muted">
          <Users size={18} color="var(--muted)" />
          <span className="stat-value">{stats.customerCount}</span>
          <span className="stat-label">Customers</span>
        </div>
        <button
          className={`card stat-card stat-card-success${statFilter === 'ready_to_bill' ? ' stat-card-active' : ''}`}
          onClick={() => toggleStatFilter('ready_to_bill')}>
          <Banknote size={18} color={statFilter === 'ready_to_bill' ? 'var(--ink)' : 'var(--success)'} />
          <span className="stat-value">{stats.readyToBillCount}</span>
          <span className="stat-label">Ready to bill</span>
        </button>
      </div>

      {statFilter && (
        <button className="clear-filter" onClick={() => setStatFilter(null)}>
          Showing{' '}
          {statFilter === 'pending' ? 'pending requests' : statFilter === 'upcoming' ? 'upcoming appointments' : 'appointments ready to bill'}{' '}
          only · Clear
        </button>
      )}

      <div className="view-toggle">
        <button
          className={`view-toggle-btn${viewMode === 'list' ? ' view-toggle-btn-active' : ''}`}
          onClick={() => setViewMode('list')}>
          <LayoutList size={14} /> Cards
        </button>
        <button
          className={`view-toggle-btn${viewMode === 'calendar' ? ' view-toggle-btn-active' : ''}`}
          onClick={() => setViewMode('calendar')}>
          <Calendar size={14} /> Calendar
        </button>
      </div>

      {viewMode === 'list' ? (
        <div className="booking-list">
          {displayedEntries.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-illustration">
                <PawPrint size={38} strokeWidth={1.6} />
              </div>
              <p className="empty-state-title">{statFilter ? 'No bookings match this filter' : 'No booking requests yet'}</p>
              {!statFilter && (
                <p className="empty-state-body">
                  Once a customer books you, requests show up here — accept them right from this list.
                </p>
              )}
            </div>
          )}
          {displayedEntries.map((entry: SalonEntry) => (
            <BookingCard
              key={entry.key}
              entry={entry}
              busy={updatingId != null && entry.bookings.some((b) => b.id === updatingId)}
              onAccept={handleAccept}
              onDecline={setDeclineTargetIds}
              onCompleteService={handleCompleteService}
              onCancel={setCancelTargetIds}
            />
          ))}
        </div>
      ) : (
        <Schedule entries={displayedEntries} staffList={staffList} onSelectEntry={(entry) => setSelectedEntryKey(entry.key)} />
      )}

      {selectedEntry && (
        <div className="modal-backdrop" onClick={() => setSelectedEntryKey(null)}>
          <div className="entry-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="entry-modal-close" onClick={() => setSelectedEntryKey(null)} aria-label="Close">
              <X size={15} />
            </button>
            <BookingCard
              entry={selectedEntry}
              busy={updatingId != null && selectedEntry.bookings.some((b) => b.id === updatingId)}
              onAccept={handleAccept}
              onDecline={(ids) => {
                setSelectedEntryKey(null);
                setDeclineTargetIds(ids);
              }}
              onCompleteService={handleCompleteService}
              onCancel={(ids) => {
                setSelectedEntryKey(null);
                setCancelTargetIds(ids);
              }}
            />
          </div>
        </div>
      )}

      <AddBookingModal
        visible={addBookingOpen}
        staffList={staffList}
        onDismiss={() => setAddBookingOpen(false)}
        onCreated={() => {
          setAddBookingOpen(false);
          load();
        }}
      />

      <AssignStaffSheet
        visible={assignIds != null}
        staff={staffList}
        onDismiss={() => setAssignIds(null)}
        onSelect={(staffId) => {
          const ids = assignIds;
          setAssignIds(null);
          if (ids) confirmBookings(ids, staffId);
        }}
      />

      <Modal
        visible={declineTargetIds != null}
        title="Decline request"
        subtitle="Let the customer know why, and suggest another day or time."
        placeholder="e.g. I'm booked that day — I have openings Wed or Thu afternoon"
        confirmLabel="Decline request"
        submitting={declineTargetIds != null && updatingId === declineTargetIds[0]}
        onDismiss={() => setDeclineTargetIds(null)}
        onConfirm={handleConfirmDecline}
      />

      <Modal
        visible={cancelTargetIds != null}
        title="Cancel visit"
        subtitle={
          cancelTargetIds && cancelTargetIds.length > 1
            ? `This cancels all ${cancelTargetIds.length} pets in this visit.`
            : 'Let the customer know why this visit is being cancelled.'
        }
        placeholder="Reason for cancelling"
        confirmLabel="Cancel visit"
        submitting={cancelTargetIds != null && updatingId === cancelTargetIds[0]}
        onDismiss={() => setCancelTargetIds(null)}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
}
