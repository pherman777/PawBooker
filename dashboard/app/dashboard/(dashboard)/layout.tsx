'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { BusinessAssistantFab } from '@/components/BusinessAssistantFab';
import { Button } from '@/components/Button';
import { Nav } from '@/components/Nav';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, groomerProfile, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) router.replace('/dashboard/sign-in');
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="page-loading">
        <span className="spinner" aria-hidden />
      </div>
    );
  }

  if (!groomerProfile) {
    return (
      <div className="page-loading page-loading-message">
        <p>No salon found for this account.</p>
        <p className="muted">
          This account isn&apos;t set up as a groomer. Finish listing your business, or sign out and use a
          groomer account.
        </p>
        <Button label="List your business" onClick={() => router.push('/dashboard/sign-up')} />
        <Button label="Sign out" variant="ghost" onClick={() => supabase.auth.signOut()} />
      </div>
    );
  }

  return (
    <>
      <Nav />
      <main className="width-content dashboard-main">{children}</main>
      <BusinessAssistantFab />
    </>
  );
}
