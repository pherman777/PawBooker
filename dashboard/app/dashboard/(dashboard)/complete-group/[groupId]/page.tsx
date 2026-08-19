'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PetCareBox } from '@/components/PetCareBox';
import type { PetCareInfo } from '@/lib/bookings';
import { perBookingDiscountCents, type GroupDiscountSnapshot } from '@/lib/discount';
import { chargeBookingGroup, markBookingPaidCash } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type LineItem = { description: string; amountCents: number };

type PetInvoice = {
  bookingId: string;
  petName: string;
  petCare: PetCareInfo;
  serviceName: string;
  lineItems: LineItem[];
};

type PetRow = {
  name: string;
  is_microchipped?: boolean;
  microchip_number?: string | null;
  vet_name?: string | null;
  vet_phone?: string | null;
};

export default function CompleteGroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();

  const [pets, setPets] = useState<PetInvoice[]>([]);
  const [newDesc, setNewDesc] = useState<Record<string, string>>({});
  const [newAmt, setNewAmt] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [charging, setCharging] = useState(false);
  const [markingCash, setMarkingCash] = useState(false);
  const [cashBlocked, setCashBlocked] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);

    const { data: bookingRows, error } = await supabase
      .from('bookings')
      .select(
        'id, customer_id, groomer_id, starts_at, service_completed_at, status, is_anxious, is_matted, needs_extra_care, care_notes, pets(name, is_microchipped, microchip_number, vet_name, vet_phone), groomer_services(name, price_cents), groomers(plan)'
      )
      .eq('group_id', groupId)
      .eq('status', 'confirmed')
      .order('starts_at', { ascending: true });

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    const billable = (bookingRows ?? []).filter((b) => b.service_completed_at);
    if (billable.length === 0) {
      setLoadError('No pets are ready to bill in this visit yet.');
      setPets([]);
      setLoading(false);
      return;
    }

    const ids = billable.map((b) => b.id);
    const [groupResult, siblingsResult, existingItemsResult] = await Promise.all([
      supabase.from('booking_groups').select('discount_type, discount_value').eq('id', groupId).single(),
      supabase.from('bookings').select('groomer_services(price_cents)').eq('group_id', groupId),
      supabase.from('booking_line_items').select('booking_id, description, amount_cents').in('booking_id', ids),
    ]);

    const snapshot: GroupDiscountSnapshot | null =
      groupResult.data?.discount_type && groupResult.data?.discount_value != null
        ? { type: groupResult.data.discount_type, value: groupResult.data.discount_value }
        : null;
    const groupServiceTotalCents = (siblingsResult.data ?? []).reduce(
      (sum, row) => sum + ((row.groomer_services as unknown as { price_cents: number } | null)?.price_cents ?? 0),
      0
    );

    const itemsByBooking = new Map<string, LineItem[]>();
    for (const item of existingItemsResult.data ?? []) {
      const list = itemsByBooking.get(item.booking_id) ?? [];
      list.push({ description: item.description, amountCents: item.amount_cents });
      itemsByBooking.set(item.booking_id, list);
    }

    const invoices: PetInvoice[] = billable.map((b) => {
      const pet = b.pets as unknown as PetRow | null;
      const service = b.groomer_services as unknown as { name: string; price_cents: number };
      const existing = itemsByBooking.get(b.id);

      let lineItems: LineItem[];
      if (existing && existing.length > 0) {
        lineItems = existing;
      } else {
        lineItems = [{ description: service?.name ?? 'Service', amountCents: service?.price_cents ?? 0 }];
        const discountCents = perBookingDiscountCents(service?.price_cents ?? 0, groupServiceTotalCents, snapshot);
        if (discountCents > 0) lineItems.push({ description: 'Multi-pet discount', amountCents: -discountCents });
      }

      return {
        bookingId: b.id,
        petName: pet?.name ?? 'Pet',
        petCare: {
          isAnxious: b.is_anxious ?? false,
          isMatted: b.is_matted ?? false,
          needsExtraCare: b.needs_extra_care ?? false,
          careNotes: b.care_notes ?? undefined,
          isMicrochipped: pet?.is_microchipped ?? false,
          microchipNumber: pet?.microchip_number ?? undefined,
          vetName: pet?.vet_name ?? undefined,
          vetPhone: pet?.vet_phone ?? undefined,
        },
        serviceName: service?.name ?? 'Service',
        lineItems,
      };
    });
    setPets(invoices);

    const lead = billable[0];
    const groomerPlan = (lead.groomers as unknown as { plan: string })?.plan;
    if (groomerPlan !== 'pro') {
      const { data: pairing } = await supabase
        .from('groomer_customers')
        .select('origin, acquisition_settled')
        .eq('groomer_id', lead.groomer_id)
        .eq('customer_id', lead.customer_id)
        .maybeSingle();
      setCashBlocked((pairing?.origin ?? 'search') === 'search' && !(pairing?.acquisition_settled ?? false));
    } else {
      setCashBlocked(false);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  function updatePet(bookingId: string, updater: (items: LineItem[]) => LineItem[]) {
    setPets((prev) => prev.map((p) => (p.bookingId === bookingId ? { ...p, lineItems: updater(p.lineItems) } : p)));
  }

  function handleAddLineItem(bookingId: string) {
    const amountCents = Math.round(Number(newAmt[bookingId]) * 100);
    const description = (newDesc[bookingId] ?? '').trim();
    if (!description || !Number.isFinite(amountCents) || amountCents <= 0) return;

    updatePet(bookingId, (items) => [...items, { description, amountCents }]);
    setNewDesc((s) => ({ ...s, [bookingId]: '' }));
    setNewAmt((s) => ({ ...s, [bookingId]: '' }));
  }

  function handleRemoveLineItem(bookingId: string, index: number) {
    updatePet(bookingId, (items) => items.filter((_, i) => i !== index));
  }

  function petTotal(pet: PetInvoice): number {
    return pet.lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  }

  const grandTotalCents = pets.reduce((sum, p) => sum + petTotal(p), 0);
  const busy = charging || markingCash;

  async function saveLineItems(pet: PetInvoice) {
    await supabase.from('booking_line_items').delete().eq('booking_id', pet.bookingId);
    const { error } = await supabase.from('booking_line_items').insert(
      pet.lineItems.map((item) => ({
        booking_id: pet.bookingId,
        description: item.description,
        amount_cents: item.amountCents,
      }))
    );
    if (error) throw new Error(error.message);
  }

  async function handleChargeAll() {
    for (const pet of pets) {
      if (petTotal(pet) <= 0) {
        window.alert(`${pet.petName}'s total must be greater than zero.`);
        return;
      }
    }

    setCharging(true);
    try {
      for (const pet of pets) await saveLineItems(pet);
      await chargeBookingGroup(groupId);
      router.push('/dashboard');
    } catch (err) {
      window.alert(`Charge failed: ${err instanceof Error ? err.message : 'Something went wrong'}`);
      await load();
    } finally {
      setCharging(false);
    }
  }

  async function handleMarkAllCash() {
    for (const pet of pets) {
      if (petTotal(pet) <= 0) {
        window.alert(`${pet.petName}'s total must be greater than zero.`);
        return;
      }
    }

    setMarkingCash(true);
    let failure: string | null = null;
    for (const pet of pets) {
      try {
        await saveLineItems(pet);
        await markBookingPaidCash(pet.bookingId);
      } catch (err) {
        failure = `${pet.petName}: ${err instanceof Error ? err.message : 'could not record'}`;
        break;
      }
    }
    setMarkingCash(false);

    if (failure) {
      window.alert(`Could not record every payment - ${failure}. Reopen to finish the rest.`);
      await load();
      return;
    }
    router.push('/dashboard');
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

      <h1 className="page-title">Complete & invoice</h1>
      <p className="page-subtitle">
        {pets.length} {pets.length === 1 ? 'pet' : 'pets'} in this visit · adjust each pet&apos;s services below.
      </p>

      {pets.map((pet) => (
        <Card key={pet.bookingId} className={styles.petCard}>
          <p className={styles.petName}>{pet.petName}</p>
          <PetCareBox info={pet.petCare} />

          {pet.lineItems.map((item, index) => (
            <div key={`${item.description}-${index}`} className={styles.lineItemRow}>
              <span className={styles.lineItemDescription}>{item.description}</span>
              <span className={styles.lineItemAmount}>
                {item.amountCents < 0 ? '−' : ''}${(Math.abs(item.amountCents) / 100).toFixed(2)}
              </span>
              <button className={styles.removeBtn} onClick={() => handleRemoveLineItem(pet.bookingId, index)}>
                Remove
              </button>
            </div>
          ))}

          <div className={styles.addItemForm}>
            <input
              className={styles.descriptionInput}
              placeholder="Add a service or fee"
              value={newDesc[pet.bookingId] ?? ''}
              onChange={(e) => setNewDesc((s) => ({ ...s, [pet.bookingId]: e.target.value }))}
            />
            <input
              className={styles.amountInput}
              placeholder="0.00"
              inputMode="decimal"
              value={newAmt[pet.bookingId] ?? ''}
              onChange={(e) => setNewAmt((s) => ({ ...s, [pet.bookingId]: e.target.value }))}
            />
            <Button label="Add" variant="secondary" onClick={() => handleAddLineItem(pet.bookingId)} />
          </div>

          <div className={styles.petTotalRow}>
            <span className={styles.petTotalLabel}>{pet.petName}&apos;s subtotal</span>
            <span className={styles.petTotalAmount}>${(petTotal(pet) / 100).toFixed(2)}</span>
          </div>
        </Card>
      ))}

      <div className={styles.grandTotalRow}>
        <span className={styles.grandTotalLabel}>Visit subtotal</span>
        <span className={styles.grandTotalAmount}>${(grandTotalCents / 100).toFixed(2)}</span>
      </div>
      <p className={styles.taxNote}>
        Charged as one payment for the whole visit. Sales tax (if applicable) is added at checkout.
      </p>

      {cashBlocked && (
        <Card className={styles.feeCard}>
          <p className={styles.feeCardTitle}>New customer from PawBooker</p>
          <p className={styles.feeCardNote}>
            This customer&apos;s first visit came through PawBooker, so it must be paid by card — a one-time 5%
            acquisition fee applies to their first appointment only.
          </p>
        </Card>
      )}

      <Button
        label={`Charge all & complete (${pets.length} ${pets.length === 1 ? 'pet' : 'pets'})`}
        onClick={handleChargeAll}
        loading={charging}
        disabled={busy || grandTotalCents <= 0}
        block
      />

      {cashBlocked ? (
        <p className={styles.cashBlockedNote}>You can mark cash on this customer&apos;s future visits.</p>
      ) : (
        <>
          <Button
            label="Mark all as paid (cash)"
            variant="secondary"
            onClick={handleMarkAllCash}
            loading={markingCash}
            disabled={busy || grandTotalCents <= 0}
            block
          />
          <p className={styles.cashNote}>Use this if your customer paid you directly in cash.</p>
        </>
      )}
    </div>
  );
}
