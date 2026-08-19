'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { SalonStaff } from '@/lib/notifications';
import { groupSalonStatus, type SalonEntry } from '@/lib/bookings';
import {
  GRID_END_HOUR,
  GRID_HEIGHT,
  GRID_START_HOUR,
  PX_PER_MINUTE,
  UNASSIGNED_COLOR,
  addDays,
  buildStaffColorMap,
  isSameDay,
  isSchedulable,
  layoutBlocks,
  minutesSinceMidnight,
  startOfDay,
  startOfWeek,
  toScheduleEntry,
  type LayoutBlock,
} from '@/lib/schedule';

import styles from './Schedule.module.css';

type Mode = 'day' | 'week';

type Column = {
  key: string;
  name: string;
  sub?: string;
  isToday?: boolean;
  blocks: LayoutBlock[];
};

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Props = {
  entries: SalonEntry[];
  staffList: SalonStaff[];
  onSelectEntry: (entry: SalonEntry) => void;
};

export function Schedule({ entries, staffList, onSelectEntry }: Props) {
  const [mode, setMode] = useState<Mode>('day');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [groomerId, setGroomerId] = useState<string>('all');

  const schedulable = useMemo(
    () => entries.filter(isSchedulable).map(toScheduleEntry),
    [entries]
  );

  const staffColors = useMemo(() => buildStaffColorMap(staffList), [staffList]);

  const hasUnassigned = useMemo(() => schedulable.some((e) => e.staffId === null), [schedulable]);

  const columns: Column[] = useMemo(() => {
    const today = new Date();

    if (mode === 'day') {
      const dayEntries = schedulable.filter((e) => isSameDay(e.date, anchor));

      const staffCols: Column[] =
        groomerId === 'all'
          ? [
              ...staffList.map((s) => ({
                key: s.id,
                name: s.name,
                blocks: layoutBlocks(dayEntries.filter((e) => e.staffId === s.id)),
              })),
              ...(hasUnassigned || staffList.length === 0
                ? [
                    {
                      key: 'unassigned',
                      name: staffList.length === 0 ? 'All bookings' : 'Unassigned',
                      blocks: layoutBlocks(dayEntries.filter((e) => e.staffId === null)),
                    },
                  ]
                : []),
            ]
          : [
              {
                key: groomerId,
                name: staffList.find((s) => s.id === groomerId)?.name ?? 'Groomer',
                blocks: layoutBlocks(dayEntries.filter((e) => e.staffId === groomerId)),
              },
            ];

      return staffCols;
    }

    // Week mode: columns are days, not groomers - a resource grid can't show
    // both 7 days and multiple groomers at once without becoming unreadable.
    const weekStart = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i);
      const dayEntries = schedulable.filter(
        (e) => isSameDay(e.date, day) && (groomerId === 'all' || e.staffId === groomerId)
      );
      return {
        key: day.toISOString(),
        name: WEEKDAY_SHORT[i],
        sub: String(day.getDate()),
        isToday: isSameDay(day, today),
        blocks: layoutBlocks(dayEntries),
      };
    });
  }, [mode, anchor, groomerId, schedulable, staffList, hasUnassigned]);

  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => GRID_START_HOUR + i);

  const now = new Date();
  const nowTop = (minutesSinceMidnight(now) - GRID_START_HOUR * 60) * PX_PER_MINUTE;
  const showNowLine = mode === 'day' && isSameDay(anchor, now) && nowTop >= 0 && nowTop <= GRID_HEIGHT;

  function step(delta: number) {
    setAnchor((d) => addDays(d, mode === 'day' ? delta : delta * 7));
  }

  const dateLabel =
    mode === 'day'
      ? anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      : (() => {
          const start = startOfWeek(anchor);
          const end = addDays(start, 6);
          const sameMonth = start.getMonth() === end.getMonth();
          const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          const endLabel = end.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
          return `${startLabel} – ${endLabel}`;
        })();

  const hasAnyBlocks = columns.some((c) => c.blocks.length > 0);

  return (
    <div className={styles.scheduleLight}>
      <div className={styles.toolbar}>
        <div className={styles.nav}>
          <button className={styles.todayBtn} onClick={() => setAnchor(startOfDay(new Date()))}>
            Today
          </button>
          <button className={styles.navBtn} onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft size={15} />
          </button>
          <button className={styles.navBtn} onClick={() => step(1)} aria-label="Next">
            <ChevronRight size={15} />
          </button>
          <span className={styles.dateLabel}>{dateLabel}</span>
        </div>
        <div className={styles.controls}>
          <select className={styles.select} value={groomerId} onChange={(e) => setGroomerId(e.target.value)}>
            <option value="all">All groomers</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeBtn} ${mode === 'day' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('day')}>
              Day
            </button>
            <button
              className={`${styles.modeBtn} ${mode === 'week' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('week')}>
              Week
            </button>
          </div>
        </div>
      </div>

      {!hasAnyBlocks ? (
        <div className={`${styles.gridWrap} ${styles.empty}`}>Nothing scheduled {mode === 'day' ? 'this day' : 'this week'}.</div>
      ) : (
        <div className={styles.gridWrap}>
          <div className={styles.grid} style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(140px, 1fr))` }}>
            <div className={styles.gutterHeader} />
            {columns.map((col) => (
              <div key={col.key} className={styles.columnHeader}>
                <div className={`${styles.columnHeaderName} ${col.isToday ? styles.columnHeaderToday : ''}`}>
                  {col.name}
                  {col.sub ? ` ${col.sub}` : ''}
                </div>
                {mode === 'day' && <div className={styles.columnHeaderSub}>{col.blocks.length} booked</div>}
              </div>
            ))}

            <div className={styles.gutter} style={{ height: GRID_HEIGHT }}>
              {hours.map((h) => (
                <span
                  key={h}
                  className={styles.hourLabel}
                  style={{ top: (h - GRID_START_HOUR) * 60 * PX_PER_MINUTE }}>
                  {h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}
                </span>
              ))}
              {showNowLine && <span className={styles.nowDot} style={{ top: nowTop - 4 }} />}
            </div>

            {columns.map((col) => (
              <div key={col.key} className={styles.column} style={{ height: GRID_HEIGHT }}>
                {hours.map((h) => (
                  <div key={h} className={styles.hourLine} style={{ top: (h - GRID_START_HOUR) * 60 * PX_PER_MINUTE }} />
                ))}
                {showNowLine && <div className={styles.nowLine} style={{ top: nowTop }} />}
                {col.blocks.map((block) => {
                  const status = groupSalonStatus(block.entry.bookings);
                  const isPending = status === 'pending';
                  const isCompleted = status === 'completed';
                  // Color identifies the groomer; status reads through the dashed
                  // border (pending) and reduced opacity (completed) instead, so
                  // the two channels never compete for the same hue.
                  const color = (block.staffId && staffColors.get(block.staffId)) || UNASSIGNED_COLOR;
                  const top = Math.max(0, (block.startMin - GRID_START_HOUR * 60) * PX_PER_MINUTE);
                  const bottom = Math.min(GRID_HEIGHT, (block.endMin - GRID_START_HOUR * 60) * PX_PER_MINUTE);
                  const label = block.entry.bookings.length > 1 ? `${block.entry.bookings.length} pets` : block.entry.lead.petName;
                  const time = new Date(block.entry.lead.startsAt).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  });
                  return (
                    <button
                      key={block.entry.key}
                      className={`${styles.block} ${isPending ? styles.blockPending : ''} ${isCompleted ? styles.blockCompleted : ''}`}
                      style={{
                        top,
                        height: Math.max(bottom - top, 20),
                        left: `${(block.colIndex / block.totalCols) * 100}%`,
                        width: `${100 / block.totalCols}%`,
                        background: `color-mix(in srgb, ${color} 26%, var(--surface-2))`,
                        borderColor: color,
                      }}
                      onClick={() => onSelectEntry(block.entry)}>
                      {isPending && <span className={styles.blockRequestedTag}>Requested</span>}
                      <span className={styles.blockTitle}>{label}</span>
                      <span className={styles.blockMeta}>{time}</span>
                      {mode === 'week' && groomerId === 'all' && block.staffName !== 'Unassigned' && (
                        <span className={styles.blockStaffTag}>{block.staffName}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
