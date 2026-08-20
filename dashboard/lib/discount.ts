// Ported from utils/discount.ts - only the piece the discount settings page
// needs: parsing the groomers.multi_pet_discount jsonb column into a
// validated rule (or null if absent/malformed).

export type MultiPetDiscount = {
  minPets: number;
  type: 'percent' | 'flat';
  value: number; // percent (0-100) or cents off, per type
};

export function parseMultiPetDiscount(raw: unknown): MultiPetDiscount | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const minPets = Number(r.min_pets);
  const value = Number(r.value);
  if (r.type !== 'percent' && r.type !== 'flat') return null;
  if (!Number.isFinite(minPets) || minPets < 2) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return { minPets, type: r.type, value };
}

// The discount snapshot a group booking stored at booking time (null = none).
export type GroupDiscountSnapshot = { type: 'percent' | 'flat'; value: number };

// One pet's share of a group discount, applied to its own booking at
// checkout. Percent is straightforward per-pet; a flat group discount is
// prorated by each pet's service price so the shares add back up to the
// flat amount. Never exceeds this pet's own service price.
export function perBookingDiscountCents(
  thisServiceCents: number,
  groupServiceTotalCents: number,
  snapshot: GroupDiscountSnapshot | null
): number {
  if (!snapshot || thisServiceCents <= 0 || groupServiceTotalCents <= 0) return 0;
  const raw =
    snapshot.type === 'percent'
      ? Math.round((thisServiceCents * snapshot.value) / 100)
      : Math.round((snapshot.value * thisServiceCents) / groupServiceTotalCents);
  return Math.max(0, Math.min(thisServiceCents, raw));
}
