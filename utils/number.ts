/** Strip a decimal-input string down to digits and at most one decimal point. */
export function sanitizeDecimalInput(input: string): string {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}
