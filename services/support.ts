import { supabase } from '@/services/supabase';

export type SubmitReportResponse = {
  success: boolean;
};

export async function submitReport(
  bookingId: string,
  reason: string,
  details?: string
): Promise<SubmitReportResponse> {
  const { data, error } = await supabase.functions.invoke<SubmitReportResponse>('submit-report', {
    body: { bookingId, reason, details },
  });
  if (error) throw error;
  if (!data) throw new Error('No response from submit-report');
  return data;
}

export type ContactSupportResponse = {
  success: boolean;
};

export async function contactSupport(subject: string, message: string): Promise<ContactSupportResponse> {
  const { data, error } = await supabase.functions.invoke<ContactSupportResponse>('contact-support', {
    body: { subject, message },
  });
  if (error) throw error;
  if (!data) throw new Error('No response from contact-support');
  return data;
}
