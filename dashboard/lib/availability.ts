import { DAYS_OF_WEEK, type DayHours, type GroomerHours } from '@/lib/hours';

// Port of utils/availability.ts.

export type BusyInterval = {
  startsAt: Date;
  durationMinutes: number;
  staffId: string | null;
};

export type ClosedRange = { start_date: string; end_date: string; note: string | null };

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// closures' start_date/end_date are plain 'YYYY-MM-DD' strings, which sort
// lexically the same as chronologically - a straight string comparison
// against a same-format key is enough, no Date parsing needed.
export function closureForDate(closures: ClosedRange[], date: Date): ClosedRange | null {
  const key = dateKey(date);
  return closures.find((c) => key >= c.start_date && key <= c.end_date) ?? null;
}

export type StaffSelection = { kind: 'any'; capacity: number } | { kind: 'staff'; staffId: string };

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '17:00';
const STEP_MINUTES = 30;

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

type ComputeParams = {
  date: Date;
  hours: GroomerHours | null;
  durationMinutes: number;
  busy: BusyInterval[];
  selection: StaffSelection;
  closures?: ClosedRange[];
  now?: Date;
  stepMinutes?: number;
};

// Returns the bookable start times ("HH:MM") for one day, respecting the
// salon's hours, the service length, and what's already booked. A day
// explicitly marked closed (weekly or a one-off closure) returns no slots.
export function computeAvailableTimes({
  date,
  hours,
  durationMinutes,
  busy,
  selection,
  closures = [],
  now = new Date(),
  stepMinutes = STEP_MINUTES,
}: ComputeParams): string[] {
  if (closureForDate(closures, date)) return [];

  const dayKey = DAYS_OF_WEEK[(date.getDay() + 6) % 7];
  const dayHours: DayHours = hours ? hours[dayKey] : { open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
  if (!dayHours) return [];

  const openMin = timeToMinutes(dayHours.open);
  const closeMin = timeToMinutes(dayHours.close);

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const busyRanges = busy
    .filter((b) => {
      const d = new Date(b.startsAt);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === dayStart.getTime();
    })
    .map((b) => {
      const start = b.startsAt.getHours() * 60 + b.startsAt.getMinutes();
      return { start, end: start + b.durationMinutes, staffId: b.staffId };
    });

  const capacity = selection.kind === 'any' ? Math.max(selection.capacity, 1) : 1;
  const times: string[] = [];

  for (let start = openMin; start + durationMinutes <= closeMin; start += stepMinutes) {
    const end = start + durationMinutes;

    const slotDate = new Date(date);
    slotDate.setHours(Math.floor(start / 60), start % 60, 0, 0);
    if (slotDate.getTime() <= now.getTime()) continue;

    const overlapping = busyRanges.filter((b) => overlaps(start, end, b.start, b.end));

    const open = selection.kind === 'staff' ? overlapping.every((b) => b.staffId !== selection.staffId) : overlapping.length < capacity;

    if (open) times.push(minutesToTime(start));
  }

  return times;
}
