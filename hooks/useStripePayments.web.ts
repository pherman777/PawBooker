const NOT_SUPPORTED_ERROR = {
  code: 'Failed',
  message: 'Adding a payment method requires the PawBooker mobile app (iOS or Android).',
};

export function useStripePayments() {
  return {
    initPaymentSheet: async () => ({ error: NOT_SUPPORTED_ERROR }),
    presentPaymentSheet: async () => ({ error: NOT_SUPPORTED_ERROR }),
  };
}
