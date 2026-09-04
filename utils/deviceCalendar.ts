import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

export type CalendarEventInput = {
  title: string;
  startDate: Date;
  durationMinutes: number;
  location?: string;
  notes?: string;
};

export type AddToCalendarResult =
  | { status: 'added' }
  | { status: 'permission_denied' }
  | { status: 'no_calendar' }
  | { status: 'error'; message: string };

// Requests write-only calendar access (this is a one-time "add this
// appointment" action, not ongoing sync - no need for full read/write
// access) and finds a writable calendar to add to. iOS always has a
// concrete "default" calendar; Android has no such concept, so the first
// writable calendar returned by getCalendars is used instead.
async function getWritableCalendar(): Promise<Calendar.ExpoCalendar | null> {
  if (Platform.OS === 'ios') {
    return Calendar.getDefaultCalendarSync() ?? null;
  }

  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return calendars.find((c) => c.allowsModifications) ?? null;
}

export async function addBookingToCalendar(event: CalendarEventInput): Promise<AddToCalendarResult> {
  try {
    const permission = await Calendar.requestCalendarPermissions(true);
    if (!permission.granted) {
      return { status: 'permission_denied' };
    }

    const calendar = await getWritableCalendar();
    if (!calendar) {
      return { status: 'no_calendar' };
    }

    const endDate = new Date(event.startDate.getTime() + event.durationMinutes * 60000);

    await calendar.createEvent({
      title: event.title,
      startDate: event.startDate,
      endDate,
      location: event.location,
      notes: event.notes,
    });

    return { status: 'added' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' };
  }
}
