import { groupSalonStatus, type SalonEntry } from '@/lib/bookings';

// Fixed 7am-7pm grid for now - covers effectively every real grooming
// business's hours. Using each groomer's actual configured hours (see
// hours/page.tsx) would be a nice follow-up but adds real complexity
// (per-day ranges, closed days) for limited benefit over a generous fixed
// window.
export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 19;
export const PX_PER_MINUTE = 1.1;
export const GRID_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * 60 * PX_PER_MINUTE;

// Categorical palette for coloring calendar blocks by groomer - validated with
// the data-viz skill's six-check validator (lightness band, chroma floor, CVD
// separation, normal-vision floor, contrast vs. `--surface`) against this
// app's actual card surface (#fbfaf4). Order is the CVD-safety mechanism -
// don't reorder without re-running the validator. Deliberately distinct from
// --success/--warning/--danger (booking status still reads via the block's
// dashed border for pending and reduced opacity for completed, not hue) so
// groomer identity and booking status never fight over the same channel.
const STAFF_COLORS = [
  '#1f7aae', // steel blue
  '#c4632f', // clay-orange
  '#1f9c82', // teal
  '#d99a1f', // gold
  '#c06a89', // rose
  '#4a8f4f', // sage-green
  '#7a52a0', // plum
  '#c94a44', // brick red
] as const;

export const UNASSIGNED_COLOR = '#8a8f83'; // neutral - no specific groomer to identify

// Assigns colors by each groomer's position in the roster (stable - the
// roster is always fetched ordered by created_at ascending), not a hash of
// their id: a hash can and does collide two different ids into the same
// palette slot on a small roster, which defeats the entire point of "every
// groomer gets their own color." Position-based assignment guarantees every
// currently-active groomer is distinct as long as there are <= 8 of them
// (STAFF_COLORS.length); past that the palette wraps and duplicates become
// unavoidable with this many validated hues. The tradeoff versus a hash: a
// groomer's color can shift if someone earlier in the roster is removed -
// accepted, since distinctness for everyone currently on the calendar matters
// more than any one groomer's color surviving a roster change.
export function buildStaffColorMap(staffList: { id: string }[]): Map<string, string> {
  return new Map(staffList.map((s, i) => [s.id, STAFF_COLORS[i % STAFF_COLORS.length]]));
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  return addDays(d, -d.getDay());
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export type ScheduleEntry = {
  entry: SalonEntry;
  date: Date;
  startMin: number;
  endMin: number;
  staffId: string | null;
  staffName: string;
};

// A multi-pet group visit occupies the groomer's time for the sum of every
// pet's service in that visit, starting from the earliest booking - that's
// what actually blocks their day, not just the first pet's own duration.
export function toScheduleEntry(entry: SalonEntry): ScheduleEntry {
  const date = new Date(entry.lead.startsAt);
  const startMin = minutesSinceMidnight(date);
  const totalDuration = entry.bookings.reduce((sum, b) => sum + b.durationMinutes, 0);
  return {
    entry,
    date,
    startMin,
    endMin: startMin + Math.max(totalDuration, 15),
    staffId: entry.lead.staffId ?? null,
    staffName: entry.lead.staffName ?? 'Unassigned',
  };
}

// Cancelled/declined visits don't occupy real time on the day - showing them
// would just clutter the grid with blocks nobody needs to look at.
export function isSchedulable(entry: SalonEntry): boolean {
  const status = groupSalonStatus(entry.bookings);
  return status !== 'cancelled' && status !== 'declined';
}

export type LayoutBlock = ScheduleEntry & { colIndex: number; totalCols: number };

// Standard interval-graph coloring: sort by start, greedily place each block
// into the first lane whose last block has already ended, opening a new lane
// otherwise. Blocks in the same column then get 1/totalCols width - good
// enough for the rare case of two overlapping bookings for one groomer.
export function layoutBlocks(blocks: ScheduleEntry[]): LayoutBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  const lanes: ScheduleEntry[][] = [];
  const laneOf = new Map<ScheduleEntry, number>();

  for (const block of sorted) {
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      if (lane[lane.length - 1].endMin <= block.startMin) {
        lane.push(block);
        laneOf.set(block, i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.push([block]);
      laneOf.set(block, lanes.length - 1);
    }
  }

  const totalCols = Math.max(1, lanes.length);
  return sorted.map((block) => ({ ...block, colIndex: laneOf.get(block) ?? 0, totalCols }));
}
