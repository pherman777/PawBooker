const MM_DD_YYYY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseMonthDayYear(input: string): string | null {
  const match = input.trim().match(MM_DD_YYYY);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatIsoDateAsMonthDayYear(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
}

export function formatDateInputAsTyped(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  const month = digits.slice(0, 2);
  const day = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [month, day, year].filter(Boolean).join('/');
}
