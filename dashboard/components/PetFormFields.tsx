'use client';

import { DOG_BREEDS, MIXED_BREED } from '@/lib/dogBreeds';
import { sanitizeDecimalInput } from '@/lib/number';
import type { PetSpecies } from '@/lib/pets';

import { PetIdEmergencyFields, type PetIdentity } from './PetIdEmergencyFields';
import styles from './PetFormFields.module.css';

const PET_SPECIES: PetSpecies[] = ['dog', 'cat', 'other'];

type Props = {
  name: string;
  onNameChange: (v: string) => void;
  species: PetSpecies;
  onSpeciesChange: (v: PetSpecies) => void;
  dogBreed: string;
  onDogBreedChange: (v: string) => void;
  otherBreed: string;
  onOtherBreedChange: (v: string) => void;
  color: string;
  onColorChange: (v: string) => void;
  weight: string;
  onWeightChange: (v: string) => void;
  identity: PetIdentity;
  onIdentityChange: (v: PetIdentity) => void;
};

// Shared field set for app/book/pets/new and app/book/pets/[petId] - port of
// the identical form in app/pet/new.tsx / app/pet/[id].tsx.
export function PetFormFields({
  name,
  onNameChange,
  species,
  onSpeciesChange,
  dogBreed,
  onDogBreedChange,
  otherBreed,
  onOtherBreedChange,
  color,
  onColorChange,
  weight,
  onWeightChange,
  identity,
  onIdentityChange,
}: Props) {
  const isDog = species === 'dog';

  function handleSpeciesChange(next: PetSpecies) {
    onSpeciesChange(next);
    if (next === 'dog') {
      onOtherBreedChange('');
    } else {
      onDogBreedChange('');
      onColorChange('');
      onWeightChange('');
    }
  }

  return (
    <>
      <div className={styles.field}>
        <label className="field-label" htmlFor="petName">
          Pet&apos;s name
        </label>
        <input id="petName" className="field-input" value={name} onChange={(e) => onNameChange(e.target.value)} required />
      </div>

      <div className={styles.speciesRow}>
        {PET_SPECIES.map((option) => (
          <button
            key={option}
            type="button"
            className={`${styles.chip} ${species === option ? styles.chipSelected : ''}`}
            onClick={() => handleSpeciesChange(option)}>
            {option[0].toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>

      {isDog ? (
        <>
          <div className={styles.field}>
            <label className="field-label" htmlFor="breed">
              Breed
            </label>
            <select id="breed" className="field-input" value={dogBreed} onChange={(e) => onDogBreedChange(e.target.value)}>
              <option value="" disabled>
                Select a breed...
              </option>
              {[MIXED_BREED, ...DOG_BREEDS].map((breed) => (
                <option key={breed} value={breed}>
                  {breed}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className="field-label" htmlFor="color">
              Color
            </label>
            <input id="color" className="field-input" placeholder="e.g. Golden" value={color} onChange={(e) => onColorChange(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className="field-label" htmlFor="weight">
              Weight (lbs)
            </label>
            <input
              id="weight"
              className="field-input"
              placeholder="e.g. 45"
              inputMode="decimal"
              value={weight}
              onChange={(e) => onWeightChange(sanitizeDecimalInput(e.target.value))}
            />
          </div>
          <PetIdEmergencyFields value={identity} onChange={onIdentityChange} />
        </>
      ) : (
        <div className={styles.field}>
          <label className="field-label" htmlFor="otherBreed">
            Breed (optional)
          </label>
          <input id="otherBreed" className="field-input" value={otherBreed} onChange={(e) => onOtherBreedChange(e.target.value)} />
        </div>
      )}
    </>
  );
}
