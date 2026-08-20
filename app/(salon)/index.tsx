import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { BookingCalendar } from '@/components/BookingCalendar';
import { CancelBookingModal } from '@/components/CancelBookingModal';
import { GroomerNotificationBell } from '@/components/GroomerNotificationBell';
import { MessagesIconButton } from '@/components/MessagesIconButton';
import { PetCareSummary, type PetCareInfo } from '@/components/PetCareSummary';
import { ReportModal } from '@/components/ReportModal';
import { Button } from '@/components/ui/Button';
import { IconChip } from '@/components/ui/IconChip';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Colors } from '@/constants/theme';
import { webFlushScroll } from '@/constants/webScroll';
import { webContentWidth } from '@/constants/webLayout';
import { fetchActiveStaff, type SalonStaff } from '@/services/availability';
import { useAuth } from '@/services/auth-context';
import { sendBookingEmail } from '@/services/notifications';
import { submitReport } from '@/services/support';
import { supabase } from '@/services/supabase';
import type { BookingStatus, PaymentStatus } from '@/types';
import { addMonths, isSameDay } from '@/utils/calendar';
import { confirmAsync, notify, showActionSheet } from '@/utils/confirm';

const REPORT_REASONS = [
  'Failure to pay / payment dispute',
  'Rude or abusive behavior',
  'No-show / repeated cancellations',
  'Unsafe or aggressive pet not disclosed',
  'Other',
];

type SalonBookingRow = {
  id: string;
  groupId?: string;
  customerId: string;
  startsAt: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  serviceCompletedAt?: string;
  serviceName: string;
  petName: string;
  petCare: PetCareInfo;
  staffName?: string;
  staffId?: string;
  cancellationReason?: string;
  invoiceTotalCents?: number;
  platformFeeCents?: number;
};

// A multi-pet visit (same group_id) shown as one card; standalone bookings are
// an entry of one. `bookings` is earliest-first; `lead` is the earliest.
type SalonEntry = {
  key: string;
  bookings: SalonBookingRow[];
  lead: SalonBookingRow;
};

type ViewMode = 'list' | 'calendar';
type StatFilter = 'pending' | 'upcoming' | 'ready_to_bill' | null;

function groupSalonEntries(rows: SalonBookingRow[]): SalonEntry[] {
  const entries: SalonEntry[] = [];
  const indexByGroup = new Map<string, number>();
  for (const row of rows) {
    if (row.groupId) {
      const at = indexByGroup.get(row.groupId);
      if (at != null) {
        entries[at].bookings.push(row);
        continue;
      }
      indexByGroup.set(row.groupId, entries.length);
      entries.push({ key: row.groupId, bookings: [row], lead: row });
    } else {
      entries.push({ key: row.id, bookings: [row], lead: row });
    }
  }
  for (const entry of entries) {
    entry.bookings.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    entry.lead = entry.bookings[0];
  }
  return entries;
}

function groupSalonStatus(rows: SalonBookingRow[]): BookingStatus {
  if (rows.every((b) => b.status === 'completed')) return 'completed';
  const order: BookingStatus[] = ['pending', 'confirmed', 'cancelled', 'declined', 'completed'];
  for (const status of order) {
    if (rows.some((b) => b.status === status)) return status;
  }
  return rows[0].status;
}

// A group is "ready to bill" once the groomer has marked the service done on
// every pet; "upcoming" while any pet still needs the service performed.
function matchesStatFilterEntry(entry: SalonEntry, filter: StatFilter): boolean {
  const status = groupSalonStatus(entry.bookings);
  const allServiceCompleted = entry.bookings.every((b) => b.serviceCompletedAt);
  if (filter === 'pending') return status === 'pending';
  if (filter === 'upcoming') return status === 'confirmed' && !allServiceCompleted;
  if (filter === 'ready_to_bill') return status === 'confirmed' && allServiceCompleted;
  return true;
}

