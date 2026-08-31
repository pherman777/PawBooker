import { supabase } from '@/services/supabase';
import type { BusyInterval, ClosedRange } from '@/utils/availability';

export type SalonStaff = {
  id: string;
  name: string;
};

// Active groomers for a salon, in a stable order for the booking selector.
export async function fetchActiveStaff(salonId: string): Promise<SalonStaff[]> {
  const { data, error } = await supabase
    .from('salon_staff')
    .select('id, name')
    .eq('salon_id', salonId)
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, name: row.name }));
}

// Booked time ranges for a salon over a window, via the SECURITY DEFINER RPC
// (customers can't read other customers' bookings directly). Returns anonymized
// intervals the availability engine uses to block slots.
export async function fetchBusyIntervals(salonId: string, from: Date, to: Date): Promise<BusyInterval[]> {
  const { data, error } = await supabase.rpc('salon_busy_intervals', {
    p_salon_id: salonId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error || !data) return [];
  return (data as { starts_at: string; duration_minutes: number; staff_id: string | null }[]).map((row) => ({
    startsAt: new Date(row.starts_at),
    durationMinutes: row.duration_minutes,
    staffId: row.staff_id,
  }));
}

function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// One-off closed dates (holidays, vacation) for a salon overlapping the given
// window - layered on top of its recurring weekly hours.
export async function fetchClosures(salonId: string, from: Date, to: Date): Promise<ClosedRange[]> {
  const { data, error } = await supabase
    .from('groomer_closures')
    .select('start_date, end_date, note')
    .eq('groomer_id', salonId)
    .lte('start_date', dateOnly(to))
    .gte('end_date', dateOnly(from));

  if (error || !data) return [];
  return data as ClosedRange[];
}
