import type { Metadata } from 'next';

import { CustomerAuthProvider } from '@/lib/customerAuth';

// Metadata override + CustomerAuthProvider for everything under /book
// (including /book/sign-in, /book/sign-up) - mirrors app/dashboard/layout.tsx's
// role for the groomer side. The actual auth-gating layout is
// (book)/layout.tsx, a client component, which can't export metadata itself.
export const metadata: Metadata = {
  title: 'PawBooker — Book a groomer',
  description: 'Manage your pets, book grooming appointments, and message your groomer.',
};

export default function BookSectionLayout({ children }: { children: React.ReactNode }) {
  return <CustomerAuthProvider>{children}</CustomerAuthProvider>;
}
