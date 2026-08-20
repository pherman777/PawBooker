// Verbatim port of utils/phone.ts (pure functions, US-only formatting).

export function formatPhoneAsTyped(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 10);
  const len = digits.length;
  if (len === 0) return '';
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatPhoneForDisplay(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return formatPhoneAsTyped(digits);
  if (digits.length === 11 && digits.startsWith('1')) return `1 ${formatPhoneAsTyped(digits.slice(1))}`;
  return value.trim();
}
