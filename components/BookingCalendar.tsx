import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { BookingStatus } from '@/types';
import { getMonthGrid, isSameDay } from '@/utils/calendar';

type CalendarBooking = {
  startsAt: string;
  status: BookingStatus;
};

type Props = {
  month: Date;
  selectedDay: Date;
  bookings: CalendarBooking[];
  onChangeMonth: (delta: number) => void;
  onSelectDay: (day: Date) => void;
};

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const STATUS_PRIORITY: BookingStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

const STATUS_DOT_COLORS: Record<BookingStatus, string> = {
  pending: Colors.light.warning,
  confirmed: Colors.light.success,
  completed: Colors.light.textMuted,
  cancelled: Colors.light.danger,
};

const CELL_SIZE = '14.28%';

export function BookingCalendar({ month, selectedDay, bookings, onChangeMonth, onSelectDay }: Props) {
  const days = getMonthGrid(month);
  const today = new Date();

  function dotColorFor(day: Date) {
    const dayBookings = bookings.filter((b) => isSameDay(new Date(b.startsAt), day));
    if (dayBookings.length === 0) return null;
    for (const status of STATUS_PRIORITY) {
      if (dayBookings.some((b) => b.status === status)) return STATUS_DOT_COLORS[status];
    }
    return STATUS_DOT_COLORS.completed;
  }

  return (
    <View style={styles.container}>
      <View style={styles.monthRow}>
        <Pressable onPress={() => onChangeMonth(-1)} hitSlop={8} style={styles.monthNavButton}>
          <Ionicons name="chevron-back" size={18} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable onPress={() => onChangeMonth(1)} hitSlop={8} style={styles.monthNavButton}>
          <Ionicons name="chevron-forward" size={18} color={Colors.light.text} />
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
        {days.map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDay);
          const dotColor = dotColorFor(day);

          return (
            <Pressable
              key={day.toISOString()}
              style={styles.dayCell}
              disabled={!inMonth}
              onPress={() => onSelectDay(day)}>
              <View
                style={[
                  styles.dayCircle,
                  isSelected && styles.dayCircleSelected,
                  isToday && !isSelected && styles.dayCircleToday,
                ]}>
                <Text
                  style={[
                    styles.dayNumber,
                    !inMonth && styles.dayNumberMuted,
                    isSelected && styles.dayNumberSelected,
                  ]}>
                  {day.getDate()}
                </Text>
              </View>
              {dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  monthNavButton: {
    padding: 4,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    minWidth: 150,
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.textMuted,
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: CELL_SIZE,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: Colors.light.tint,
  },
  dayCircleToday: {
    borderWidth: 1,
    borderColor: Colors.light.tint,
  },
  dayNumber: {
    fontSize: 13,
    color: Colors.light.text,
  },
  dayNumberMuted: {
    color: Colors.light.border,
  },
  dayNumberSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 2,
  },
});
