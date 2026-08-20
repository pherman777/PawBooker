import type { Metadata } from 'next';

// Purely a metadata override for everything under /dashboard (including
// /dashboard/sign-in, /dashboard/sign-up) - the actual auth-gating layout is
// (dashboard)/layout.tsx, a client component, which can't export metadata
// itself.
export const metadata: Metadata = {
  title: 'PawBooker Dashboard',
  description: 'Manage your grooming bookings.',
};

export default function DashboardSectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
