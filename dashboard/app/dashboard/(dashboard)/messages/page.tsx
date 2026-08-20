'use client';

import { MessageCircle, MoreVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { deleteThread, fetchGroomerThreads, markThreadRead, type ThreadRow } from '@/lib/groomerChat';

import styles from './page.module.css';

// Port of app/(salon)/messages.tsx - the groomer's inbox, previously
// only available in the native app.
export default function MessagesPage() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!groomerProfile) return;
    setLoading(true);
    setThreads(await fetchGroomerThreads(groomerProfile.id));
    setLoading(false);
  }, [groomerProfile]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkAsRead(threadId: string) {
    setOpenMenuId(null);
    await markThreadRead(threadId);
    await load();
  }

  async function handleDelete(threadId: string) {
    setOpenMenuId(null);
    await deleteThread(threadId);
    await load();
  }

  return (
    <div>
      <h1 className="page-title">Messages</h1>

      {loading && (
        <div className="page-loading">
          <span className="spinner" aria-hidden />
        </div>
      )}

      {!loading && (
        <div className={styles.list}>
          {threads.length === 0 && (
            <div className={styles.empty}>
              <div className={styles.emptyIllustration}>
                <MessageCircle size={34} strokeWidth={2} />
              </div>
              <p className={styles.emptyText}>No conversations yet</p>
            </div>
          )}

          {threads.map((thread) => (
            <div key={thread.id} className={`card ${styles.row}`}>
              <button type="button" className={styles.rowText} onClick={() => router.push(`/dashboard/messages/${thread.id}`)}>
                <div className={styles.rowHeader}>
                  <span className={styles.rowName}>{thread.customerLabel}</span>
                  {thread.needsHuman && <span className={styles.needsHumanPill}>Needs you</span>}
                </div>
                {thread.lastMessage && <div className={styles.rowPreview}>{thread.lastMessage}</div>}
              </button>
              {thread.unread && <span className={styles.unreadDot} />}
              <button type="button" className={styles.menuBtn} onClick={() => setOpenMenuId((v) => (v === thread.id ? null : thread.id))} aria-label="Conversation options">
                <MoreVertical size={18} strokeWidth={2} />
              </button>
              {openMenuId === thread.id && (
                <div className={styles.menuPanel}>
                  <button type="button" className={styles.menuItem} onClick={() => handleMarkAsRead(thread.id)}>
                    Mark as read
                  </button>
                  <button type="button" className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={() => handleDelete(thread.id)}>
                    Delete conversation
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
