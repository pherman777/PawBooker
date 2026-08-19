'use client';

import { Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type StaffMember = {
  id: string;
  name: string;
};

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function StaffPage() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const groomerId = groomerProfile?.id;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    if (!groomerId) return;
    setLoading(true);

    const { data, error: queryError } = await supabase
      .from('salon_staff')
      .select('id, name')
      .eq('salon_id', groomerId)
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (queryError) {
      setError(queryError.message);
    } else {
      setStaff((data ?? []).map((row) => ({ id: row.id, name: row.name })));
    }
    setLoading(false);
  }, [groomerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRemove(member: StaffMember) {
    const confirmed = window.confirm(
      `Remove ${member.name}? Existing bookings with them stay, but customers can no longer choose them.`
    );
    if (!confirmed) return;

    // Deactivate rather than delete so past bookings keep their staff reference.
    const { error: updateError } = await supabase.from('salon_staff').update({ active: false }).eq('id', member.id);
    if (updateError) {
      window.alert(`Could not remove: ${updateError.message}`);
      return;
    }
    setStaff((current) => current.filter((s) => s.id !== member.id));
  }

  async function handleAdd() {
    if (!groomerId || !newName.trim()) {
      window.alert("Enter the groomer's name first.");
      return;
    }

    setAdding(true);
    const { data, error: insertError } = await supabase
      .from('salon_staff')
      .insert({ salon_id: groomerId, name: newName.trim() })
      .select('id, name')
      .single();
    setAdding(false);

    if (insertError || !data) {
      window.alert(`Could not add groomer: ${insertError?.message ?? 'Something went wrong.'}`);
      return;
    }

    setStaff((current) => [...current, { id: data.id, name: data.name }]);
    setNewName('');
    setShowAddForm(false);
  }

  return (
    <div className="settings-page width-form">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Groomers</h1>
      <p className="page-subtitle">
        Add the groomers who work at your salon. Customers can then request a specific groomer, and the
        booking calendar only offers times that groomer is free.
      </p>

      {loading ? (
        <span className="spinner" aria-hidden />
      ) : error ? (
        <p className={styles.error}>Couldn&apos;t load groomers: {error}</p>
      ) : (
        <>
          <button className={styles.addToggle} onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? 'Cancel' : '+ Add groomer'}
          </button>

          {showAddForm && (
            <div className={`card ${styles.addForm}`}>
              <input
                className="field-input"
                placeholder="Groomer's name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <Button label="Save" onClick={handleAdd} loading={adding} />
            </div>
          )}

          {staff.length === 0 && !showAddForm && (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIllustration}>
                <Users size={38} strokeWidth={1.6} />
              </div>
              <p className={styles.emptyTitle}>No groomers added yet</p>
              <p className={styles.emptyBody}>
                Until you add some, bookings apply to the salon as a whole. Add groomers so customers can request
                someone specific.
              </p>
              <Button label="+ Add groomer" onClick={() => setShowAddForm(true)} />
            </div>
          )}

          <div className={styles.list}>
            {staff.map((member) => (
              <div key={member.id} className={`card ${styles.row}`}>
                <div className={styles.rowLeft}>
                  <div className={styles.avatar}>{initials(member.name)}</div>
                  <span className={styles.rowName}>{member.name}</span>
                </div>
                <button className={styles.removeLink} onClick={() => handleRemove(member)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
