import { supabase } from '@/services/supabase';

export type CustomerPet = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
};

export type CustomerSummary = {
  customerId: string;
  email: string;
  name: string | null;
  phone: string | null;
  pets: CustomerPet[];
};

// Wraps groomer_search_customers (0055, extended for name/phone in 0057 and
// 0059) - scoped server-side to customers already linked to this groomer (a
// redeemed invite code, or a past booking). An empty search returns every
// linked customer, for the customer list screen; a non-empty one narrows it.
export async function fetchGroomerCustomers(search = ''): Promise<CustomerSummary[]> {
  const { data, error } = await supabase.rpc('groomer_search_customers', { p_search: search });
  if (error) throw error;

  const byCustomer = new Map<string, CustomerSummary>();
  for (const row of data ?? []) {
    let customer = byCustomer.get(row.customer_id);
    if (!customer) {
      customer = { customerId: row.customer_id, email: row.email, name: row.name, phone: row.phone, pets: [] };
      byCustomer.set(row.customer_id, customer);
    }
    if (row.pet_id) {
      customer.pets.push({ id: row.pet_id, name: row.pet_name, species: row.pet_species, breed: row.pet_breed });
    }
  }
  return [...byCustomer.values()].sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
}

export type CustomerPetDetail = CustomerPet & {
  color: string | null;
  weightLbs: number | null;
  isMicrochipped: boolean;
  microchipNumber: string | null;
  vetName: string | null;
  vetPhone: string | null;
};

// Full pet detail beyond what the search RPC returns - RLS already lets a
// groomer read any pet with a booking at their salon
// (0008_groomer_accounts.sql), so this is a plain query, no RPC needed.
export async function fetchCustomerPetDetails(customerId: string): Promise<CustomerPetDetail[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('id, name, species, breed, color, weight_lbs, is_microchipped, microchip_number, vet_name, vet_phone')
    .eq('owner_id', customerId);
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    species: p.species,
    breed: p.breed,
    color: p.color,
    weightLbs: p.weight_lbs,
    isMicrochipped: p.is_microchipped,
    microchipNumber: p.microchip_number,
    vetName: p.vet_name,
    vetPhone: p.vet_phone,
  }));
}

export type CustomerBookingHistoryRow = {
  id: string;
  startsAt: string;
  status: string;
  serviceName: string;
  petName: string;
  invoiceTotalCents: number | null;
};

export async function fetchCustomerBookingHistory(
  groomerId: string,
  customerId: string
): Promise<CustomerBookingHistoryRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, starts_at, status, invoice_total_cents, groomer_services(name), pets(name)')
    .eq('groomer_id', groomerId)
    .eq('customer_id', customerId)
    .order('starts_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((b) => ({
    id: b.id,
    startsAt: b.starts_at,
    status: b.status,
    invoiceTotalCents: b.invoice_total_cents,
    serviceName: (b.groomer_services as unknown as { name: string } | null)?.name ?? 'Service',
    petName: (b.pets as unknown as { name: string } | null)?.name ?? 'Pet',
  }));
}
