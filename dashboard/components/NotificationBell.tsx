'use client';

import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

type NotificationType = 'booking_requested' | 'booking_cancelled' | 'booking_rescheduled';

type Notification = {
  id: string;
  bookingId: string;
  type: NotificationType;
  readAt?: string;
  createdAt: string;
  petName?: string;
  serviceName?: string;
};

const LABELS: Record<NotificationType, string> = {
  booking_requested: 'New booking request',
  booking_cancelled: 'Booking cancelled',
  booking_rescheduled: 'Booking rescheduled',
};

// Ported from components/GroomerNotificationBell.tsx - same groomer_notifications
// table and read/clear behavior, a dropdown here instead of a bottom sheet since
// this nav bar has the room. Clicking a row deep-links into the dashboard via a
// ?booking= query param (see page.tsx) rather than a shared callback, since Nav
// and the dashboard page don't otherwise share state.
export function NotificationBell({ groomerId }: { groomerId: string }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('groomer_notifications')
      .select('id, booking_id, type, read_at, created_at, bookings(pets(name), groomer_services(name))')
      .eq('groomer_id', groomerId)
      .order('created_at', { ascending: false })
      .limit(30);

    setNotifications(
      (data ?? []).map((row) => {
        const booking = row.bookings as unknown as {
          pets: { name: string } | null;
          groomer_services: { name: string } | null;
        } | null;
        return {
          id: row.id,
          bookingId: row.booking_id,
          type: row.type,
          readAt: row.read_at ?? undefined,
          createdAt: row.created_at,
          petName: booking?.pets?.name,
          serviceName: booking?.groomer_services?.name,
        };
      })
    );
  }, [groomerId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  async function handleToggle() {
    const wasOpen = open;
    setOpen(!wasOpen);
    if (wasOpen) return;

    const unreadIds = notifications.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('groomer_notifications').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
    load();
  }

  async function handleClearAll() {
    await supabase.from('groomer_notifications').delete().eq('groomer_id', groomerId);
    load();
  }

  function handleClickNotification(bookingId: string) {
    setOpen(false);
    router.push(`/?booking=${bookingId}`);
  }

  return (
    <div className="nav-menu-wrap" ref={wrapRef}>
      <button className="nav-icon-btn nav-bell-btn" onClick={handleToggle} aria-label="Activity">
        <Bell size={16} strokeWidth={2} />
        {unreadCount > 0 && <span className="nav-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="nav-menu-panel nav-bell-panel">
          <div className="nav-bell-header">
            <span>Activity</span>
            {notifications.length > 0 && (
              <button className="nav-bell-clear" onClick={handleClearAll}>
                Clear all
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="nav-bell-empty">No activity yet.</p>
          ) : (
            notifications.map((n) => (
              <button key={n.id} className="nav-menu-item nav-bell-item" onClick={() => handleClickNotification(n.bookingId)}>
                <p className="nav-bell-item-title">{LABELS[n.type]}</p>
                <p className="nav-bell-item-meta">
                  {n.petName ?? 'A pet'} · {n.serviceName ?? 'Service'}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
