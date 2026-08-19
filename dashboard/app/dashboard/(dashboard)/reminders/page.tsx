'use client';

import { Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { sendCustomerReminder } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type CustomerReminderStatus = 'draft' | 'sent' | 'dismissed';

type CustomerReminder = {
  id: string;
  groomerId: string;
  customerId: string;
  customerEmail: string;
  lastBookingAt: string;
  draftSubject: string;
  draftBody: string;
  status: CustomerReminderStatus;
  createdAt: string;
  sentAt?: string;
};

function monthsAgo(dateString: string): string {
  const months = Math.max(1, Math.round((Date.now() - new Date(dateString).getTime()) / (30 * 86400000)));
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export default function RemindersPage() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [reminders, setReminders] = useState<CustomerReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Ported from the RN screen - it also self-checks the plan even though the
  // dashboard Nav's menu already keeps non-Pro groomers from reaching this
  // route, so this is a belt-and-suspenders redirect, not new gating.
  useEffect(() => {
    if (groomerProfile && groomerProfile.plan !== 'pro') {
      router.replace('/dashboard/plan');
    }
  }, [groomerProfile, router]);

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);

    const { data, error: queryError } = await supabase
      .from('customer_reminders')
      .select('id, groomer_id, customer_id, customer_email, last_booking_at, draft_subject, draft_body, status, created_at, sent_at')
      .eq('groomer_id', groomerProfile.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
    } else {
      setReminders(
        (data ?? []).map((row) => ({
          id: row.id,
          groomerId: row.groomer_id,
          customerId: row.customer_id,
          customerEmail: row.customer_email,
          lastBookingAt: row.last_booking_at,
          draftSubject: row.draft_subject,
          draftBody: row.draft_body,
          status: row.status,
          createdAt: row.created_at,
          sentAt: row.sent_at ?? undefined,
        }))
      );
    }
    setLoading(false);
  }, [groomerProfile]);

  useEffect(() => {
    load();
  }, [load]);

  function updateLocal(id: string, field: 'draftSubject' | 'draftBody', value: string) {
    setReminders((current) => current.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function handleSend(reminder: CustomerReminder) {
    setBusyId(reminder.id);
    try {
      const { error: updateError } = await supabase
        .from('customer_reminders')
        .update({ draft_subject: reminder.draftSubject, draft_body: reminder.draftBody })
        .eq('id', reminder.id);
      if (updateError) throw updateError;

      await sendCustomerReminder(reminder.id);
      setReminders((current) => current.filter((r) => r.id !== reminder.id));
      window.alert(`Reminder sent\n\nEmailed ${reminder.customerEmail}.`);
    } catch (err) {
      window.alert(`Could not send reminder\n\n${err instanceof Error ? err.message : 'Something went wrong.'}`);
    }
    setBusyId(null);
  }

  async function handleDismiss(reminder: CustomerReminder) {
    setBusyId(reminder.id);
    const { error: updateError } = await supabase
      .from('customer_reminders')
      .update({ status: 'dismissed' })
      .eq('id', reminder.id);
    setBusyId(null);

    if (updateError) {
      window.alert(`Could not dismiss\n\n${updateError.message}`);
      return;
    }
    setReminders((current) => current.filter((r) => r.id !== reminder.id));
  }

  return (
    <div className="settings-page width-form">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Win-back reminders</h1>
      <p className="page-subtitle">Customers who haven&apos;t booked in a while. Edit the draft if you&apos;d like, then send.</p>

      {loading && <span className="spinner" aria-hidden />}
      {error && <p className={styles.error}>Couldn&apos;t load reminders: {error}</p>}

      {!loading && !error && (
        <div className={styles.list}>
          {reminders.length === 0 && (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIllustration}>
                <Mail size={38} strokeWidth={1.6} />
              </div>
              <p className={styles.emptyTitle}>No lapsed customers right now</p>
              <p className={styles.emptyBody}>Nice work staying booked up — we&apos;ll draft a reminder here the next time someone&apos;s overdue.</p>
            </div>
          )}

          {reminders.map((reminder) => (
            <div key={reminder.id} className={`card ${styles.card}`}>
              <p className={styles.cardMeta}>
                {reminder.customerEmail} · last booked {monthsAgo(reminder.lastBookingAt)}
              </p>

              <label className="field-label" htmlFor={`subject-${reminder.id}`}>
                Subject
              </label>
              <input
                id={`subject-${reminder.id}`}
                className={`field-input ${styles.subjectInput}`}
                value={reminder.draftSubject}
                onChange={(e) => updateLocal(reminder.id, 'draftSubject', e.target.value)}
                disabled={busyId === reminder.id}
              />

              <label className="field-label" htmlFor={`body-${reminder.id}`}>
                Message
              </label>
              <textarea
                id={`body-${reminder.id}`}
                className={`field-input ${styles.bodyInput}`}
                value={reminder.draftBody}
                onChange={(e) => updateLocal(reminder.id, 'draftBody', e.target.value)}
                disabled={busyId === reminder.id}
              />

              <div className={styles.actions}>
                <Button
                  label="Dismiss"
                  variant="danger"
                  onClick={() => handleDismiss(reminder)}
                  disabled={busyId === reminder.id}
                  block
                />
                <Button
                  label="Send"
                  onClick={() => handleSend(reminder)}
                  loading={busyId === reminder.id}
                  disabled={busyId === reminder.id}
                  block
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
