'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { CustomerNav } from '@/components/CustomerNav';
import { useCustomerAuth } from '@/lib/customerAuth';

// Mirrors app/dashboard/(dashboard)/layout.tsx's auth-guard pattern, for the
// customer side. Every real /book page (browse, bookings, messages, account,
// pets, groomer/schedule) lives inside this group; /book/sign-in,
// /book/sign-up, /book/forgot-password are siblings outside it.
export default function BookLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, loading } = useCustomerAuth();

  useEffect(() => {
    if (!loading && !session) router.replace('/book/sign-in');
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="page-loading">
        <span className="spinner" aria-hidden />
      </div>
    );
  }

  return (
    <>
      <CustomerNav />
      <main className="width-content dashboard-main">{children}</main>
    </>
  );
}
