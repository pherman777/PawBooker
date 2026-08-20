// Port of utils/vaccination.ts (pure function).
export function hasCurrentRabiesVaccination(documents: { documentType: string; expiresAt?: string }[]): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return documents.some((doc) => doc.documentType === 'rabies_vaccination' && doc.expiresAt != null && doc.expiresAt >= today);
}
