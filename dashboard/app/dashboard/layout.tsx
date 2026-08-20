import type { Metadata } from 'next';

import { AuthProvider } from '@/lib/auth';

// Metadata override for everything under /dashboard (including
// /dashboard/sign-in, /dashboard/sign-up) - the actual auth-gating layout is
// (dashboard)/layout.tsx, a client component, which can't export metadata
// itself. Also mounts the groomer AuthProvider, scoped to only this
// subtree (moved out of the root layout, which is shared with the /book
// customer routes and their separate CustomerAuthProvider/session).
export const metadata: Metadata = {
  title: 'PawBooker Dashboard',
  description: 'Manage your grooming bookings.',
};

export default function DashboardSectionLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