export default function SalonDashboardScreen() {
  const router = useRouter();
  const { bookingId: notifiedBookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const handledNotificationRef = useRef<string | null>(null);
  const { groomerProfile } = useAuth();
  const [bookings, setBookings] = useState<SalonBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<SalonStaff[]>([]);
  const [cancelTargetIds, setCancelTargetIds] = useState<string[] | null>(null);
  const [declineTargetIds, setDeclineTargetIds] = useState<string[] | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [statFilter, setStatFilter] = useState<StatFilter>(null);
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const flatListRef = useRef<FlatList<SalonEntry>>(null);

  const loadLowStockCount = useCallback(async () => {
    if (!groomerProfile) return;
    const { data } = await supabase
      .from('groomer_supplies')
      .select('quantity_on_hand, reorder_threshold')
      .eq('groomer_id', groomerProfile.id);
    setLowStockCount((data ?? []).filter((s) => s.quantity_on_hand <= s.reorder_threshold).length);
  }, [groomerProfile]);

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    fetchActiveStaff(groomerProfile.id).then(setStaffList);

    const { data, error: queryError } = await supabase
      .from('bookings')
      .select(
        'id, group_id, customer_id, starts_at, status, payment_status, service_completed_at, cancellation_reason, invoice_total_cents, platform_fee_cents, staff_id, is_anxious, is_matted, needs_extra_care, care_notes, pets(name, is_microchipped, microchip_number, vet_name, vet_phone), groomer_services(name), salon_staff(name)'
      )
      .eq('groomer_id', groomerProfile.id)
      .order('starts_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
    } else {
      type PetRow = {
        name: string;
        is_microchipped?: boolean;
        microchip_number?: string | null;
        vet_name?: string | null;
        vet_phone?: string | null;
      };
      setBookings(
        (data ?? []).map((row) => {
          const petRow = row.pets as unknown as PetRow | null;
          return {
          id: row.id,
          groupId: row.group_id ?? undefined,
          customerId: row.customer_id,
          startsAt: row.starts_at,
          status: row.status,
          paymentStatus: row.payment_status,
          serviceCompletedAt: row.service_completed_at ?? undefined,
          cancellationReason: row.cancellation_reason ?? undefined,
          invoiceTotalCents: row.invoice_total_cents ?? undefined,
          platformFeeCents: row.platform_fee_cents ?? undefined,
          serviceName: (row.groomer_services as unknown as { name: string })?.name ?? 'Service',
          petName: petRow?.name ?? 'Pet',
          petCare: {
            isAnxious: row.is_anxious ?? false,
            isMatted: row.is_matted ?? false,
            needsExtraCare: row.needs_extra_care ?? false,
            careNotes: row.care_notes ?? undefined,
            isMicrochipped: petRow?.is_microchipped ?? false,
            microchipNumber: petRow?.microchip_number ?? undefined,
            vetName: petRow?.vet_name ?? undefined,
            vetPhone: petRow?.vet_phone ?? undefined,
          },
          staffName: (row.salon_staff as unknown as { name: string } | null)?.name ?? undefined,
          staffId: row.staff_id ?? undefined,
          };
        })
      );
    }
    setLoading(false);
  }, [groomerProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadLowStockCount();
    }, [load, loadLowStockCount])
  );

  const entries = useMemo(() => groupSalonEntries(bookings), [bookings]);

  const stats = useMemo(() => {
    const pendingCount = entries.filter((e) => matchesStatFilterEntry(e, 'pending')).length;
    const upcomingCount = entries.filter((e) => matchesStatFilterEntry(e, 'upcoming')).length;
    const readyToBillCount = entries.filter((e) => matchesStatFilterEntry(e, 'ready_to_bill')).length;
    const customerCount = new Set(bookings.map((b) => b.customerId)).size;
    return { pendingCount, upcomingCount, readyToBillCount, customerCount };
  }, [entries, bookings]);

  const displayedEntries = useMemo(() => {
    let result = entries;
    if (viewMode === 'calendar') {
      result = result.filter((e) => isSameDay(new Date(e.lead.startsAt), selectedDay));
    }
    if (statFilter) {
      result = result.filter((e) => matchesStatFilterEntry(e, statFilter));
    }
    return result;
  }, [entries, viewMode, selectedDay, statFilter]);

  function toggleStatFilter(filter: StatFilter) {
    setStatFilter((current) => (current === filter ? null : filter));
  }

  function handleSelectBookingFromNotification(bookingId: string) {
    setViewMode('list');
    setHighlightedId(bookingId);

    setTimeout(() => {
      const index = entries.findIndex((e) => e.bookings.some((b) => b.id === bookingId));
      if (index >= 0) {
        flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
      }
    }, 100);

    setTimeout(() => setHighlightedId(null), 4000);
  }

  useEffect(() => {
    if (!notifiedBookingId || notifiedBookingId === handledNotificationRef.current) return;
    if (bookings.length === 0) return;
    handledNotificationRef.current = notifiedBookingId;
    handleSelectBookingFromNotification(notifiedBookingId);
  }, [notifiedBookingId, bookings]);

  async function handleDeleteAccount() {
    const confirmed = await confirmAsync(
      'Delete your account?',
      "This permanently deletes your account and messages, removes your salon from Browse, and cancels your Pro subscription if active. Past bookings and reviews are kept in anonymized form so your customers' history stays intact. This cannot be undone."
    );
    if (!confirmed) return;

    const { error } = await supabase.functions.invoke('delete-account');
    if (error) {
      notify('Could not delete account', error instanceof Error ? error.message : 'Please try again.');
      return;
    }
    await supabase.auth.signOut();
  }

  function handleOpenMenu() {
    const isPro = groomerProfile?.plan === 'pro';
    showActionSheet('Menu', [
      { label: 'Setup checklist', onPress: () => router.push('/(salon)/welcome') },
      { label: 'Business info', onPress: () => router.push('/(salon)/business-info') },
      { label: 'Services & prices', onPress: () => router.push('/(salon)/services') },
      { label: 'Multi-pet discount', onPress: () => router.push('/(salon)/discount') },
      { label: 'Vaccination requirement', onPress: () => router.push('/(salon)/vaccination') },
      { label: 'Hours', onPress: () => router.push('/(salon)/hours') },
      { label: 'Groomers', onPress: () => router.push('/(salon)/staff') },
      { label: 'Invite your customers', onPress: () => router.push('/(salon)/invite') },
      {
        label: isPro ? 'Insights' : 'Insights (upgrade to Pro)',
        onPress: () => router.push(isPro ? '/(salon)/insights' : '/(salon)/plan'),
      },
      {
        label: isPro ? 'Win-back reminders' : 'Win-back reminders (upgrade to Pro)',
        onPress: () => router.push(isPro ? '/(salon)/reminders' : '/(salon)/plan'),
      },
      { label: 'Supplies', onPress: () => router.push('/(salon)/supplies') },
      { label: 'Help & support', onPress: () => router.push('/help') },
      { label: 'Sign out', destructive: true, onPress: () => supabase.auth.signOut() },
      { label: 'Delete account', destructive: true, onPress: handleDeleteAccount },
    ]);
  }

  async function confirmBookings(ids: string[], staffId: string | null) {
    setUpdatingId(ids[0]);
    const update: { status: 'confirmed'; staff_id?: string } = { status: 'confirmed' };
    if (staffId) update.staff_id = staffId;

    const { error: updateError } = await supabase.from('bookings').update(update).in('id', ids);
    setUpdatingId(null);

    if (updateError) {
      notify('Update failed', updateError.message);
      return;
    }
    await load();
    sendBookingEmail(ids[0], 'accepted');
  }

  // Accepts one booking or a whole multi-pet group together. A "first available"
  // request comes in unassigned - if the salon has 2+ groomers, ask which one to
  // assign (the same groomer takes every pet in the group) before confirming.
  function handleAccept(ids: string[], unassigned: boolean) {
    if (unassigned && staffList.length >= 2) {
      showActionSheet('Assign a groomer', [
        ...staffList.map((member) => ({
          label: member.name,
          onPress: () => confirmBookings(ids, member.id),
        })),
        { label: 'Leave unassigned', onPress: () => confirmBookings(ids, null) },
      ]);
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
      notify('Update failed', updateError.message);
      return;
    }
    await load();
    sendBookingEmail(ids[0], 'service_completed');
  }

  async function handleConfirmDecline(note: string) {
    if (!declineTargetIds) return;
    const ids = declineTargetIds;
    setUpdatingId(ids[0]);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'declined', cancellation_reason: note, cancelled_by: 'groomer' })
      .in('id', ids);

    setUpdatingId(null);
    setDeclineTargetIds(null);

    if (updateError) {
      notify('Update failed', updateError.message);
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
      notify('Update failed', updateError.message);
      return;
    }
    await load();
    sendBookingEmail(ids[0], 'groomer_cancelled');
  }

  async function handleSubmitReport(reason: string, details: string) {
    if (!reportTargetId) return;

    setSubmittingReport(true);
    try {
      await submitReport(reportTargetId, reason, details || undefined);
      setReportTargetId(null);
      notify('Report submitted', 'Thanks for letting us know — our team will review it.');
    } catch (err) {
      notify('Could not submit report', err instanceof Error ? err.message : 'Something went wrong.');
    }
    setSubmittingReport(false);
  }

  function renderGroupCard(entry: SalonEntry) {
    const rows = entry.bookings;
    const lead = entry.lead;
    const status = groupSalonStatus(rows);
    const isHighlighted = rows.some((b) => b.id === highlightedId);
    const ids = rows.map((b) => b.id);
    const petNames = rows.map((b) => b.petName).join(', ');
    const uniqueServiceNames = Array.from(new Set(rows.map((b) => b.serviceName)));
    const hasMixedServices = uniqueServiceNames.length > 1;
    const headerServiceLabel = hasMixedServices
      ? `${uniqueServiceNames.length} services`
      : lead.serviceName;
    const notServiceDone = rows.filter((b) => b.status === 'confirmed' && !b.serviceCompletedAt);
    const readyToBill = rows.filter((b) => b.status === 'confirmed' && b.serviceCompletedAt);
    const billed = rows.filter((b) => b.status === 'completed');
    const active = status === 'pending' || status === 'confirmed';
    const totalPaidCents = billed.reduce((sum, b) => sum + (b.invoiceTotalCents ?? 0), 0);
    const busy = updatingId != null && ids.includes(updatingId);

    return (
      <View style={[styles.card, isHighlighted && styles.cardHighlighted]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardService}>{headerServiceLabel}</Text>
          <StatusBadge status={status} />
        </View>
        <View style={styles.groupBadge}>
          <Text style={styles.groupBadgeText}>{rows.length} pets · one visit</Text>
        </View>
        <Text style={styles.cardMeta}>
          {petNames}
          {lead.staffName ? ` · with ${lead.staffName}` : ''}
        </Text>
        <Text style={styles.cardMeta}>
          {new Date(lead.startsAt).toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>

        {status !== 'cancelled' &&
          status !== 'declined' &&
          rows.map((b) => (
            <View key={b.id} style={styles.groupPetCare}>
              <Text style={styles.groupPetName}>
                {b.petName} <Text style={styles.groupPetService}>· {b.serviceName}</Text>
              </Text>
              <PetCareSummary info={b.petCare} />
            </View>
          ))}

        {status === 'declined' && lead.cancellationReason && (
          <Text style={styles.reasonText}>Your note: {lead.cancellationReason}</Text>
        )}
        {status === 'cancelled' && lead.cancellationReason && (
          <Text style={styles.reasonText}>Reason: {lead.cancellationReason}</Text>
        )}

        {billed.length > 0 && totalPaidCents > 0 && (
          <Text style={styles.paidText}>Paid ${(totalPaidCents / 100).toFixed(2)} total</Text>
        )}

        {status === 'pending' && (
          <View style={styles.actions}>
            <Button
              label="Accept all"
              onPress={() => handleAccept(ids, !lead.staffId)}
              loading={busy}
              style={styles.actionButtonFlex}
            />
            <Button
              label="Decline"
              variant="danger"
              onPress={() => setDeclineTargetIds(ids)}
              disabled={busy}
              style={styles.actionButtonFlex}
            />
          </View>
        )}

        {status === 'confirmed' && notServiceDone.length > 0 && (
          <Button
            label={`Complete service${notServiceDone.length < rows.length ? ` (${notServiceDone.length} left)` : ''}`}
            onPress={() => handleCompleteService(notServiceDone.map((b) => b.id))}
            loading={busy}
            style={styles.groupActionButton}
          />
        )}

        {readyToBill.length > 0 && (
          <Button
            label={`Complete & invoice (${readyToBill.length} ${readyToBill.length === 1 ? 'pet' : 'pets'})`}
            onPress={() =>
              router.push({ pathname: '/(salon)/complete-group/[groupId]', params: { groupId: entry.key } })
            }
            style={styles.groupActionButton}
          />
        )}

        {active && (
          <Button
            label="Cancel visit"
            variant="danger"
            onPress={() => setCancelTargetIds(ids)}
            disabled={busy}
            style={styles.groupActionButton}
          />
        )}

        {(status === 'completed' || status === 'cancelled') && (
          <Pressable style={styles.reportLink} onPress={() => setReportTargetId(lead.id)}>
            <Text style={styles.reportLinkText}>Report an issue</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, webContentWidth('content')]} edges={['top']}>
      <AppHeader
        title={groomerProfile?.name ?? ''}
        subtitle="Dashboard"
        stackRight
        right={
          <View style={styles.headerActions}>
            {groomerProfile && <MessagesIconButton groomerId={groomerProfile.id} />}
            {groomerProfile && (
              <GroomerNotificationBell
                groomerId={groomerProfile.id}
                onSelectBooking={handleSelectBookingFromNotification}
              />
            )}
            <Pressable style={styles.iconButton} onPress={handleOpenMenu} hitSlop={8}>
              <Ionicons name="menu-outline" size={22} color={Colors.light.text} />
              {groomerProfile?.plan !== 'pro' && (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={9} color={Colors.light.text} />
                </View>
              )}
            </Pressable>
          </View>
        }
      />

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}
      {error && <Text style={styles.error}>Couldn&apos;t load bookings: {error}</Text>}

      {!loading && !error && (
        <FlatList showsVerticalScrollIndicator={false}
          ref={flatListRef}
          data={displayedEntries}
          keyExtractor={(entry) => entry.key}
          style={[styles.flatList, webFlushScroll]}
          contentContainerStyle={styles.list}
          initialNumToRender={Platform.OS === 'web' ? 200 : 10}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
            }, 200);
          }}
          ListHeaderComponent={
            <View>
              <Pressable style={styles.planBanner} onPress={() => router.push('/(salon)/plan')}>
                <IconChip name={groomerProfile?.plan === 'pro' ? 'star' : 'star-outline'} tone="tint" size={28} />
                <Text style={styles.planBannerText}>
                  {groomerProfile?.plan === 'pro'
                    ? 'On the Pro plan · Manage subscription'
                    : 'Upgrade to Pro for Insights + the AI chat assistant'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.light.textMuted} />
              </Pressable>

              <Pressable style={styles.planBanner} onPress={() => router.push('/(salon)/payouts')}>
                <IconChip
                  name={groomerProfile?.payoutsEnabled ? 'checkmark-circle' : 'card-outline'}
                  tone="tint"
                  size={28}
                />
                <Text style={styles.planBannerText}>
                  {groomerProfile?.payoutsEnabled
                    ? 'Payouts active · View details'
                    : 'Connect your bank account to get paid'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.light.textMuted} />
              </Pressable>

              {lowStockCount > 0 && (
                <Pressable style={styles.planBanner} onPress={() => router.push('/(salon)/supplies')}>
                  <IconChip name="alert-circle" tone="danger" size={28} />
                  <Text style={styles.planBannerText}>
                    {lowStockCount} suppl{lowStockCount === 1 ? 'y' : 'ies'} low on stock · Reorder
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.light.textMuted} />
                </Pressable>
              )}

              <View style={styles.statsGrid}>
                <Pressable
                  style={[
                    styles.statCard,
                    styles.statCardWarning,
                    statFilter === 'pending' && styles.statCardActive,
                  ]}
                  onPress={() => toggleStatFilter('pending')}>
                  <View style={styles.statIconWrap}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={17}
                      color={statFilter === 'pending' ? Colors.light.text : Colors.light.warning}
                    />
                  </View>
                  <Text style={[styles.statValue, statFilter === 'pending' && styles.statValueActive]}>
                    {stats.pendingCount}
                  </Text>
                  <Text style={[styles.statLabel, statFilter === 'pending' && styles.statLabelActive]}>
                    Pending requests
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.statCard,
                    styles.statCardTint,
                    statFilter === 'upcoming' && styles.statCardActive,
                  ]}
                  onPress={() => toggleStatFilter('upcoming')}>
                  <View style={styles.statIconWrap}>
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color={statFilter === 'upcoming' ? Colors.light.text : Colors.light.tint}
                    />
                  </View>
                  <Text style={[styles.statValue, statFilter === 'upcoming' && styles.statValueActive]}>
                    {stats.upcomingCount}
                  </Text>
                  <Text style={[styles.statLabel, statFilter === 'upcoming' && styles.statLabelActive]}>
                    Upcoming
                  </Text>
                </Pressable>
                <View style={[styles.statCard, styles.statCardNeutral]}>
                  <View style={styles.statIconWrap}>
                    <Ionicons name="people-outline" size={16} color={Colors.light.textMuted} />
                  </View>
                  <Text style={styles.statValue}>{stats.customerCount}</Text>
                  <Text style={styles.statLabel}>Customers</Text>
                </View>
                <Pressable
                  style={[
                    styles.statCard,
                    styles.statCardSuccess,
                    statFilter === 'ready_to_bill' && styles.statCardActive,
                  ]}
                  onPress={() => toggleStatFilter('ready_to_bill')}>
                  <View style={styles.statIconWrap}>
                    <Ionicons
                      name="cash-outline"
                      size={16}
                      color={statFilter === 'ready_to_bill' ? Colors.light.text : Colors.light.success}
                    />
                  </View>
                  <Text style={[styles.statValue, statFilter === 'ready_to_bill' && styles.statValueActive]}>
                    {stats.readyToBillCount}
                  </Text>
                  <Text style={[styles.statLabel, statFilter === 'ready_to_bill' && styles.statLabelActive]}>
                    Ready to bill
                  </Text>
                </Pressable>
              </View>

              {statFilter && (
                <Pressable style={styles.clearFilter} onPress={() => setStatFilter(null)}>
                  <Text style={styles.clearFilterText}>
                    Showing{' '}
                    {statFilter === 'pending'
                      ? 'pending requests'
                      : statFilter === 'upcoming'
                        ? 'upcoming appointments'
                        : 'appointments ready to bill'}{' '}
                    only · Clear
                  </Text>
                </Pressable>
              )}

              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleButton, viewMode === 'list' && styles.toggleButtonActive]}
                  onPress={() => setViewMode('list')}>
                  <Ionicons
                    name="list"
                    size={15}
                    color={viewMode === 'list' ? Colors.light.text : Colors.light.textMuted}
                  />
                  <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>
                    Cards
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleButton, viewMode === 'calendar' && styles.toggleButtonActive]}
                  onPress={() => setViewMode('calendar')}>
                  <Ionicons
                    name="calendar-outline"
                    size={15}
                    color={viewMode === 'calendar' ? Colors.light.text : Colors.light.textMuted}
                  />
                  <Text style={[styles.toggleText, viewMode === 'calendar' && styles.toggleTextActive]}>
                    Calendar
                  </Text>
                </Pressable>
              </View>

              {viewMode === 'calendar' && (
                <>
                  <BookingCalendar
                    month={calendarMonth}
                    selectedDay={selectedDay}
                    bookings={bookings}
                    onChangeMonth={(delta) => setCalendarMonth((m) => addMonths(m, delta))}
                    onSelectDay={setSelectedDay}
                  />
                  <Text style={styles.dayListLabel}>
                    {selectedDay.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Text>
                </>
              )}
            </View>
          }
          renderItem={({ item: entry }) => {
            if (entry.bookings.length > 1) return renderGroupCard(entry);
            const item = entry.bookings[0];
            return (
            <View style={[styles.card, item.id === highlightedId && styles.cardHighlighted]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardService}>{item.serviceName}</Text>
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.cardMeta}>
                for {item.petName}
                {item.staffName ? ` · with ${item.staffName}` : ''}
              </Text>
              <Text style={styles.cardMeta}>
                {new Date(item.startsAt).toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>

              {item.status !== 'cancelled' && item.status !== 'declined' && (
                <PetCareSummary info={item.petCare} />
              )}

              {item.status === 'declined' && item.cancellationReason && (
                <Text style={styles.reasonText}>Your note: {item.cancellationReason}</Text>
              )}

              {item.status === 'cancelled' && item.cancellationReason && (
                <Text style={styles.reasonText}>Reason: {item.cancellationReason}</Text>
              )}

              {item.status === 'completed' && item.invoiceTotalCents != null && (
                <>
                  <Text style={styles.paidText}>Paid ${(item.invoiceTotalCents / 100).toFixed(2)}</Text>
                  {item.platformFeeCents != null && item.platformFeeCents > 0 && (
                    <Text style={styles.feeText}>
                      PawBooker fee −${(item.platformFeeCents / 100).toFixed(2)} · You received $
                      {((item.invoiceTotalCents - item.platformFeeCents) / 100).toFixed(2)}
                    </Text>
                  )}
                </>
              )}

              {item.paymentStatus === 'failed' && (
                <Text style={styles.reasonText}>Payment failed — retry from Complete &amp; invoice</Text>
              )}

              {(item.status === 'pending' || item.status === 'confirmed') && (
                <View style={styles.actions}>
                  {item.status === 'pending' && (
                    <Button
                      label="Accept"
                      onPress={() => handleAccept([item.id], !item.staffId)}
                      loading={updatingId === item.id}
                      style={styles.actionButtonFlex}
                    />
                  )}
                  {item.status === 'confirmed' && !item.serviceCompletedAt && (
                    <Button
                      label="Complete service"
                      onPress={() => handleCompleteService([item.id])}
                      loading={updatingId === item.id}
                      style={styles.actionButtonFlex}
                    />
                  )}
                  {item.status === 'confirmed' && item.serviceCompletedAt && (
                    <Button
                      label="Complete & invoice"
                      onPress={() =>
                        router.push({ pathname: '/(salon)/complete/[bookingId]', params: { bookingId: item.id } })
                      }
                      style={styles.actionButtonFlex}
                    />
                  )}
                  {item.status === 'pending' ? (
                    <Button
                      label="Decline"
                      variant="danger"
                      onPress={() => setDeclineTargetIds([item.id])}
                      disabled={updatingId === item.id}
                      style={styles.actionButtonFlex}
                    />
                  ) : (
                    <Button
                      label="Cancel"
                      variant="danger"
                      onPress={() => setCancelTargetIds([item.id])}
                      disabled={updatingId === item.id}
                      style={styles.actionButtonFlex}
                    />
                  )}
                </View>
              )}

              {(item.status === 'completed' || item.status === 'cancelled') && (
                <Pressable style={styles.reportLink} onPress={() => setReportTargetId(item.id)}>
                  <Text style={styles.reportLinkText}>Report an issue</Text>
                </Pressable>
              )}
            </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="paw-outline" size={28} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>
                {statFilter
                  ? `No ${
                      statFilter === 'pending'
                        ? 'pending requests'
                        : statFilter === 'upcoming'
                          ? 'upcoming appointments'
                          : 'appointments ready to bill'
                    }`
                  : viewMode === 'calendar'
                    ? 'No bookings on this day'
                    : 'No booking requests yet'}
              </Text>
            </View>
          }
        />
      )}

      <CancelBookingModal
        visible={cancelTargetIds != null}
        submitting={cancelTargetIds != null && updatingId === cancelTargetIds[0]}
        onDismiss={() => setCancelTargetIds(null)}
        onConfirm={handleConfirmCancel}
        subtitle={
          cancelTargetIds && cancelTargetIds.length > 1
            ? `This cancels all ${cancelTargetIds.length} pets in this visit.`
            : undefined
        }
      />

      <CancelBookingModal
        visible={declineTargetIds != null}
        submitting={declineTargetIds != null && updatingId === declineTargetIds[0]}
        onDismiss={() => setDeclineTargetIds(null)}
        onConfirm={handleConfirmDecline}
        title="Decline request"
        subtitle={
          declineTargetIds && declineTargetIds.length > 1
            ? `Declining all ${declineTargetIds.length} pets in this visit. Let the customer know why, and suggest another day or time.`
            : 'Let the customer know why, and suggest another day or time. They can rebook from your note.'
        }
        placeholder="e.g. I'm booked that day — I have openings Wed or Thu afternoon"
        confirmLabel="Decline request"
      />

      <ReportModal
        visible={reportTargetId != null}
        reasons={REPORT_REASONS}
        submitting={submittingReport}
        onDismiss={() => setReportTargetId(null)}
        onSubmit={handleSubmitReport}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    // Wider gutters on web than the native phone layout; content width
    // itself is capped by webContentWidth('dashboard') on the FlatList
    // below, not here (see constants/webLayout.ts).
    padding: Platform.OS === 'web' ? 28 : 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.light.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    marginTop: 24,
  },
  error: {
    marginTop: 24,
    fontSize: 15,
    color: Colors.light.danger,
  },
  flatList: {
    flex: 1,
  },
  list: {
    marginTop: 16,
    gap: 14,
    paddingBottom: 40,
  },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  planBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
    marginBottom: 16,
  },
  // Fixed, centered box (rather than styling the icon directly) so glyphs
  // with different internal padding (calendar vs. people vs. cash) still
  // line up on the same baseline across all four cards.
  statIconWrap: {
    height: 20,
    justifyContent: 'center',
    marginBottom: 8,
  },
  statCard: {
    // On web the outer canvas is full browser width, so a fixed 2-up grid
    // leaves each tile a huge mostly-empty box - 4-up actually uses the
    // space. Native keeps the original 2-up phone layout.
    width: Platform.OS === 'web' ? '23.5%' : '48%',
    backgroundColor: Colors.light.surfaceElevated,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 2,
  },
  statCardWarning: { borderLeftColor: Colors.light.warning },
  statCardTint: { borderLeftColor: Colors.light.tint },
  statCardSuccess: { borderLeftColor: Colors.light.success },
  // Customers isn't filterable like the other three, but it still needs a
  // left accent so the row reads as one consistent set instead of three
  // matching cards plus one that looks unfinished.
  statCardNeutral: { borderLeftColor: Colors.light.textMuted },
  statCardActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
    borderLeftColor: Colors.light.tint,
  },
  // White-on-sage measured weaker contrast than dark ink-on-sage (same fix
  // already made on the dashboard's equivalent stat cards).
  statValueActive: {
    color: Colors.light.text,
  },
  statLabelActive: {
    color: 'rgba(43,51,44,0.75)',
  },
  clearFilter: {
    marginTop: -6,
    marginBottom: 16,
  },
  clearFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.light.text,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  toggleButtonActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textMuted,
  },
  toggleTextActive: {
    color: Colors.light.text,
  },
  dayListLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  card: {
    backgroundColor: Colors.light.surfaceElevated,
    borderRadius: 14,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 2,
  },
  cardHighlighted: {
    borderColor: Colors.light.tint,
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardService: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
  },
  groupBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.light.tint,
  },
  groupBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.text,
  },
  groupPetCare: {
    marginTop: 8,
  },
  groupPetName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  groupPetService: {
    fontWeight: '400',
    color: Colors.light.textMuted,
  },
  groupActionButton: {
    marginTop: 10,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  reasonText: {
    marginTop: 8,
    fontSize: 13,
    fontStyle: 'italic',
    color: Colors.light.danger,
  },
  reportLink: {
    marginTop: 10,
    alignItems: 'center',
  },
  reportLinkText: {
    fontSize: 12,
    color: Colors.light.textMuted,
    textDecorationLine: 'underline',
  },
  paidText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.success,
  },
  feeText: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  actions: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 14,
  },
  actionButtonFlex: {
    width: '100%',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 40,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.light.textMuted,
  },
});
