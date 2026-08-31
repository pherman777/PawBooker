// Timezone-aware availability computation, shared by every edge function that
// needs to turn a salon's hours + busy intervals into real open time slots
// (chat-agent's check_availability/create_booking, business-assistant's
// propose_reschedule). Edge functions run in Deno and can't import the RN
// app's source files across that module boundary (same reason
// dashboard/business-info/page.tsx inlines phone/email helpers instead of
// sharing them), so this is a from-scratch reimplementation of
// utils/availability.ts's computeAvailableTimes - but reworked to be
// timezone-aware, since unlike the native/web booking screens (which run on
// the customer's own device and implicitly treat device-local time as
// salon-local time), these functions run server-side on Deno Deploy in UTC
// and have to explicitly convert.

export type BusyInterval = { startsAt: Date; durationMinutes: number };
export type TimeSlot = { label: string; startsAt: string };
export type ClosedRange = { start_date: string; end_date: string; note: string | null };

export const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

// This function runs on Deno Deploy, which is always UTC - it is NOT the
// customer's device (unlike the native/web booking screens, which build
// Date objects in the device's own local time and implicitly rely on the
// customer being near the salon). A wall-clock "9:00 AM" in the salon's own
// timeZone has to be explicitly converted to the correct UTC instant here,
// or every AI-booked appointment would land off by the salon's UTC offset.
// Standard guess-and-correct technique using only Intl (no external tz lib
// available in this Deno runtime).
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(guess).map((p) => [p.type, p.value]));
  const observedHour = Number(parts.hour) % 24; // Intl can format midnight as "24"
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), observedHour, Number(parts.minute));
  const offsetMs = asIfUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

// A calendar date's weekday doesn't depend on timezone (Aug 24 2026 is a
// Monday everywhere) - safe to compute via UTC regardless of what timezone
// this function is actually running in.
export function weekdayKeyForDate(year: number, month: number, day: number): (typeof DAY_KEYS)[number] {
  return DAY_KEYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// groomer_closures.start_date/end_date come back from Postgres as plain
// 'YYYY-MM-DD' strings, which sort lexically the same as chronologically -
// a straight string comparison against a same-format key is enough, no Date
// parsing needed (and no timezone to get wrong).
export function isDateClosed(closures: ClosedRange[], year: number, month: number, day: number): ClosedRange | null {
  const key = dateKeyFromParts(year, month, day);
  return closures.find((c) => key >= c.start_date && key <= c.end_date) ?? null;
}

// Every candidate slot is computed as a real, timezone-correct UTC instant
// via zonedTimeToUtc, then compared against busy intervals (already
// absolute UTC instants, straight from the DB) as absolute times - never as
// "minutes since midnight," which is meaningless without also knowing which
// timezone's midnight. Returns both a human label (for the AI to relay
// as-is) and the exact ISO instant (for callers that need to write it back
// verbatim, e.g. create_booking) so the model never has to compute a
// datetime itself.
export function availableTimes(params: {
  year: number;
  month: number;
  day: number;
  dayHours: { open: string; close: string } | null;
  durationMinutes: number;
  busy: BusyInterval[];
  capacity: number;
  now: Date;
  timeZone: string;
}): TimeSlot[] {
  const { year, month, day, dayHours, durationMinutes, busy, capacity, now, timeZone } = params;
  if (!dayHours) return [];

  const openMin = timeToMinutes(dayHours.open);
  const closeMin = timeToMinutes(dayHours.close);

  const slots: TimeSlot[] = [];
  for (let start = openMin; start + durationMinutes <= closeMin; start += 30) {
    const slotStart = zonedTimeToUtc(year, month, day, Math.floor(start / 60), start % 60, timeZone);
    if (slotStart.getTime() <= now.getTime()) continue;
    const slotEndMs = slotStart.getTime() + durationMinutes * 60000;

    const overlapping = busy.filter((b) => {
      const bStart = b.startsAt.getTime();
      const bEnd = bStart + b.durationMinutes * 60000;
      return slotStart.getTime() < bEnd && bStart < slotEndMs;
    });
    if (overlapping.length >= Math.max(capacity, 1)) continue;

    const label = slotStart.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
    slots.push({ label, startsAt: slotStart.toISOString() });
  }
  return slots;
}
