import { supabase } from '@/lib/supabase';

export type MatchedPet = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
};

export type MatchedCustomer = {
  customerId: string;
  email: string;
  pets: MatchedPet[];
};

// Wraps the groomer_search_customers RPC (0055_groomer_search_customers.sql)
// - scoped server-side to customers already linked to this groomer (a
// redeemed invite code, or a past booking), returning each match's own
// already-self-entered pets. Rows come back one-per-pet; group them by
// customer here for the picker UI.
export async function searchGroomerCustomers(query: string): Promise<MatchedCustomer[]> {
  const { data, error } = await supabase.rpc('groomer_search_customers', { p_search: query });
  if (error) throw error;

  const byCustomer = new Map<string, MatchedCustomer>();
  for (const row of data ?? []) {
    let customer = byCustomer.get(row.customer_id);
    if (!customer) {
      customer = { customerId: row.customer_id, email: row.email, pets: [] };
      byCustomer.set(row.customer_id, customer);
    }
    if (row.pet_id) {
      customer.pets.push({ id: row.pet_id, name: row.pet_name, species: row.pet_species, breed: row.pet_breed });
    }
  }
  return [...byCustomer.values()];
}

export type CreateManualBookingInput = {
  customerId: string;
  petId: string;
  serviceId: string;
  staffId: string | null;
  startsAt: string;
};

export async function createManualBooking(input: CreateManualBookingInput): Promise<{ bookingId: string }> {
  const { data, error } = await supabase.functions.invoke<{ success: boolean; bookingId: string }>(
    'create-manual-booking',
    { body: input }
  );
  if (error) throw error;
  if (!data) throw new Error('No response from create-manual-booking');
  return { bookingId: data.bookingId };
}
