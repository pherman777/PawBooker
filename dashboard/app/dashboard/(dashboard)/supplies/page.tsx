'use client';

import { PawPrint } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type GroomerSupply = {
  id: string;
  groomerId: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  reorderThreshold: number;
  reorderQuantity?: number;
  createdAt: string;
};

function toNumber(text: string): number {
  const n = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export default function SuppliesPage() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  const groomerId = groomerProfile?.id;
  const [supplies, setSupplies] = useState<GroomerSupply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('unit');
  const [newQuantity, setNewQuantity] = useState('');
  const [newThreshold, setNewThreshold] = useState('');
  const [newReorderQuantity, setNewReorderQuantity] = useState('');

  const load = useCallback(async () => {
    if (!groomerId) return;
    setLoading(true);

    const { data, error: queryError } = await supabase
      .from('groomer_supplies')
      .select('id, groomer_id, name, unit, quantity_on_hand, reorder_threshold, reorder_quantity, created_at')
      .eq('groomer_id', groomerId)
      .order('name', { ascending: true });

    if (queryError) {
      setError(queryError.message);
    } else {
      setSupplies(
        (data ?? []).map((row) => ({
          id: row.id,
          groomerId: row.groomer_id,
          name: row.name,
          unit: row.unit,
          quantityOnHand: row.quantity_on_hand,
          reorderThreshold: row.reorder_threshold,
          reorderQuantity: row.reorder_quantity ?? undefined,
          createdAt: row.created_at,
        }))
      );
    }
    setLoading(false);
  }, [groomerId]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedSupplies = useMemo(
    () =>
      [...supplies].sort((a, b) => {
        const aLow = a.quantityOnHand <= a.reorderThreshold;
        const bLow = b.quantityOnHand <= b.reorderThreshold;
        if (aLow !== bLow) return aLow ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [supplies]
  );

  function updateLocal(id: string, field: 'quantityOnHand' | 'reorderThreshold' | 'reorderQuantity', value: number) {
    setSupplies((current) => current.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }

  async function persistField(
    supply: GroomerSupply,
    field: 'quantity_on_hand' | 'reorder_threshold' | 'reorder_quantity',
    value: number
  ) {
    const { error: updateError } = await supabase.from('groomer_supplies').update({ [field]: value }).eq('id', supply.id);
    if (updateError) {
      window.alert(`Could not save: ${updateError.message}`);
    }
  }

  async function handleDelete(supply: GroomerSupply) {
    const confirmed = window.confirm(`Remove "${supply.name}" from your supply list?`);
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from('groomer_supplies').delete().eq('id', supply.id);
    if (deleteError) {
      window.alert(`Could not remove: ${deleteError.message}`);
      return;
    }
    setSupplies((current) => current.filter((s) => s.id !== supply.id));
  }

  async function handleAdd() {
    if (!groomerId || !newName.trim()) {
      window.alert('Give the supply a name first.');
      return;
    }

    setAdding(true);
    const { data, error: insertError } = await supabase
      .from('groomer_supplies')
      .insert({
        groomer_id: groomerId,
        name: newName.trim(),
        unit: newUnit.trim() || 'unit',
        quantity_on_hand: toNumber(newQuantity),
        reorder_threshold: toNumber(newThreshold),
        reorder_quantity: newReorderQuantity ? toNumber(newReorderQuantity) : null,
      })
      .select('id, groomer_id, name, unit, quantity_on_hand, reorder_threshold, reorder_quantity, created_at')
      .single();
    setAdding(false);

    if (insertError || !data) {
      window.alert(`Could not add supply: ${insertError?.message ?? 'Something went wrong.'}`);
      return;
    }

    setSupplies((current) => [
      ...current,
      {
        id: data.id,
        groomerId: data.groomer_id,
        name: data.name,
        unit: data.unit,
        quantityOnHand: data.quantity_on_hand,
        reorderThreshold: data.reorder_threshold,
        reorderQuantity: data.reorder_quantity ?? undefined,
        createdAt: data.created_at,
      },
    ]);
    setNewName('');
    setNewUnit('unit');
    setNewQuantity('');
    setNewThreshold('');
    setNewReorderQuantity('');
    setShowAddForm(false);
  }

  return (
    <div className="settings-page width-form">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Supplies</h1>
      <p className="page-subtitle">Track what you have on hand and get flagged when it&apos;s time to reorder.</p>

      {loading ? (
        <span className="spinner" aria-hidden />
      ) : error ? (
        <p className={styles.error}>Couldn&apos;t load supplies: {error}</p>
      ) : (
        <>
          <button className={styles.addToggle} onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? 'Cancel' : '+ Add supply'}
          </button>

          {showAddForm && (
            <div className={`card ${styles.addForm}`}>
              <input
                className="field-input"
                placeholder="Name (e.g. Shampoo)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <input
                className="field-input"
                placeholder="Unit (e.g. bottles)"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
              />
              <div className={styles.inputRow}>
                <input
                  className={`field-input ${styles.inputRowField}`}
                  placeholder="On hand"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  inputMode="decimal"
                />
                <input
                  className={`field-input ${styles.inputRowField}`}
                  placeholder="Reorder at"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(e.target.value)}
                  inputMode="decimal"
                />
                <input
                  className={`field-input ${styles.inputRowField}`}
                  placeholder="Reorder qty"
                  value={newReorderQuantity}
                  onChange={(e) => setNewReorderQuantity(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <Button label="Save" onClick={handleAdd} loading={adding} />
            </div>
          )}

          {sortedSupplies.length === 0 && !showAddForm && (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIllustration}>
                <PawPrint size={38} strokeWidth={1.6} />
              </div>
              <p className={styles.emptyTitle}>No supplies tracked yet</p>
              <p className={styles.emptyBody}>
                Add what you keep on hand so you get flagged automatically when it&apos;s time to reorder.
              </p>
              <Button label="+ Add supply" onClick={() => setShowAddForm(true)} />
            </div>
          )}

          <div className={styles.list}>
            {sortedSupplies.map((supply) => {
              const isLow = supply.quantityOnHand <= supply.reorderThreshold;
              return (
                <div key={supply.id} className={`card ${styles.card} ${isLow ? styles.cardLow : ''}`}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardName}>{supply.name}</span>
                    {isLow && <span className={styles.lowBadge}>Reorder</span>}
                  </div>

                  <div className={styles.fieldsRow}>
                    <div className={styles.field}>
                      <label className={`field-label ${styles.fieldLabelSmall}`}>On hand ({supply.unit})</label>
                      <input
                        className={`field-input ${styles.fieldInputSmall}`}
                        value={String(supply.quantityOnHand)}
                        inputMode="decimal"
                        onChange={(e) => updateLocal(supply.id, 'quantityOnHand', toNumber(e.target.value))}
                        onBlur={() => persistField(supply, 'quantity_on_hand', supply.quantityOnHand)}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={`field-label ${styles.fieldLabelSmall}`}>Reorder at</label>
                      <input
                        className={`field-input ${styles.fieldInputSmall}`}
                        value={String(supply.reorderThreshold)}
                        inputMode="decimal"
                        onChange={(e) => updateLocal(supply.id, 'reorderThreshold', toNumber(e.target.value))}
                        onBlur={() => persistField(supply, 'reorder_threshold', supply.reorderThreshold)}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={`field-label ${styles.fieldLabelSmall}`}>Reorder qty</label>
                      <input
                        className={`field-input ${styles.fieldInputSmall}`}
                        value={supply.reorderQuantity != null ? String(supply.reorderQuantity) : ''}
                        inputMode="decimal"
                        placeholder="-"
                        onChange={(e) => updateLocal(supply.id, 'reorderQuantity', toNumber(e.target.value))}
                        onBlur={() => persistField(supply, 'reorder_quantity', supply.reorderQuantity ?? 0)}
                      />
                    </div>
                  </div>

                  <button className={styles.deleteLink} onClick={() => handleDelete(supply)}>
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
