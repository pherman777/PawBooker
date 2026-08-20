'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { EMPTY_PET_IDENTITY, type PetIdentity } from '@/components/PetIdEmergencyFields';
import { PetFormFields } from '@/components/PetFormFields';
import { useCustomerAuth } from '@/lib/customerAuth';
import { createPet, type PetSpecies } from '@/lib/pets';

// Port of app/pet/new.tsx.
export default function NewPetPage() {
  const router = useRouter();
  const { session } = useCustomerAuth();

  const [name, setName] = useState('');
  const [species, setSpecies] = useState<PetSpecies>('dog');
  const [dogBreed, setDogBreed] = useState('');
  const [otherBreed, setOtherBreed] = useState('');
  const [color, setColor] = useState('');
  const [weight, setWeight] = useState('');
  const [identity, setIdentity] = useState<PetIdentity>(EMPTY_PET_IDENTITY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDog = species === 'dog';
  const weightValue = Number(weight);
  const isValidWeight = weight.trim().length > 0 && Number.isFinite(weightValue) && weightValue > 0;
  const canSave = name.trim().length > 0 && (!isDog || (dogBreed.length > 0 && color.trim().length > 0 && isValidWeight));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || !session) return;
    setSaving(true);
    setError(null);

    try {
      const petId = await createPet(session.user.id, {
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
      router.replace(`/book/pets/${petId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  }

  return (
    <div className="settings-page width-form">
      <button type="button" className="back-link" onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className="page-title">Add a pet</h1>
      <p className="page-subtitle">You&apos;ll be able to add vaccination records right after you save.</p>

      <form onSubmit={handleSave}>
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

        {error && <p className="sign-in-error">{error}</p>}

        <Button label="Save pet" type="submit" disabled={!canSave} loading={saving} block />
      </form>
    </div>
  );
}
