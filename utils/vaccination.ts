import type { PetDocument } from '@/types';

export function hasCurrentRabiesVaccination(
  documents: Pick<PetDocument, 'documentType' | 'expiresAt'>[]
): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return documents.some(
    (doc) => doc.documentType === 'rabies_vaccination' && doc.expiresAt != null && doc.expiresAt >= today
  );
}
