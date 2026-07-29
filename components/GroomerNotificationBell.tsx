import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { supabase } from '@/services/supabase';
import type { GroomerNotification } from '@/types';

type Props = {
  groomerId: string;
  onSelectBooking?: (bookingId: string) => void;
};

const LABELS: Record<GroomerNotification['type'], string> = {
  booking_requested: 'New booking request',
  booking_cancelled: 'Booking cancelled',
  booking_rescheduled: 'Booking rescheduled',
};

export function GroomerNotificationBell({ groomerId, onSelectBooking }: Props) {
  const [notifications, setNotifications] = useState<GroomerNotification[]>([]);
  const [visible, setVisible] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('groomer_notifications')
      .select(
        'id, booking_id, type, read_at, created_at, bookings(starts_at, pets(name), groomer_services(name))'
      )
      .eq('groomer_id', groomerId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (data) {
      setNotifications(
        data.map((row) => {
          const booking = row.bookings as unknown as {
            starts_at: string;
            pets: { name: string } | null;
            groomer_services: { name: string } | null;
          } | null;

          return {
            id: row.id,
            groomerId,
            bookingId: row.booking_id,
            type: row.type,
            readAt: row.read_at ?? undefined,
            createdAt: row.created_at,
            petName: booking?.pets?.name,
            serviceName: booking?.groomer_services?.name,
            startsAt: booking?.starts_at,
          };
        })
      );
    }
  }, [groomerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  async function handleOpen() {
    setVisible(true);
    const unreadIds = notifications.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setMarking(true);
    await supabase
      .from('groomer_notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);
    setMarking(false);
    await load();
  }

  function handlePressNotification(bookingId: string) {
    setVisible(false);
    onSelectBooking?.(bookingId);
  }

  async function handleClearAll() {
    setMarking(true);
    await supabase.from('groomer_notifications').delete().eq('groomer_id', groomerId);
    setMarking(false);
    await load();
  }

  return (
    <>
      <Pressable style={styles.button} onPress={handleOpen} hitSlop={8}>
        <Ionicons name="notifications-outline" size={19} color={Colors.light.text} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Activity</Text>
              <View style={styles.sheetHeaderActions}>
                {notifications.length > 0 && (
                  <Pressable onPress={handleClearAll} hitSlop={8}>
                    <Text style={styles.clearText}>Clear all</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setVisible(false)} hitSlop={8}>
                  <Text style={styles.closeText}>Done</Text>
                </Pressable>
              </View>
            </View>

            {marking && <ActivityIndicator color={Colors.light.tint} style={styles.marking} />}

            <FlatList
              data={notifications}
              keyExtractor={(item) => item.id}
              style={styles.list}
              ListEmptyComponent={<Text style={styles.emptyText}>No activity yet.</Text>}
              renderItem={({ item }) => (
                <Pressable style={styles.row} onPress={() => handlePressNotification(item.bookingId)}>
                  <Text style={styles.rowTitle}>{LABELS[item.type]}</Text>
                  <Text style={styles.rowMeta}>
                    {item.petName ?? 'A pet'} · {item.serviceName ?? 'Service'}
                    {item.startsAt
                      ? ` · ${new Date(item.startsAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </Text>
                  <Text style={styles.rowTime}>
                    {new Date(item.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Colors.light.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    height: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
  },
  sheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  clearText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.danger,
  },
  closeText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  marking: {
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.textMuted,
    paddingVertical: 20,
    textAlign: 'center',
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  rowTime: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.light.textMuted,
  },
});
