/** Basic format check - not exhaustive RFC 5322, just enough to catch typos. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
