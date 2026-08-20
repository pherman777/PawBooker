import type { Metadata } from 'next';

import { AuthProvider } from '@/lib/auth';

import './globals.css';

// The site-wide default - correct for the marketing homepage at `/`, which
// is now the app's root. `/dashboard` overrides it back to "PawBooker
// Dashboard" via its own layout.
export const metadata: Metadata = {
  title: 'PawBooker — Book trusted pet groomers',
  description:
    "PawBooker connects pet owners with local groomers for easy booking, reminders, and payment — and gives groomers one calm place to run their business.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
