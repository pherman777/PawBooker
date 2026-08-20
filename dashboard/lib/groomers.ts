import { customerSupabase } from '@/lib/customerSupabase';
import type { GroomerHours } from '@/lib/hours';

export type GroomerService = {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  description?: string;
};

export type BrowseGroomer = {
  id: string;
  name: string;
  avatarUrl?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  rating: number;
  reviewCount: number;
  priceFromCents: number;
};

// Port of app/(tabs)/browse.tsx's load query.
export async function fetchGroomers(): Promise<BrowseGroomer[]> {
  const { data, error } = await customerSupabase
    .from('groomers')
    .select('id, name, avatar_url, address, latitude, longitude, rating, review_count, groomer_services!inner(id, price_cents)')
    .is('deactivated_at', null)
    .order('rating', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_url ?? undefined,
    address: row.address,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    rating: row.rating,
    reviewCount: row.review_count,
    priceFromCents: Math.min(...row.groomer_services.map((s) => s.price_cents)),
  }));
}

export type GroomerProfile = {
  id: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  rating: number;
  reviewCount: number;
  services: GroomerService[];
  phone?: string;
  email?: string;
  hours?: GroomerHours;
  isDeactivated: boolean;
};

export type SalonReview = {
  id: string;
  bookingId: string;
  groomerId: string;
  customerId: string;
  rating: number;
  comment?: string;
  createdAt: string;
};

// Port of app/groomer/[id].tsx's load query.
export async function fetchGroomerProfile(groomerId: string): Promise<{ groomer: GroomerProfile; reviews: SalonReview[] }> {
  const [groomerResult, reviewsResult] = await Promise.all([
    customerSupabase
      .from('groomers')
      .select(
        'id, name, avatar_url, bio, address, latitude, longitude, rating, review_count, phone, email, hours, deactivated_at, groomer_services(id, name, price_cents, duration_minutes, description)'
      )
      .eq('id', groomerId)
      .single(),
    customerSupabase
      .from('salon_reviews')
      .select('id, booking_id, groomer_id, customer_id, rating, comment, created_at')
      .eq('groomer_id', groomerId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const { data, error } = groomerResult;
  if (error || !data) throw error ?? new Error('Groomer not found');

  const groomer: GroomerProfile = {
    id: data.id,
    name: data.name,
    avatarUrl: data.avatar_url ?? undefined,
    bio: data.bio ?? undefined,
    address: data.address,
    latitude: data.latitude ?? undefined,
    longitude: data.longitude ?? undefined,
    rating: data.rating,
    reviewCount: data.review_count,
    services: data.groomer_services.map((s) => ({
      id: s.id,
      name: s.name,
      priceCents: s.price_cents,
      durationMinutes: s.duration_minutes,
      description: s.description ?? undefined,
    })),
    phone: data.phone ?? undefined,
    email: data.email ?? undefined,
    hours: (data.hours as GroomerHours | null) ?? undefined,
    isDeactivated: Boolean(data.deactivated_at),
  };

  const reviews: SalonReview[] = (reviewsResult.data ?? []).map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    groomerId: r.groomer_id,
    customerId: r.customer_id,
    rating: r.rating,
    comment: r.comment ?? undefined,
    createdAt: r.created_at,
  }));

  return { groomer, reviews };
}
