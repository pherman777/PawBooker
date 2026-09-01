'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AddPaymentMethodForm } from '@/components/AddPaymentMethodForm';
import { Button } from '@/components/Button';
import {
  deleteAccount,
  fetchPaymentMethods,
  fetchProfile,
  makePaymentMethodDefault,
  redeemInvite,
  saveContactInfo,
  updatePassword,
  type SavedPaymentMethod,
} from '@/lib/account';
import { useCustomerAuth } from '@/lib/customerAuth';
import { customerSupabase } from '@/lib/customerSupabase';
import { formatPhoneAsTyped, formatPhoneForDisplay } from '@/lib/phone';
import { fetchPets, type Pet } from '@/lib/pets';
import { getSignedUrl } from '@/lib/storage';
import { createSetupIntent, finalizePaymentMethod, removePaymentMethod } from '@/lib/customerStripe';

import styles from './page.module.css';

type PetRow = Pet & { photoUrl: string | null };

function paymentMethodLabel(method: SavedPaymentMethod) {
  const brand = method.cardBrand ? method.cardBrand[0].toUpperCase() + method.cardBrand.slice(1) : 'Card';
  const walletPrefix = method.walletType === 'apple_pay' ? 'Apple Pay · ' : method.walletType === 'google_pay' ? 'Google Pay · ' : '';
  return `${walletPrefix}${brand} ···· ${method.cardLast4 ?? '????'}`;
}

