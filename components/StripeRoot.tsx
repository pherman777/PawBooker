import { StripeProvider } from '@stripe/stripe-react-native';
import type { ReactNode } from 'react';

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

if (!STRIPE_PUBLISHABLE_KEY) {
  throw new Error('Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY');
}

export function StripeRoot({ children }: { children: ReactNode }) {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY!}>
      <>{children}</>
    </StripeProvider>
  );
}
