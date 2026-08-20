import { customerSupabase } from '@/lib/customerSupabase';

export type CustomerProfile = {
  name: string;
  phone: string;
};

export async function fetchProfile(userId: string): Promise<CustomerProfile> {
  const { data } = await customerSupabase.from('profiles').select('name, phone').eq('user_id', userId).maybeSingle();
  return { name: data?.name ?? '', phone: data?.phone ?? '' };
}

// Port of app/account.tsx's handleSaveContact. Returns whether the email
// change requires confirmation, so the caller can show the right message.
export async function saveContactInfo(
  userId: string,
  currentEmail: string,
  fields: { name: string; email: string; phone: string }
): Promise<{ emailChangeRequiresConfirmation: boolean }> {
  const trimmedEmail = fields.email.trim();
  if (!trimmedEmail) throw new Error('Enter a valid email address.');

  const { error: profileError } = await customerSupabase.from('profiles').upsert({
    user_id: userId,
    name: fields.name.trim() || null,
    phone: fields.phone.trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (profileError) throw profileError;

  const emailChanged = trimmedEmail !== currentEmail;
  if (emailChanged) {
    const { error: emailError } = await customerSupabase.auth.updateUser({ email: trimmedEmail });
    if (emailError) throw emailError;
  }

  return { emailChangeRequiresConfirmation: emailChanged };
}

export async function updatePassword(newPassword: string) {
  const { error } = await customerSupabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// Port of services/groomer.ts's redeemInvite.
export async function redeemInvite(code: string): Promise<string> {
  const { data, error } = await customerSupabase.functions.invoke('redeem-invite', { body: { code } });

  if (error) {
    let message = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }

  return (data?.groomerName as string) ?? 'your groomer';
}

export async function deleteAccount() {
  const { error } = await customerSupabase.functions.invoke('delete-account');
  if (error) throw error;
  await customerSupabase.auth.signOut();
}

export type SavedPaymentMethod = {
  id: string;
  cardBrand?: string;
  cardLast4?: string;
  walletType?: string;
  isDefault: boolean;
};

export async function fetchPaymentMethods(userId: string): Promise<SavedPaymentMethod[]> {
  const { data } = await customerSupabase
    .from('customer_payment_methods')
    .select('id, card_brand, card_last4, wallet_type, is_default')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    cardBrand: row.card_brand ?? undefined,
    cardLast4: row.card_last4 ?? undefined,
    walletType: row.wallet_type ?? undefined,
    isDefault: row.is_default,
  }));
}

export async function makePaymentMethodDefault(id: string) {
  const { error } = await customerSupabase.from('customer_payment_methods').update({ is_default: true }).eq('id', id);
  if (error) throw error;
}
