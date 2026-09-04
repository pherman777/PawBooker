// Web equivalent of utils/deviceCalendar.ts. There's no device calendar API
// in a browser, so instead of one native picker this offers a Google
// Calendar link (no download, works everywhere) and an .ics download
// (Apple Calendar, Outlook, and anything else that reads the standard).
export type CalendarEventInput = {
  title: string;
  startDate: Date;
  durationMinutes: number;
  location?: string;
};

function toUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export function buildGoogleCalendarUrl(event: CalendarEventInput): string {
  const endDate = new Date(event.startDate.getTime() + event.durationMinutes * 60000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toUtcStamp(event.startDate)}/${toUtcStamp(endDate)}`,
  });
  if (event.location) params.set('location', event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function downloadIcsEvent(event: CalendarEventInput): void {
  const endDate = new Date(event.startDate.getTime() + event.durationMinutes * 60000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PawBooker//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@paw-booker.com`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(event.startDate)}`,
    `DTEND:${toUtcStamp(endDate)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : undefined,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((line): line is string => line != null);

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'appointment.ics';
  link.click();
  URL.revokeObjectURL(url);
}
