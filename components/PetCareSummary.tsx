import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { formatPhoneForDisplay } from '@/utils/phone';

export type PetCareInfo = {
  isAnxious?: boolean;
  isMatted?: boolean;
  needsExtraCare?: boolean;
  careNotes?: string;
  isMicrochipped?: boolean;
  microchipNumber?: string;
  vetName?: string;
  vetPhone?: string;
};

const FLAG_LABELS: { key: keyof PetCareInfo; label: string }[] = [
  { key: 'isAnxious', label: 'May be nervous / nip' },
  { key: 'isMatted', label: 'Matting / tangled coat' },
  { key: 'needsExtraCare', label: 'Needs extra time / care' },
];

/** Groomer-facing, read-only summary of a pet's grooming needs and emergency info. */
export function PetCareSummary({ info }: { info: PetCareInfo }) {
  const flags = FLAG_LABELS.filter(({ key }) => info[key]);
  const hasCare = flags.length > 0 || Boolean(info.careNotes?.trim());
  const hasEmergency =
    Boolean(info.isMicrochipped) || Boolean(info.vetName?.trim()) || Boolean(info.vetPhone?.trim());

  if (!hasCare && !hasEmergency) return null;

  const vetLine = [info.vetName?.trim(), formatPhoneForDisplay(info.vetPhone)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.container}>
      {hasCare && (
        <>
          <View style={styles.flagRow}>
            {flags.map(({ key, label }) => (
              <View key={key} style={styles.flagChip}>
                <Text style={styles.flagChipText}>{label}</Text>
              </View>
            ))}
          </View>
          {Boolean(info.careNotes?.trim()) && <Text style={styles.notes}>{info.careNotes?.trim()}</Text>}
        </>
      )}

      {hasEmergency && (
        <View style={styles.emergencyBlock}>
          {info.isMicrochipped && (
            <Text style={styles.emergencyText}>
              Microchipped{info.microchipNumber?.trim() ? ` · ${info.microchipNumber.trim()}` : ''}
            </Text>
          )}
          {vetLine.length > 0 && <Text style={styles.emergencyText}>Vet: {vetLine}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.warning,
    backgroundColor: `${Colors.light.warning}14`,
  },
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  flagChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.light.warning,
  },
  flagChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  notes: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.text,
  },
  emergencyBlock: {
    marginTop: 8,
  },
  emergencyText: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
});
