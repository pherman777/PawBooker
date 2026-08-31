import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

// One calendar month as a 6x7 grid of Dates (nulls for the leading/trailing
// blanks outside the month), Sunday-first to match toLocaleDateString's
// {weekday:'short'} elsewhere in the app.
function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  const cells: (Date | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type Props = {
  visible: boolean;
  value: Date | null;
  minDate?: Date;
  title?: string;
  onSelect: (date: Date) => void;
  onDismiss: () => void;
};

// No date-picker library in this project (only expo-calendar, which is for
// device calendar read/write, not a UI picker) - a small custom month grid
// covers the one thing needed here (pick a future date) without a new
// native dependency/prebuild.
export function DatePickerModal({ visible, value, minDate, title, onSelect, onDismiss }: Props) {
  const floor = useMemo(() => startOfDay(minDate ?? new Date()), [minDate]);
  const [viewedMonth, setViewedMonth] = useState(() => {
    const base = value ?? floor;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const cells = useMemo(() => monthGrid(viewedMonth.getFullYear(), viewedMonth.getMonth()), [viewedMonth]);
  const monthLabel = viewedMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const canGoBack = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() + 1, 0) > floor;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title ?? 'Select date'}</Text>

          <View style={styles.monthRow}>
            <Pressable
              style={[styles.monthNavButton, !canGoBack && styles.monthNavButtonDisabled]}
              disabled={!canGoBack}
              onPress={() => setViewedMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
              <Text style={styles.monthNavText}>‹</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable
              style={styles.monthNavButton}
              onPress={() => setViewedMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
              <Text style={styles.monthNavText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Text key={i} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((cell, i) => {
              if (!cell) return <View key={i} style={styles.cell} />;
              const disabled = cell < floor;
              const selected = value != null && sameDay(cell, value);
              return (
                <Pressable
                  key={i}
                  style={styles.cell}
                  disabled={disabled}
                  onPress={() => {
                    onSelect(cell);
                    onDismiss();
                  }}>
                  <View style={[styles.dayCircle, selected && styles.dayCircleSelected]}>
                    <Text style={[styles.dayText, disabled && styles.dayTextDisabled, selected && styles.dayTextSelected]}>
                      {cell.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 10,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.border,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  monthNavButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavButtonDisabled: {
    opacity: 0.3,
  },
  monthNavText: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: Colors.light.textMuted,
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: Colors.light.tint,
  },
  dayText: {
    fontSize: 14,
    color: Colors.light.text,
  },
  dayTextDisabled: {
    color: Colors.light.textMuted,
    opacity: 0.4,
  },
  dayTextSelected: {
    fontWeight: '700',
    color: Colors.light.text,
  },
});
