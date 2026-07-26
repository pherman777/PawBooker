import type { DayHours, GroomerHours } from '@/types';

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

export function formatDayHours(hours: DayHours): string {
  if (!hours) return 'Closed';
  return `${formatTime(hours.open)} – ${formatTime(hours.close)}`;
}

export function todayKey(): keyof GroomerHours {
  const jsDay = new Date().getDay();
  return DAYS_OF_WEEK[(jsDay + 6) % 7];
}
