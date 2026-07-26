import { useStripe } from '@stripe/stripe-react-native';

export function useStripePayments() {
  return useStripe();
}
