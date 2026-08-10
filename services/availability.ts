import { supabase } from '@/services/supabase';
import type { BusyInterval } from '@/utils/availability';

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