// Port of app/account.tsx + app/(tabs)/profile.tsx, combined into one page.
export default function AccountPage() {
  const router = useRouter();
  const { session } = useCustomerAuth();
  const currentEmail = session?.user.email ?? '';

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(currentEmail);
  const [phone, setPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [contactMessage, setContactMessage] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const [pets, setPets] = useState<PetRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [updatingMethodId, setUpdatingMethodId] = useState<string | null>(null);

  const [addingCard, setAddingCard] = useState(false);
  const [cardSetupSecret, setCardSetupSecret] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const [deletingAccount, setDeletingAccount] = useState(false);

  const loadPaymentMethods = useCallback(async () => {
    if (!session) return;
    setPaymentMethods(await fetchPaymentMethods(session.user.id));
  }, [session]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    const [profile, petsResult] = await Promise.all([fetchProfile(session.user.id), fetchPets(session.user.id), loadPaymentMethods()]);

    setName(profile.name);
    setPhone(formatPhoneForDisplay(profile.phone));

    const rows = await Promise.all(
      petsResult.map(async (p) => ({ ...p, photoUrl: p.photoPath ? await getSignedUrl('pet-photos', p.photoPath) : null }))
    );
    setPets(rows);
    setLoading(false);
  }, [session, loadPaymentMethods]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSavingContact(true);
    setContactError(null);
    setContactMessage(null);
    try {
      const { emailChangeRequiresConfirmation } = await saveContactInfo(session.user.id, currentEmail, { name, email, phone });
      setContactMessage(
        emailChangeRequiresConfirmation
          ? `We sent a confirmation link to ${email.trim()}. Your email updates once you click it.`
          : 'Your contact info has been updated.'
      );
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingContact(false);
    }
  }

  const canSavePassword = newPassword.length >= 8 && newPassword === confirmPassword && !savingPassword;

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setPasswordMessage('Use at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords don't match.");
      return;
    }
    setSavingPassword(true);
    setPasswordMessage(null);
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password updated.');
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleStartAddCard() {
    setCardError(null);
    setAddingCard(true);
    try {
      const { setupIntentClientSecret } = await createSetupIntent();
      setCardSetupSecret(setupIntentClientSecret);
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Could not start card setup.');
      setAddingCard(false);
    }
  }

  async function handleCardSaved(setupIntentId: string) {
    try {
      await finalizePaymentMethod(setupIntentId);
      setAddingCard(false);
      setCardSetupSecret(null);
      await loadPaymentMethods();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Could not save card.');
    }
  }

  function handleCancelAddCard() {
    setAddingCard(false);
    setCardSetupSecret(null);
    setCardError(null);
  }

  async function handleMakeDefault(id: string) {
    setUpdatingMethodId(id);
    try {
      await makePaymentMethodDefault(id);
      await loadPaymentMethods();
    } finally {
      setUpdatingMethodId(null);
    }
  }

  async function handleRemoveMethod(id: string) {
    if (!window.confirm('Remove this payment method? This cannot be undone.')) return;
    setUpdatingMethodId(id);
    try {
      await removePaymentMethod(id);
      await loadPaymentMethods();
    } finally {
      setUpdatingMethodId(null);
    }
  }

  async function handleRedeemInvite() {
    if (!inviteCode.trim()) return;
    setRedeeming(true);
    setInviteMessage(null);
    try {
      const groomerName = await redeemInvite(inviteCode.trim());
      setInviteCode('');
      setShowInvite(false);
      setInviteMessage(`You're now connected with ${groomerName}.`);
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRedeeming(false);
    }
  }

  async function handleDeleteAccount() {
    if (
      !window.confirm(
        "Delete your account? This permanently deletes your account, pets, saved payment methods, and messages. Some booking history may be kept in anonymized form for the groomer's records. This cannot be undone."
      )
    )
      return;

    setDeletingAccount(true);
    try {
      await deleteAccount();
      router.replace('/book/sign-in');
    } catch {
      setDeletingAccount(false);
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" aria-hidden />
      </div>
    );
  }

  return (
    <div className="settings-page width-form">
      <h1 className="page-title">Account</h1>

      <p className={styles.section}>Contact info</p>
      <form onSubmit={handleSaveContact}>
        <div className={styles.field}>
          <label className="field-label" htmlFor="name">
            Full name
          </label>
          <input id="name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <p className={styles.hint}>Shown to your groomer so they know who&apos;s booking.</p>

        <div className={styles.field}>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input id="email" className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label className="field-label" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            className="field-input"
            placeholder="(555) 123-4567"
            maxLength={14}
            value={phone}
            onChange={(e) => setPhone(formatPhoneAsTyped(e.target.value))}
          />
        </div>

        {contactError && <p className="sign-in-error">{contactError}</p>}
        {contactMessage && <p className={styles.hint}>{contactMessage}</p>}

        <Button label="Save contact info" type="submit" loading={savingContact} />
      </form>

      <p className={styles.section}>Change password</p>
      <form onSubmit={handleUpdatePassword}>
        <div className={styles.field}>
          <label className="field-label" htmlFor="newPassword">
            New password
          </label>
          <input
            id="newPassword"
            className="field-input"
            type="password"
            placeholder="At least 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className="field-label" htmlFor="confirmPassword">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            className="field-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {passwordMessage && <p className={styles.hint}>{passwordMessage}</p>}
        <Button label="Update password" type="submit" disabled={!canSavePassword} loading={savingPassword} />
      </form>

      <p className={styles.section}>Your pets</p>
      {pets.length === 0 && <p className={styles.emptyText}>No pets added yet.</p>}
      <div className={styles.list}>
        {pets.map((pet) => (
          <Link key={pet.id} href={`/book/pets/${pet.id}`} className={styles.row}>
            {pet.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pet.photoUrl} alt="" className={styles.avatar} />
            ) : (
              <div className={styles.avatarPlaceholder}>{pet.name[0]?.toUpperCase()}</div>
            )}
            <div className={styles.rowText}>
              <div className={styles.rowTitle}>{pet.name}</div>
              <div className={styles.rowSub}>
                {pet.species[0].toUpperCase() + pet.species.slice(1)}
                {pet.breed ? ` · ${pet.breed}` : ''}
              </div>
            </div>
          </Link>
        ))}
      </div>
      <Button label="+ Add pet" variant="secondary" onClick={() => router.push('/book/pets/new')} />

      <p className={styles.section}>Payment methods</p>
      {paymentMethods.length === 0 && <p className={styles.emptyText}>No payment methods on file.</p>}
      {paymentMethods.map((method) => (
        <div key={method.id} className={styles.cardRow}>
          <span className={styles.cardText}>
            {paymentMethodLabel(method)}
            {method.isDefault && <span className={styles.defaultPill}>Default</span>}
          </span>
          {updatingMethodId === method.id ? (
            <span className="spinner" aria-hidden />
          ) : (
            <span className={styles.cardActions}>
              {!method.isDefault && (
                <button type="button" className={styles.cardActionText} onClick={() => handleMakeDefault(method.id)}>
                  Make default
                </button>
              )}
              <button type="button" className={styles.cardActionTextDanger} onClick={() => handleRemoveMethod(method.id)}>
                Remove
              </button>
            </span>
          )}
        </div>
      ))}

      {addingCard ? (
        <div className="card" style={{ marginTop: 12, padding: 16 }}>
          {cardSetupSecret ? (
            <AddPaymentMethodForm clientSecret={cardSetupSecret} onSuccess={handleCardSaved} onCancel={handleCancelAddCard} />
          ) : (
            <div className="page-loading">
              <span className="spinner" aria-hidden />
            </div>
          )}
          {cardError && <p className="sign-in-error">{cardError}</p>}
        </div>
      ) : (
        <Button label={paymentMethods.length > 0 ? '+ Add another payment method' : '+ Add payment method'} variant="secondary" onClick={handleStartAddCard} />
      )}

      {showInvite ? (
        <div className={styles.inviteForm}>
          <input
            className="field-input"
            placeholder="Enter your groomer's invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          />
          <div className={styles.inviteActions}>
            <Button
              label="Cancel"
              variant="ghost"
              onClick={() => {
                setShowInvite(false);
                setInviteCode('');
              }}
            />
            <Button label="Apply" onClick={handleRedeemInvite} disabled={!inviteCode.trim() || redeeming} loading={redeeming} />
          </div>
        </div>
      ) : (
        <Button label="Have an invite code?" variant="secondary" onClick={() => setShowInvite(true)} />
      )}
      {inviteMessage && <p className={styles.hint}>{inviteMessage}</p>}

      <div className={styles.footerActions}>
        <Button label="Help & support" variant="secondary" onClick={() => router.push('/book/help')} />
        <Button label="Sign out" variant="secondary" onClick={() => customerSupabase.auth.signOut()} />
      </div>

      <button type="button" className={styles.deleteAccountButton} onClick={handleDeleteAccount} disabled={deletingAccount}>
        {deletingAccount ? 'Deleting…' : 'Delete account'}
      </button>
    </div>
  );
}
