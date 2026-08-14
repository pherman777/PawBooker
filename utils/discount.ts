// Multi-pet discount: a rule a salon configures ("N+ pets get X off"), applied
// to a group booking's subtotal. The platform never sets these numbers - each
// salon owns its own pricing - so this only ever reads and applies the rule.

export type MultiPetDiscount = {
  minPets: number;
  type: 'percent' | 'flat';
  value: number; // percent (0-100) or cents off, per type
};

// Parses the groomers.multi_pet_discount jsonb into a validated rule, or null if
// absent/malformed. A rule needs at least 2 pets and a positive value to matter.
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

// The discount in cents for a group of `petCount` pets whose combined services
// total `baseCents`. Returns 0 when there's no rule or too few pets. Never
// exceeds the subtotal.
export function computeGroupDiscountCents(
  baseCents: number,
  petCount: number,
  rule: MultiPetDiscount | null
): number {
  if (!rule || petCount < rule.minPets) return 0;
  const raw = rule.type === 'percent' ? Math.round((baseCents * rule.value) / 100) : rule.value;
  return Math.max(0, Math.min(baseCents, raw));
}

// A short human label for a rule, e.g. "10% off 3+ pets" or "$15 off 2+ pets".
export function describeMultiPetDiscount(rule: MultiPetDiscount): string {
  const amount = rule.type === 'percent' ? `${rule.value}%` : `$${(rule.value / 100).toFixed(0)}`;
  return `${amount} off ${rule.minPets}+ pets`;
}

// The discount snapshot a group booking stored at booking time (null = none).
export type GroupDiscountSnapshot = { type: 'percent' | 'flat'; value: number };

// One pet's share of a group discount, applied to its own booking at checkout.
// Percent is straightforward per-pet; a flat group discount is prorated by each
// pet's service price so the shares add back up to the flat amount. Never exceeds
// this pet's own service price.
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
