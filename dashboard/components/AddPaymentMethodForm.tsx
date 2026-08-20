'use client';

import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useState } from 'react';

import { Button } from '@/components/Button';

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

type Props = {
  clientSecret: string;
  onSuccess: (setupIntentId: string) => void;
  onCancel: () => void;
};

// Web equivalent of native's PaymentSheet (constants/stripePaymentSheetOptions.ts
// + services/stripe.ts's createSetupIntent/finalizePaymentMethod flow): a
// Payment Element mounted against the same SetupIntent, confirmed with
// stripe.confirmSetup, then finalized through the same edge function.
function AddPaymentMethodFormInner({ onSuccess, onCancel }: Omit<Props, 'clientSecret'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'Something went wrong.');
      setSubmitting(false);
      return;
    }

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    });

    setSubmitting(false);
    if (confirmError) {
      setError(confirmError.message ?? 'Something went wrong.');
      return;
    }
    if (setupIntent) onSuccess(setupIntent.id);
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <p className="sign-in-error">{error}</p>}
      <div className="modal-actions">
        <Button label="Cancel" variant="ghost" onClick={onCancel} disabled={submitting} type="button" />
        <Button label="Save card" type="submit" loading={submitting} disabled={!stripe} />
      </div>
    </form>
  );
}

export function AddPaymentMethodForm({ clientSecret, onSuccess, onCancel }: Props) {
  if (!stripePromise) {
    return <p className="sign-in-error">Stripe is not configured.</p>;
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <AddPaymentMethodFormInner onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  );
}
