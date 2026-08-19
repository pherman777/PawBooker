import type { PetCareInfo } from '@/lib/bookings';

const FLAG_LABELS: { key: keyof PetCareInfo; label: string }[] = [
  { key: 'isAnxious', label: 'May be nervous / nip' },
  { key: 'isMatted', label: 'Matting / tangled coat' },
  { key: 'needsExtraCare', label: 'Needs extra time / care' },
];

function formatPhone(phone?: string) {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Ported from components/PetCareSummary.tsx - real care flags/notes get the
// warning-toned box (something the groomer needs to actually notice);
// routine microchip/vet info alone gets a neutral one, same fix made in the
// RN app this session so alerts don't get lost in noise.
export function PetCareBox({ info }: { info: PetCareInfo }) {
  const flags = FLAG_LABELS.filter(({ key }) => info[key]);
  const hasCare = flags.length > 0 || Boolean(info.careNotes?.trim());
  const hasEmergency = Boolean(info.isMicrochipped) || Boolean(info.vetName?.trim()) || Boolean(info.vetPhone?.trim());

  if (!hasCare && !hasEmergency) return null;

  const vetLine = [info.vetName?.trim(), formatPhone(info.vetPhone)].filter(Boolean).join(' · ');

  return (
    <div className={`pet-care-box${hasCare ? ' pet-care-box-warning' : ''}`}>
      {hasCare && (
        <>
          <div className="pet-care-flags">
            {flags.map(({ key, label }) => (
              <span key={key} className="pet-care-flag">
                {label}
              </span>
            ))}
          </div>
          {info.careNotes?.trim() && <p className="pet-care-notes">{info.careNotes.trim()}</p>}
        </>
      )}
      {hasEmergency && (
        <div className="pet-care-emergency">
          {info.isMicrochipped && (
            <p>Microchipped{info.microchipNumber?.trim() ? ` · ${info.microchipNumber.trim()}` : ''}</p>
          )}
          {vetLine && <p>Vet: {vetLine}</p>}
        </div>
      )}
    </div>
  );
}
