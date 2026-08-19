'use client';

import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { AddressSearchInput, type SelectedLocation } from '@/components/AddressSearchInput';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';
import { uploadGroomerAvatar } from '@/lib/avatar';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

// Ported from utils/phone.ts and utils/email.ts - inlined here since there's
// no shared lib/phone.ts or lib/email.ts in this app yet.
function formatPhoneAsTyped(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 10);
  const len = digits.length;
  if (len === 0) return '';
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatPhoneForDisplay(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return formatPhoneAsTyped(digits);
  if (digits.length === 11 && digits.startsWith('1')) return `1 ${formatPhoneAsTyped(digits.slice(1))}`;
  return value.trim();
}

function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, '').length === 10;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function BusinessInfoPage() {
  const router = useRouter();
  const { session, groomerProfile, refreshGroomerProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  // The saved address is just displayed as a chip - editing it requires
  // picking a fresh one via AddressSearchInput (location), which is what
  // actually carries latitude/longitude/zip/city/state. Leaving `location`
  // null on save keeps the existing address and coordinates untouched.
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('groomers')
        .select('name, phone, email, bio, address')
        .eq('id', groomerProfile!.id)
        .single();
      if (cancelled || !data) return;
      setName(data.name ?? '');
      setPhone(formatPhoneForDisplay(data.phone));
      setEmail(data.email ?? '');
      setBio(data.bio ?? '');
      setAddress(data.address ?? '');
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile]);

  async function handleSave() {
    if (!groomerProfile) return;
    if (!name.trim()) {
      window.alert('Name required\n\nEnter your business name.');
      return;
    }
    if (phone.trim() && !isValidPhone(phone)) {
      window.alert('Check your phone number\n\nEnter a complete 10-digit phone number, or leave it blank.');
      return;
    }
    if (email.trim() && !isValidEmail(email)) {
      window.alert('Check your email\n\nEnter a valid email address, or leave it blank.');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('groomers')
      .update({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        bio: bio.trim() || null,
        address: location ? location.label : address.trim() || null,
        ...(location
          ? {
              latitude: location.latitude,
              longitude: location.longitude,
              zip_code: location.zipCode ?? null,
              city: location.city ?? null,
              state: location.state ?? null,
            }
          : {}),
      })
      .eq('id', groomerProfile.id);
    setSaving(false);

    if (error) {
      window.alert(`Could not save\n\n${error.message}`);
      return;
    }
    await refreshGroomerProfile();
    window.alert('Saved\n\nYour business info has been updated.');
    router.back();
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session || !groomerProfile) return;

    setUploadingPhoto(true);
    try {
      await uploadGroomerAvatar(session.user.id, groomerProfile.id, file);
      await refreshGroomerProfile();
    } catch (err) {
      window.alert(`Could not upload photo\n\n${err instanceof Error ? err.message : 'Something went wrong.'}`);
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <div className="settings-page width-form">
      <button className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title" style={{ marginBottom: 20 }}>
        Business info
      </h1>

      {loading ? (
        <span className="spinner" aria-hidden />
      ) : (
        <>
          <div className={styles.photoRow}>
            <button
              type="button"
              className={styles.photoCircle}
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              aria-label="Change business photo">
              {uploadingPhoto ? (
                <span className="spinner" aria-hidden />
              ) : groomerProfile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={groomerProfile.avatarUrl} alt="" className={styles.photoImg} />
              ) : (
                <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
                  <ellipse cx="12" cy="17" rx="4.6" ry="4" />
                  <ellipse cx="5" cy="9.5" rx="2.3" ry="2.7" transform="rotate(-20 5 9.5)" />
                  <ellipse cx="9.5" cy="5" rx="2.2" ry="2.6" transform="rotate(-8 9.5 5)" />
                  <ellipse cx="14.5" cy="5" rx="2.2" ry="2.6" transform="rotate(8 14.5 5)" />
                  <ellipse cx="19" cy="9.5" rx="2.3" ry="2.7" transform="rotate(20 19 9.5)" />
                </svg>
              )}
              <span className={styles.photoEditBadge}>
                <Pencil size={12} strokeWidth={2.2} />
              </span>
            </button>
            <div>
              <p className={styles.photoTitle}>Business photo</p>
              <p className={styles.photoSubtitle}>Shown to customers on your profile</p>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              style={{ display: 'none' }}
            />
          </div>

          <label className="field-label" htmlFor="business-name" style={{ marginTop: 0 }}>
            Business name
          </label>
          <input
            id="business-name"
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label className="field-label" htmlFor="business-phone" style={{ marginTop: 16 }}>
            Phone
          </label>
          <input
            id="business-phone"
            className="field-input"
            value={phone}
            onChange={(e) => setPhone(formatPhoneAsTyped(e.target.value))}
            maxLength={14}
            inputMode="tel"
          />

          <label className="field-label" htmlFor="business-email" style={{ marginTop: 16 }}>
            Contact email
          </label>
          <input
            id="business-email"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none"
            inputMode="email"
          />

          <label className="field-label" htmlFor="business-bio" style={{ marginTop: 16 }}>
            About your salon
          </label>
          <textarea
            id="business-bio"
            className="field-input"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short description customers will see"
          />

          <label className="field-label" style={{ marginTop: 16 }}>
            Address
          </label>
          {editingAddress ? (
            <AddressSearchInput
              onSelect={(loc) => {
                setLocation(loc);
                setEditingAddress(false);
              }}
            />
          ) : (
            <button type="button" className="selected-address-chip" onClick={() => setEditingAddress(true)}>
              <span>{location?.label || address || 'Add your business address'}</span>
              <span className="selected-address-change">Change</span>
            </button>
          )}

          <Button label="Save" onClick={handleSave} loading={saving} block style={{ marginTop: 28 }} />
        </>
      )}
    </div>
  );
}
