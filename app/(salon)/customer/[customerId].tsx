import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { getOrCreateGroomerThread } from '@/services/chat';
import {
  fetchCustomerBookingHistory,
  fetchCustomerPetDetails,
  fetchGroomerCustomers,
  type CustomerBookingHistoryRow,
  type CustomerPetDetail,
  type CustomerSummary,
} from '@/services/customers';
import { useAuth } from '@/services/auth-context';
import { webContentWidth } from '@/constants/webLayout';
import { webFlushScroll } from '@/constants/webScroll';
import { notify } from '@/utils/confirm';

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CustomerDetailScreen() {
  const router = useRouter();
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const { groomerProfile } = useAuth();

  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [pets, setPets] = useState<CustomerPetDetail[]>([]);
  const [bookings, setBookings] = useState<CustomerBookingHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);

  async function handleMessage() {
    if (!groomerProfile) return;
    setMessaging(true);
    try {
      const threadId = await getOrCreateGroomerThread(customerId, groomerProfile.id);
      router.push({ pathname: '/chat/[threadId]', params: { threadId } });
    } catch (err) {
      notify('Could not start conversation', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setMessaging(false);
    }
  }

  useEffect(() => {
    if (!groomerProfile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [customers, petDetails, history] = await Promise.all([
          fetchGroomerCustomers(''),
          fetchCustomerPetDetails(customerId),
          fetchCustomerBookingHistory(groomerProfile!.id, customerId),
        ]);
        if (cancelled) return;
        setCustomer(customers.find((c) => c.customerId === customerId) ?? null);
        setPets(petDetails);
        setBookings(history);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [groomerProfile, customerId]);

  return (
    <SafeAreaView style={[styles.container, webContentWidth('content')]} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Back
        </Text>
      </View>

      {loading && <ActivityIndicator style={styles.loading} color={Colors.light.tint} />}
      {error && <Text style={styles.error}>Couldn&apos;t load this customer: {error}</Text>}
      {!loading && !error && !customer && <Text style={styles.error}>Customer not found.</Text>}

      {!loading && !error && customer && (
        <ScrollView style={webFlushScroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, webContentWidth('content')]}>
          <Text style={styles.title}>{customer.name || customer.email}</Text>
          <Text style={styles.subtitle}>
            {customer.name ? customer.email : 'No name on file yet'}
            {customer.phone ? ` · ${customer.phone}` : ''}
          </Text>

          <Pressable style={styles.messageButton} onPress={handleMessage} disabled={messaging}>
            {messaging ? (
              <ActivityIndicator color={Colors.light.tint} size="small" />
            ) : (
              <Text style={styles.messageButtonText}>Message this customer</Text>
            )}
          </Pressable>

          <Text style={styles.sectionTitle}>Pets</Text>
          {pets.length === 0 && <Text style={styles.emptyText}>No pets on file.</Text>}
          {pets.map((p) => (
            <View key={p.id} style={styles.petCard}>
              <Text style={styles.petName}>{p.name}</Text>
              <Text style={styles.petMeta}>
                {p.species[0].toUpperCase() + p.species.slice(1)}
                {p.breed ? ` · ${p.breed}` : ''}
                {p.color ? ` · ${p.color}` : ''}
                {p.weightLbs ? ` · ${p.weightLbs} lbs` : ''}
              </Text>
              {(p.isMicrochipped || p.vetName || p.vetPhone) && (
                <Text style={styles.petCare}>
                  {p.isMicrochipped && `Microchipped${p.microchipNumber ? ` · ${p.microchipNumber}` : ''}`}
                  {p.isMicrochipped && (p.vetName || p.vetPhone) ? ' · ' : ''}
                  {p.vetName ? `Vet: ${p.vetName}` : ''}
                  {p.vetPhone ? ` (${p.vetPhone})` : ''}
                </Text>
              )}
            </View>
          ))}

          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Booking history</Text>
          {bookings.length === 0 && <Text style={styles.emptyText}>No bookings with this customer yet.</Text>}
          {bookings.map((b) => (
            <View key={b.id} style={styles.bookingRow}>
              <View style={styles.bookingBody}>
                <Text style={styles.bookingService}>
                  {b.serviceName} <Text style={styles.bookingPet}>for {b.petName}</Text>
                </Text>
                <Text style={styles.bookingWhen}>{formatWhen(b.startsAt)}</Text>
              </View>
              <Text style={styles.bookingStatus}>{b.status}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: 20,
  },
  topRow: {
    flexDirection: 'row',
  },
  backLink: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  loading: {
    marginTop: 40,
  },
  error: {
    marginTop: 24,
    fontSize: 15,
    color: Colors.light.danger,
  },
  content: {
    paddingTop: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.light.textMuted,
    marginBottom: 20,
  },
  messageButton: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  messageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 12,
  },
  sectionSpacing: {
    marginTop: 28,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  petCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 1,
  },
  petName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  petMeta: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  petCare: {
    marginTop: 8,
    fontSize: 12.5,
    color: Colors.light.textMuted,
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  bookingBody: {
    flex: 1,
  },
  bookingService: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  bookingPet: {
    fontWeight: '400',
    color: Colors.light.textMuted,
  },
  bookingWhen: {
    marginTop: 2,
    fontSize: 12.5,
    color: Colors.light.textMuted,
  },
  bookingStatus: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
    color: Colors.light.textMuted,
  },
});
