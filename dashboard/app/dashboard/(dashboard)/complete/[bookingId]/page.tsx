'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PetCareBox } from '@/components/PetCareBox';
import { PetNoteBox } from '@/components/PetNoteBox';
import type { PetCareInfo } from '@/lib/bookings';
import { perBookingDiscountCents, type GroupDiscountSnapshot } from '@/lib/discount';
import { fetchPetNotes } from '@/lib/petNotes';
import { chargeBooking, markBookingPaidCash } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type LineItem = { description: string; amountCents: number };

type PetRow = {
  name: string;
  is_microchipped?: boolean;
  microchip_number?: string | null;
  vet_name?: string | null;
  vet_phone?: string | null;
};

export default function CompleteBookingPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();

  const [petName, setPetName] = useState('');
  const [petCare, setPetCare] = useState<PetCareInfo>({});
  const [petNote, setPetNote] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [charging, setCharging] = useState(false);
  const [markingCash, setMarkingCash] = useState(false);
  const [cashBlocked, setCashBlocked] = useState(false);
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [bookingResult, existingItemsResult] = await Promise.all([
        supabase
          .from('bookings')
          .select(
            'customer_id, groomer_id, group_id, pet_id, is_anxious, is_matted, needs_extra_care, care_notes, pets(name, is_microchipped, microchip_number, vet_name, vet_phone), groomer_services(name, price_cents), groomers(plan)'
          )
          .eq('id', bookingId)
          .single(),
        supabase.from('booking_line_items').select('description, amount_cents').eq('booking_id', bookingId),
      ]);

      if (cancelled) return;

      if (bookingResult.error || !bookingResult.data) {
        setLoadError(bookingResult.error?.message ?? 'Booking not found');
        setLoading(false);
        return;
      }

      const pet = bookingResult.data.pets as unknown as PetRow | null;
      const service = bookingResult.data.groomer_services as unknown as { name: string; price_cents: number };
      const groomer = bookingResult.data.groomers as unknown as { plan: string };
      setPetName(pet?.name ?? 'Pet');
      setPetCare({
        isAnxious: bookingResult.data.is_anxious ?? false,
        isMatted: bookingResult.data.is_matted ?? false,
        needsExtraCare: bookingResult.data.needs_extra_care ?? false,
        careNotes: bookingResult.data.care_notes ?? undefined,
        isMicrochipped: pet?.is_microchipped ?? false,
        microchipNumber: pet?.microchip_number ?? undefined,
        vetName: pet?.vet_name ?? undefined,
        vetPhone: pet?.vet_phone ?? undefined,
      });
      setServiceName(service?.name ?? 'Service');

      const petId = bookingResult.data.pet_id as string | null;
      if (petId) {
        const notes = await fetchPetNotes(bookingResult.data.groomer_id, [petId]);
        if (!cancelled) setPetNote(notes[petId] ?? '');
      }

      // An app-acquired customer's first booking must be paid by card so the
      // 5% acquisition fee is collectible - mirrors the server-side rule.
      if (groomer?.plan !== 'pro') {
        const { data: pairing } = await supabase
          .from('groomer_customers')
          .select('origin, acquisition_settled')
          .eq('groomer_id', bookingResult.data.groomer_id)
          .eq('customer_id', bookingResult.data.customer_id)
          .maybeSingle();
        if (!cancelled) {
          setCashBlocked((pairing?.origin ?? 'search') === 'search' && !(pairing?.acquisition_settled ?? false));
        }
      }

      if (existingItemsResult.data && existingItemsResult.data.length > 0) {
        setLineItems(
          existingItemsResult.data.map((item) => ({
            description: item.description,
            amountCents: item.amount_cents,
          }))
        );
      } else {
        const defaults: LineItem[] = [
          { description: service?.name ?? 'Service', amountCents: service?.price_cents ?? 0 },
        ];

        const groupId = bookingResult.data.group_id as string | null;
        if (groupId) {
          const [groupResult, siblingsResult] = await Promise.all([
            supabase.from('booking_groups').select('discount_type, discount_value').eq('id', groupId).single(),
            supabase.from('bookings').select('groomer_services(price_cents)').eq('group_id', groupId),
          ]);
          const snapshot: GroupDiscountSnapshot | null =
            groupResult.data?.discount_type && groupResult.data?.discount_value != null
              ? { type: groupResult.data.discount_type, value: groupResult.data.discount_value }
              : null;
          const groupTotalCents = (siblingsResult.data ?? []).reduce(
            (sum, row) =>
              sum + ((row.groomer_services as unknown as { price_cents: number } | null)?.price_cents ?? 0),
            0
          );
          const discountCents = perBookingDiscountCents(service?.price_cents ?? 0, groupTotalCents, snapshot);
          if (discountCents > 0) {
            defaults.push({ description: 'Multi-pet discount', amountCents: -discountCents });
          }
        }

        if (cancelled) return;
        setLineItems(defaults);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  function handleAddLineItem() {
    const amountCents = Math.round(Number(newAmount) * 100);
    if (!newDescription.trim() || !Number.isFinite(amountCents) || amountCents <= 0) return;

    setLineItems((prev) => [...prev, { description: newDescription.trim(), amountCents }]);
    setNewDescription('');
    setNewAmount('');
  }

  function handleRemoveLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  const totalCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  const busy = charging || markingCash;

  async function saveLineItems() {
    await supabase.from('booking_line_items').delete().eq('booking_id', bookingId);
    const { error } = await supabase.from('booking_line_items').insert(
      lineItems.map((item) => ({
        booking_id: bookingId,
        description: item.description,
        amount_cents: item.amountCents,
      }))
    );
    if (error) throw new Error(error.message);
  }

  async function handleChargeAndComplete() {
    if (lineItems.length === 0 || totalCents <= 0) return;
    setCharging(true);

    try {
      await saveLineItems();
      await chargeBooking(bookingId);
      router.push('/dashboard');
    } catch (err) {
      window.alert(`Charge failed: ${err instanceof Error ? err.message : 'Something went wrong'}`);
    } finally {
      setCharging(false);
    }
  }

  async function handleMarkPaidCash() {
    if (lineItems.length === 0 || totalCents <= 0) return;
    setMarkingCash(true);

    try {
      await saveLineItems();
      await markBookingPaidCash(bookingId);
      router.push('/dashboard');
    } catch (err) {
      window.alert(`Could not record payment: ${err instanceof Error ? err.message : 'Something went wrong'}`);
    } finally {
      setMarkingCash(false);
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" aria-hidden />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="settings-page width-form">
        <button className="back-link" onClick={() => router.back()}>
          ← Back
        </button>
        <p className="sign-in-error">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="settings-page width-form">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>

      <div className={`card ${styles.page}`}>
      <h1 className="page-title">Complete & invoice</h1>
      <p className="page-subtitle">
        {serviceName} for {petName}
      </p>

      <PetCareBox info={petCare} />
      <PetNoteBox note={petNote} />

      <h2 className={styles.sectionTitle}>Invoice items</h2>
      <Card className={styles.invoiceCard}>
        {lineItems.map((item, index) => (
          <div key={`${item.description}-${index}`} className={styles.lineItemRow}>
            <span className={styles.lineItemDescription}>{item.description}</span>
            <span className={styles.lineItemAmount}>
              {item.amountCents < 0 ? '−' : ''}${(Math.abs(item.amountCents) / 100).toFixed(2)}
            </span>
            <button className={styles.removeBtn} onClick={() => handleRemoveLineItem(index)}>
              Remove
            </button>
          </div>
        ))}

        <div className={styles.addItemForm}>
          <input
            className={styles.descriptionInput}
            placeholder="Item description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <input
            className={styles.amountInput}
            placeholder="0.00"
            inputMode="decimal"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
          />
          <Button label="Add" variant="secondary" onClick={handleAddLineItem} />
        </div>

        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>Subtotal</span>
          <span className={styles.totalAmount}>${(totalCents / 100).toFixed(2)}</span>
        </div>
        <p className={styles.taxNote}>Sales tax (if applicable) is calculated and added at checkout.</p>
      </Card>

      {cashBlocked && totalCents > 0 && (
        <Card className={styles.feeCard}>
          <p className={styles.feeCardTitle}>New customer from PawBooker</p>
          <div className={styles.feeRow}>
            <span>One-time acquisition fee (5%)</span>
            <span>−${(Math.round(totalCents * 0.05) / 100).toFixed(2)}</span>
          </div>
          <div className={`${styles.feeRow} ${styles.feeRowBold}`}>
            <span>You receive</span>
            <span>${((totalCents - Math.round(totalCents * 0.05)) / 100).toFixed(2)}</span>
          </div>
          <p className={styles.feeCardNote}>
            Applies only to this first booking. Future visits from this customer have no fee.
          </p>
        </Card>
      )}

      <Button
        label="Charge & complete"
        onClick={handleChargeAndComplete}
        loading={charging}
        disabled={busy || totalCents <= 0}
      />

      {cashBlocked ? (
        <p className={styles.cashBlockedNote}>
          This customer&apos;s first booking came through PawBooker, so it must be paid by card. You can mark cash
          on their future visits.
        </p>
      ) : (
        <>
          <Button
            label="Mark as paid (cash)"
            variant="secondary"
            onClick={handleMarkPaidCash}
            loading={markingCash}
            disabled={busy || totalCents <= 0}
          />
          <p className={styles.cashNote}>Use this if your customer paid you directly in cash.</p>
        </>
      )}
      </div>
    </div>
  );
}
