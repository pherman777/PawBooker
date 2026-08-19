import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BreedPicker } from '@/components/BreedPicker';
import { PetIdEmergencyFields, PetIdentity } from '@/components/PetIdEmergencyFields';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';
import { deleteStorageFile, getSignedUrl, uploadPetDocument, uploadPetPhoto } from '@/services/storage';
import type { Pet, PetDocument, PetDocumentType } from '@/types';
import { confirmAsync, notify } from '@/utils/confirm';
import { formatDateInputAsTyped, formatIsoDateAsMonthDayYear, parseMonthDayYear } from '@/utils/date';
import { sanitizeDecimalInput } from '@/utils/number';
import { formatPhoneForDisplay } from '@/utils/phone';

const PET_SPECIES: Pet['species'][] = ['dog', 'cat', 'other'];

type PendingDocument = {
  uri: string;
  mimeType: string;
  fileName: string;
};

export default function PetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [pet, setPet] = useState<Pet | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PetDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Editable pet details, initialized from the loaded row.
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<Pet['species']>('dog');
  const [dogBreed, setDogBreed] = useState('');
  const [otherBreed, setOtherBreed] = useState('');
  const [color, setColor] = useState('');
  const [weight, setWeight] = useState('');
  const [identity, setIdentity] = useState<PetIdentity>({
    isMicrochipped: false,
    microchipNumber: '',
    vetName: '',
    vetPhone: '',
  });
  const [savingDetails, setSavingDetails] = useState(false);

  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null);
  const [documentLabel, setDocumentLabel] = useState('');
  const [documentType, setDocumentType] = useState<PetDocumentType>('other');
  const [expiresAt, setExpiresAt] = useState('');

  const load = useCallback(async () => {
    const [petResult, documentsResult] = await Promise.all([
      supabase
        .from('pets')
        .select(
          'id, owner_id, name, species, breed, color, weight_lbs, photo_path, is_microchipped, microchip_number, vet_name, vet_phone'
        )
        .eq('id', id)
        .single(),
      supabase
        .from('pet_documents')
        .select('id, pet_id, label, storage_path, mime_type, document_type, expires_at, created_at')
        .eq('pet_id', id)
        .order('created_at', { ascending: false }),
    ]);

    if (petResult.error || !petResult.data) {
      setError(petResult.error?.message ?? 'Pet not found');
      setLoading(false);
      return;
    }

    const petRow = petResult.data;
    setPet({
      id: petRow.id,
      ownerId: petRow.owner_id,
      name: petRow.name,
      species: petRow.species,
      breed: petRow.breed ?? undefined,
      color: petRow.color ?? undefined,
      weightLbs: petRow.weight_lbs ?? undefined,
      photoPath: petRow.photo_path ?? undefined,
      isMicrochipped: petRow.is_microchipped ?? false,
      microchipNumber: petRow.microchip_number ?? undefined,
      vetName: petRow.vet_name ?? undefined,
      vetPhone: petRow.vet_phone ?? undefined,
    });

    const isDogRow = petRow.species === 'dog';
    setName(petRow.name);
    setSpecies(petRow.species);
    setDogBreed(isDogRow ? petRow.breed ?? '' : '');
    setOtherBreed(isDogRow ? '' : petRow.breed ?? '');
    setColor(petRow.color ?? '');
    setWeight(petRow.weight_lbs != null ? String(petRow.weight_lbs) : '');
    setIdentity({
      isMicrochipped: petRow.is_microchipped ?? false,
      microchipNumber: petRow.microchip_number ?? '',
      vetName: petRow.vet_name ?? '',
      vetPhone: formatPhoneForDisplay(petRow.vet_phone),
    });

    setPhotoUrl(petRow.photo_path ? await getSignedUrl('pet-photos', petRow.photo_path) : null);

    if (documentsResult.data) {
      setDocuments(
        documentsResult.data.map((d) => ({
          id: d.id,
          petId: d.pet_id,
          label: d.label,
          storagePath: d.storage_path,
          mimeType: d.mime_type ?? undefined,
          documentType: d.document_type,
          expiresAt: d.expires_at ?? undefined,
          createdAt: d.created_at,
        }))
      );
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleChangePhoto() {
    if (!session || !pet) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingPhoto(true);

    try {
      const path = await uploadPetPhoto(session.user.id, pet.id, asset.uri, asset.mimeType ?? 'image/jpeg');
      await supabase.from('pets').update({ photo_path: path }).eq('id', pet.id);
      setPhotoUrl(await getSignedUrl('pet-photos', path));
    } catch (err) {
      notify('Upload failed', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handlePickDocument() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setPendingDocument({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      fileName: asset.name,
    });
    setDocumentLabel(asset.name);
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
        notify('Expiration date required', 'Enter the expiration date as MM/DD/YYYY.');
        return;
      }
    }

    setUploadingDoc(true);

    try {
      const path = await uploadPetDocument(
        session.user.id,
        pet.id,
        pendingDocument.uri,
        pendingDocument.mimeType,
        pendingDocument.fileName
      );
      const { error: insertError } = await supabase.from('pet_documents').insert({
        pet_id: pet.id,
        owner_id: session.user.id,
        label: documentLabel.trim(),
        storage_path: path,
        mime_type: pendingDocument.mimeType,
        document_type: documentType,
        expires_at: expiresAtIso,
      });
      if (insertError) throw insertError;
      setPendingDocument(null);
      await load();
    } catch (err) {
      notify('Upload failed', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleViewDocument(document: PetDocument) {
    const url = await getSignedUrl('pet-documents', document.storagePath);
    Linking.openURL(url);
  }

  async function handleDeleteDocument(document: PetDocument) {
    await supabase.from('pet_documents').delete().eq('id', document.id);
    await deleteStorageFile('pet-documents', document.storagePath);
    setDocuments((prev) => prev.filter((d) => d.id !== document.id));
  }

  async function confirmDeletePet() {
    if (!pet) return;
    const confirmed = await confirmAsync('Delete pet', `Delete ${pet.name}? This can't be undone.`);
    if (confirmed) await handleDeletePet();
  }

  async function handleDeletePet() {
    if (!pet) return;

    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('pet_id', pet.id);

    if (count && count > 0) {
      notify('Can’t delete', `${pet.name} has existing bookings and can’t be deleted.`);
      return;
    }

    const { error: deleteError } = await supabase.from('pets').delete().eq('id', pet.id);
    if (deleteError) {
      notify('Delete failed', deleteError.message);
      return;
    }
    router.back();
  }

  function handleSpeciesChange(next: Pet['species']) {
    setSpecies(next);
    if (next !== 'dog') {
      setDogBreed('');
    } else {
      setOtherBreed('');
    }
  }

  const isDog = species === 'dog';
  const weightValue = Number(weight);
  const isValidWeight = weight.trim().length > 0 && Number.isFinite(weightValue) && weightValue > 0;

  const canSaveDetails =
    name.trim().length > 0 && (!isDog || (dogBreed.length > 0 && color.trim().length > 0 && isValidWeight));

  async function handleSaveDetails() {
    if (!pet || !canSaveDetails) return;
    setSavingDetails(true);
    try {
      const { error: updateError } = await supabase
        .from('pets')
        .update({
          name: name.trim(),
          species,
          breed: isDog ? dogBreed : otherBreed.trim() || null,
          color: isDog ? color.trim() : null,
          weight_lbs: isDog ? weightValue : null,
          is_microchipped: identity.isMicrochipped,
          microchip_number: identity.isMicrochipped ? identity.microchipNumber.trim() || null : null,
          vet_name: identity.vetName.trim() || null,
          vet_phone: identity.vetPhone.trim() || null,
        })
        .eq('id', pet.id);
      if (updateError) throw updateError;
      await load();
      notify('Saved', `${name.trim()}'s profile has been updated.`);
    } catch (err) {
      notify('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingDetails(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loading} color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  if (error || !pet) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>Couldn&apos;t load this pet{error ? `: ${error}` : ''}.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScrollView
        style={styles.flex}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Pressable style={styles.photoWrapper} onPress={handleChangePhoto} disabled={uploadingPhoto}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.photo} contentFit="cover" />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Text style={styles.photoPlaceholderText}>{pet.name[0]?.toUpperCase()}</Text>
            </View>
          )}
          {uploadingPhoto && (
            <View style={styles.photoOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          <Text style={styles.changePhotoText}>Change photo</Text>
        </Pressable>

        <Text style={styles.name}>{pet.name}</Text>

        <Text style={styles.sectionTitle}>Details</Text>

        <TextInput
          style={styles.input}
          placeholder="Pet's name"
          placeholderTextColor={Colors.light.textMuted}
          value={name}
          onChangeText={setName}
        />

        <View style={styles.speciesRow}>
          {PET_SPECIES.map((option) => {
            const isSelected = species === option;
            return (
              <Pressable
                key={option}
                style={[styles.speciesChip, isSelected && styles.chipSelected]}
                onPress={() => handleSpeciesChange(option)}>
                <Text style={[styles.speciesChipText, isSelected && styles.chipTextSelected]}>
                  {option[0].toUpperCase() + option.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isDog ? (
          <>
            <Text style={styles.label}>Breed</Text>
            <BreedPicker value={dogBreed} onChange={setDogBreed} />
            <Text style={styles.label}>Color</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Golden"
              placeholderTextColor={Colors.light.textMuted}
              value={color}
              onChangeText={setColor}
            />
            <Text style={styles.label}>Weight (lbs)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 45"
              placeholderTextColor={Colors.light.textMuted}
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={(text) => setWeight(sanitizeDecimalInput(text))}
            />
            <PetIdEmergencyFields value={identity} onChange={setIdentity} />
          </>
        ) : (
          <TextInput
            style={styles.input}
            placeholder="Breed (optional)"
            placeholderTextColor={Colors.light.textMuted}
            value={otherBreed}
            onChangeText={setOtherBreed}
          />
        )}

        <Pressable
          style={[styles.saveDetailsButton, (!canSaveDetails || savingDetails) && styles.buttonDisabled]}
          onPress={handleSaveDetails}
          disabled={!canSaveDetails || savingDetails}>
          {savingDetails ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveDetailsButtonText}>Save changes</Text>
          )}
        </Pressable>

        <Text style={styles.sectionTitle}>Documents</Text>
        {documents.map((document) => {
          const isRabies = document.documentType === 'rabies_vaccination';
          const isExpired =
            isRabies && document.expiresAt != null && document.expiresAt < new Date().toISOString().slice(0, 10);
          return (
            <View key={document.id} style={styles.documentRow}>
              <Pressable style={styles.documentInfo} onPress={() => handleViewDocument(document)}>
                <Text style={styles.documentLabel} numberOfLines={1}>
                  {document.label}
                </Text>
                <Text style={styles.documentMeta}>
                  {new Date(document.createdAt).toLocaleDateString()}
                </Text>
                {isRabies && (
                  <Text style={[styles.documentBadge, isExpired && styles.documentBadgeExpired]}>
                    Rabies vaccination · {isExpired ? 'Expired' : 'Valid until'}{' '}
                    {document.expiresAt ? formatIsoDateAsMonthDayYear(document.expiresAt) : ''}
                  </Text>
                )}
              </Pressable>
              <Pressable onPress={() => handleDeleteDocument(document)}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          );
        })}
        {documents.length === 0 && <Text style={styles.emptyText}>No documents uploaded yet.</Text>}

        {pendingDocument ? (
          <View style={styles.addDocumentForm}>
            <TextInput
              style={styles.input}
              placeholder="Document label"
              placeholderTextColor={Colors.light.textMuted}
              value={documentLabel}
              onChangeText={setDocumentLabel}
            />
            <View style={styles.typeRow}>
              <Pressable
                style={[styles.typeChip, documentType === 'other' && styles.chipSelected]}
                onPress={() => setDocumentType('other')}>
                <Text style={[styles.typeChipText, documentType === 'other' && styles.chipTextSelected]}>
                  Other
                </Text>
              </Pressable>
              <Pressable
                style={[styles.typeChip, documentType === 'rabies_vaccination' && styles.chipSelected]}
                onPress={() => setDocumentType('rabies_vaccination')}>
                <Text
                  style={[
                    styles.typeChipText,
                    documentType === 'rabies_vaccination' && styles.chipTextSelected,
                  ]}>
                  Rabies vaccination
                </Text>
              </Pressable>
            </View>
            {documentType === 'rabies_vaccination' && (
              <TextInput
                style={styles.input}
                placeholder="Expiration date (MM/DD/YYYY)"
                placeholderTextColor={Colors.light.textMuted}
                keyboardType="number-pad"
                maxLength={10}
                value={expiresAt}
                onChangeText={(text) => setExpiresAt(formatDateInputAsTyped(text))}
              />
            )}
            <View style={styles.formActions}>
              <Pressable style={styles.cancelButton} onPress={handleCancelDocument} disabled={uploadingDoc}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveDocButton, (!documentLabel.trim() || uploadingDoc) && styles.buttonDisabled]}
                onPress={handleSaveDocument}
                disabled={!documentLabel.trim() || uploadingDoc}>
                {uploadingDoc ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveDocButtonText}>Save document</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.addButton} onPress={handlePickDocument}>
            <Text style={styles.addButtonText}>+ Add document</Text>
          </Pressable>
        )}

        <Pressable style={styles.deletePetButton} onPress={confirmDeletePet}>
          <Text style={styles.deletePetText}>Delete pet</Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loading: {
    marginTop: 40,
  },
  error: {
    margin: 20,
    fontSize: 15,
    color: Colors.light.danger,
  },
  photoWrapper: {
    alignSelf: 'center',
    alignItems: 'center',
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  photoPlaceholder: {
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontSize: 40,
    fontWeight: '700',
    color: Colors.light.textMuted,
  },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 24,
    borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  name: {
    marginTop: 20,
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
    textAlign: 'center',
  },
  meta: {
    marginTop: 4,
    fontSize: 15,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 12,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  documentInfo: {
    flex: 1,
    marginRight: 12,
  },
  documentLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  documentMeta: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  documentBadge: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  documentBadgeExpired: {
    color: Colors.light.danger,
  },
  deleteText: {
    fontSize: 14,
    color: Colors.light.danger,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  addButton: {
    marginTop: 16,
    height: 46,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  addDocumentForm: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textMuted,
    marginBottom: 6,
  },
  input: {
    height: 46,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 12,
    fontSize: 15,
    color: Colors.light.text,
    marginBottom: 14,
  },
  speciesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  speciesChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  speciesChipText: {
    fontSize: 14,
    color: Colors.light.text,
  },
  saveDetailsButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveDetailsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  typeChipText: {
    fontSize: 13,
    color: Colors.light.text,
  },
  chipSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  chipTextSelected: {
    color: '#fff',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.textMuted,
  },
  saveDocButton: {
    flex: 2,
    height: 42,
    borderRadius: 8,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDocButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  deletePetButton: {
    marginTop: 32,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletePetText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.danger,
  },
});
