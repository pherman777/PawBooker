import type { Session } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications(session: Session | null, isGroomer: boolean) {
  const router = useRouter();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const bookingId = data?.bookingId;
      const threadId = data?.threadId;

      if (data?.screen === 'profile') {
        router.push('/(tabs)/profile');
      } else if (typeof bookingId === 'string') {
        if (isGroomer) {
          router.push({ pathname: '/(salon)', params: { bookingId } });
        } else {
          router.push({ pathname: '/(tabs)/bookings', params: { bookingId } });
        }
      } else if (typeof threadId === 'string') {
        router.push({ pathname: '/chat/[threadId]', params: { threadId } });
      }
    });

    return () => subscription.remove();
  }, [isGroomer, router]);

  useEffect(() => {
    if (!session || Platform.OS === 'web' || !Device.isDevice) return;

    let cancelled = false;

    async function register() {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted' || cancelled) return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

        if (cancelled) return;

        const { error } = await supabase.rpc('register_push_token', { p_token: token });
        if (error) {
          console.warn('register_push_token failed', error);
        }
      } catch (err) {
        console.warn('Push notification registration failed', err);
      }
    }

    register();
    return () => {
      cancelled = true;
    };
  }, [session]);
}
