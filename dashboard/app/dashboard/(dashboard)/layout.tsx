'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { BusinessAssistantFab } from '@/components/BusinessAssistantFab';
import { Button } from '@/components/Button';
import { Nav } from '@/components/Nav';
import { useAuth } from '@/lib/auth';

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
        <p className="muted">Finish listing your business to get to your setup steps.</p>
        <Button label="List your business" onClick={() => router.push('/dashboard/sign-up')} />
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
