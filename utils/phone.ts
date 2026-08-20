// US phone formatting. The app is US-only (US Stripe, US sales tax, US salons),
// so numbers are normalized to (XXX) XXX-XXXX.

/** Format a phone number as it's typed: (XXX) XXX-XXXX, capped at 10 digits. */
export function formatPhoneAsTyped(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 10);
  const len = digits.length;
  if (len === 0) return '';
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Format a stored phone value for display. Ten-digit US numbers become
 * (XXX) XXX-XXXX; anything else (partial, international, already-formatted
 * oddly) is returned trimmed so we never hide a number we can't normalize.
 */
export function formatPhoneForDisplay(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return formatPhoneAsTyped(digits);
  if (digits.length === 11 && digits.startsWith('1')) return `1 ${formatPhoneAsTyped(digits.slice(1))}`;
  return value.trim();
}

/** Strip a phone number down to digits for use in a tel: link. */
export function phoneToTelHref(value: string | null | undefined): string {
  return (value ?? '').replace(/[^\d+]/g, '');
}

/** True for a complete 10-digit US number. Used to reject partial input on save. */
export function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, '').length === 10;
}
