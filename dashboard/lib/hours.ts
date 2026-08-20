// Ported from utils/hours.ts - day ordering/labels/time formatting for the
// hours settings page. Mirrors the groomers.hours jsonb shape exactly (see
// types/index.ts's GroomerHours in the RN app) so saved data stays
// compatible with the RN app and Supabase schema.

export type DayHours = { open: string; close: string } | null;

export type GroomerHours = {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
};

export const DAYS_OF_WEEK: (keyof GroomerHours)[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DAY_LABELS: Record<keyof GroomerHours, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export function dayLabel(day: keyof GroomerHours): string {
  return DAY_LABELS[day];
}

export function formatTime(time: string): string {
  const [hourStr, minute] = time.split(':');
  const hour = Number(hourStr);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}
