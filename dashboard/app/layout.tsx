import type { Metadata } from 'next';

import './globals.css';

// The site-wide default - correct for the marketing homepage at `/`, which
// is now the app's root. `/dashboard` and `/book` each override it back via
// their own layouts, which also each mount their own auth provider (groomer
// vs customer) - not here, since this layout wraps every route on the site
// and the two sessions must never share a client/storage key.
export const metadata: Metadata = {
  title: 'PawBooker — Book trusted pet groomers',
  description:
    "PawBooker connects pet owners with local groomers for easy booking, reminders, and payment — and gives groomers one calm place to run their business.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
