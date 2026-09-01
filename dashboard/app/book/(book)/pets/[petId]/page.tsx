'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Button } from '@/components/Button';
import { EMPTY_PET_IDENTITY, type PetIdentity } from '@/components/PetIdEmergencyFields';
import { PetFormFields } from '@/components/PetFormFields';
import { formatDateInputAsTyped, formatIsoDateAsMonthDayYear, parseMonthDayYear } from '@/lib/dates';
import { formatPhoneForDisplay } from '@/lib/phone';
import {
  deletePet,
  deletePetDocument,
  fetchPet,
  fetchPetDocuments,
  insertPetDocument,
  updatePet,
  updatePetPhoto,
  type Pet,
  type PetDocument,
  type PetDocumentType,
  type PetSpecies,
} from '@/lib/pets';
import { deleteStorageFile, getSignedUrl, uploadPetDocument, uploadPetPhoto } from '@/lib/storage';
import { useCustomerAuth } from '@/lib/customerAuth';

import styles from './page.module.css';

// Port of app/pet/[id].tsx.
export default function PetDetailPage() {
  const { petId } = useParams<{ petId: string }>();
  const router = useRouter();
  const { session } = useCustomerAuth();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const [pet, setPet] = useState<Pet | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PetDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [name, setName] = useState('');
  const [species, setSpecies] = useState<PetSpecies>('dog');
  const [dogBreed, setDogBreed] = useState('');
  const [otherBreed, setOtherBreed] = useState('');
  const [color, setColor] = useState('');
  const [weight, setWeight] = useState('');
  const [identity, setIdentity] = useState<PetIdentity>(EMPTY_PET_IDENTITY);
  const [savingDetails, setSavingDetails] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [pendingDocument, setPendingDocument] = useState<File | null>(null);
  const [documentLabel, setDocumentLabel] = useState('');
  const [documentType, setDocumentType] = useState<PetDocumentType>('other');
  const [expiresAt, setExpiresAt] = useState('');

  const load = useCallback(async () => {
    try {
      const [petRow, documentRows] = await Promise.all([fetchPet(petId), fetchPetDocuments(petId)]);
      setPet(petRow);
      const isDogRow = petRow.species === 'dog';
      setName(petRow.name);
      setSpecies(petRow.species);
      setDogBreed(isDogRow ? petRow.breed ?? '' : '');
      setOtherBreed(isDogRow ? '' : petRow.breed ?? '');
      setColor(petRow.color ?? '');
      setWeight(petRow.weightLbs != null ? String(petRow.weightLbs) : '');
      setIdentity({
        isMicrochipped: petRow.isMicrochipped ?? false,
        microchipNumber: petRow.microchipNumber ?? '',
        vetName: petRow.vetName ?? '',
        vetPhone: formatPhoneForDisplay(petRow.vetPhone),
      });
      setPhotoUrl(petRow.photoPath ? await getSignedUrl('pet-photos', petRow.photoPath) : null);
      setDocuments(documentRows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Pet not found');
    } finally {
      setLoading(false);
    }
  }, [petId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session || !pet) return;

    setUploadingPhoto(true);
    try {
      const path = await uploadPetPhoto(session.user.id, pet.id, file, file.type || 'image/jpeg');
      await updatePetPhoto(pet.id, path);
      setPhotoUrl(await getSignedUrl('pet-photos', path));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  }

  function handlePickDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingDocument(file);
    setDocumentLabel(file.name);
    setDocumentType('other');
    setExpiresAt('');
  }

  function handleCancelDocument() {
    setPendingDocument(null);
  }

  async function handleSaveDocument() {
    if (!session || !pet || !pendingDocument || !documentLabel.trim()) return;

    let expiresAtIso: string | null = null;
    if (documentType === 'rabies_vaccination') {
      expiresAtIso = parseMonthDayYear(expiresAt);
      if (!expiresAtIso) {
        setLoadError('Enter the expiration date as MM/DD/YYYY.');
        return;
      }
    }

    setUploadingDoc(true);
    try {
      const path = await uploadPetDocument(
        session.user.id,
        pet.id,
        pendingDocument,
        pendingDocument.type || 'application/octet-stream',
        pendingDocument.name
      );
      await insertPetDocument(pet.id, session.user.id, {
        label: documentLabel.trim(),
        storagePath: path,
        mimeType: pendingDocument.type || 'application/octet-stream',
        documentType,
        expiresAt: expiresAtIso,
      });
      setPendingDocument(null);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleViewDocument(document: PetDocument) {
    const url = await getSignedUrl('pet-documents', document.storagePath);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleDeleteDocument(document: PetDocument) {
    await deletePetDocument(document.id);
    await deleteStorageFile('pet-documents', document.storagePath);
    setDocuments((prev) => prev.filter((d) => d.id !== document.id));
  }

  async function handleDeletePet() {
    if (!pet) return;
    if (!window.confirm(`Delete ${pet.name}? This can't be undone.`)) return;

    try {
      await deletePet(pet.id);
      router.push('/book/account');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  const isDog = species === 'dog';
  const weightValue = Number(weight);
  const isValidWeight = weight.trim().length > 0 && Number.isFinite(weightValue) && weightValue > 0;
  const canSaveDetails = name.trim().length > 0 && (!isDog || (dogBreed.length > 0 && color.trim().length > 0 && isValidWeight));

  async function handleSaveDetails() {
    if (!pet || !canSaveDetails) return;
    setSavingDetails(true);
    setSaveMessage(null);
    try {
      await updatePet(pet.id, {
        name: name.trim(),
        species,
        breed: isDog ? dogBreed : otherBreed.trim() || null,
        color: isDog ? color.trim() : null,
        weightLbs: isDog ? weightValue : null,
        isMicrochipped: identity.isMicrochipped,
        microchipNumber: identity.isMicrochipped ? identity.microchipNumber.trim() || null : null,
        vetName: identity.vetName.trim() || null,
        vetPhone: identity.vetPhone.trim() || null,
      });
      await load();
      setSaveMessage('Saved.');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSavingDetails(false);
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" aria-hidden />
      </div>
    );
  }

  if (loadError && !pet) {
    return (
      <div className="settings-page width-form">
        <p className="sign-in-error">Couldn&apos;t load this pet: {loadError}</p>
      </div>
    );
  }

  if (!pet) return null;

  return (
    <div className="settings-page width-form">
      <button type="button" className="back-link" onClick={() => router.back()}>
        ← Back
      </button>

      <div className={styles.photoWrapper}>
        <button type="button" className={styles.photoButton} onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className={styles.photo} />
          ) : (
            <div className={styles.photoPlaceholder}>{pet.name[0]?.toUpperCase()}</div>
          )}
          <span className={styles.changePhotoText}>{uploadingPhoto ? 'Uploading…' : 'Change photo'}</span>
        </button>
        <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
      </div>

      <h1 className={styles.name}>{pet.name}</h1>

      <p className={styles.sectionTitle}>Details</p>

      <PetFormFields
        name={name}
        onNameChange={setName}
        species={species}
        onSpeciesChange={setSpecies}
        dogBreed={dogBreed}
        onDogBreedChange={setDogBreed}
        otherBreed={otherBreed}
        onOtherBreedChange={setOtherBreed}
        color={color}
        onColorChange={setColor}
        weight={weight}
        onWeightChange={setWeight}
        identity={identity}
        onIdentityChange={setIdentity}
      />

      {loadError && <p className="sign-in-error">{loadError}</p>}
      {saveMessage && <p className="page-subtitle">{saveMessage}</p>}

      <Button label="Save changes" onClick={handleSaveDetails} disabled={!canSaveDetails} loading={savingDetails} />

      <p className={styles.sectionTitle}>Documents</p>

      {documents.map((document) => {
        const isRabies = document.documentType === 'rabies_vaccination';
        const isExpired = isRabies && document.expiresAt != null && document.expiresAt < new Date().toISOString().slice(0, 10);
        return (
          <div key={document.id} className={styles.documentRow}>
            <button type="button" className={styles.documentInfo} onClick={() => handleViewDocument(document)}>
              <div className={styles.documentLabel}>{document.label}</div>
              <div className={styles.documentMeta}>{new Date(document.createdAt).toLocaleDateString()}</div>
              {isRabies && (
                <div className={`${styles.documentBadge} ${isExpired ? styles.documentBadgeExpired : ''}`}>
                  Rabies vaccination · {isExpired ? 'Expired' : 'Valid until'}{' '}
                  {document.expiresAt ? formatIsoDateAsMonthDayYear(document.expiresAt) : ''}
                </div>
              )}
            </button>
            <button type="button" className={styles.deleteText} onClick={() => handleDeleteDocument(document)}>
              Delete
            </button>
          </div>
        );
      })}
      {documents.length === 0 && <p className={styles.emptyText}>No documents uploaded yet.</p>}

      {pendingDocument ? (
        <div className={styles.addDocumentForm}>
          <input className="field-input" placeholder="Document label" value={documentLabel} onChange={(e) => setDocumentLabel(e.target.value)} />
          <div className={styles.typeRow}>
            <button
              type="button"
              className={`${styles.chip} ${documentType === 'other' ? styles.chipSelected : ''}`}
              onClick={() => setDocumentType('other')}>
              Other
            </button>
            <button
              type="button"
              className={`${styles.chip} ${documentType === 'rabies_vaccination' ? styles.chipSelected : ''}`}
              onClick={() => setDocumentType('rabies_vaccination')}>
              Rabies vaccination
            </button>
          </div>
          {documentType === 'rabies_vaccination' && (
            <input
              className="field-input"
              placeholder="Expiration date (MM/DD/YYYY)"
              maxLength={10}
              value={expiresAt}
              onChange={(e) => setExpiresAt(formatDateInputAsTyped(e.target.value))}
            />
          )}
          <div className={styles.formActions}>
            <Button label="Cancel" variant="ghost" onClick={handleCancelDocument} disabled={uploadingDoc} />
            <Button label="Save document" onClick={handleSaveDocument} disabled={!documentLabel.trim() || uploadingDoc} loading={uploadingDoc} />
          </div>
        </div>
      ) : (
        <Button label="+ Add document" variant="secondary" onClick={() => documentInputRef.current?.click()} />
      )}
      <input ref={documentInputRef} type="file" hidden onChange={handlePickDocument} />

      <button type="button" className={styles.deletePetButton} onClick={handleDeletePet}>
        Delete pet
      </button>
    </div>
  );
}
