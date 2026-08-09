import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { StripeRoot } from '@/components/StripeRoot';
import { Colors } from '@/constants/theme';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { AuthProvider, useAuth } from '@/services/auth-context';
import { supabase } from '@/services/supabase';

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { session, groomerProfile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  usePushNotifications(session, Boolean(groomerProfile));

  useEffect(() => {
    if (loading) return;

    const segment = segments[0];

    if (!session) {
      // groomer-signup is reachable while logged out (it guides them to create
      // an account first) and while logged in (from the customer Profile tab),
      // so it lives outside the (auth) group and is allowed in both states.
      if (segment !== '(auth)' && (segment as string) !== 'groomer-signup') {
        router.replace('/(auth)/sign-in');
      }
      return;
    }

    if (groomerProfile) {
      if (
        segment !== '(salon)' &&
        segment !== 'chat' &&
        segment !== 'help' &&
        segment !== 'contact-support'
      ) {
        router.replace('/(salon)');
      }
      return;
    }

    if (segment === '(auth)' || segment === '(salon)') {
      // Send them straight to Profile instead of the home tab if they have a
      // declined charge to resolve, so it isn't easy to miss after logging in.
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', session.user.id)
        .eq('payment_status', 'failed')
        .then(({ count }) => {
          router.replace(count && count > 0 ? '/(tabs)/profile' : '/(tabs)');
        });
    }
  }, [session, groomerProfile, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.light.tint} />
      </View>
    );
  }

  return <>{children}</>;
}

function HomeHeaderButton() {
  const router = useRouter();
  const { groomerProfile } = useAuth();
  return (
    <Pressable
      onPress={() => router.push(groomerProfile ? '/(salon)' : '/(tabs)')}
      hitSlop={10}
      style={{ paddingHorizontal: 4 }}>
      <Ionicons name="home" size={22} color={Colors.light.tint} />
    </Pressable>
  );
}

function HeaderBrand({ title }: { title?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Logo size={22} tile={false} />
      {title ? (
        <Text style={{ fontSize: 17, fontWeight: '600', color: Colors.light.text }}>{title}</Text>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StripeRoot>
        <AuthProvider>
          <RouteGuard>
            <Stack screenOptions={{ headerShown: false, headerBackButtonDisplayMode: 'minimal' }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(salon)" />
              <Stack.Screen name="groomer-signup" />
              <Stack.Screen
                name="groomer/[id]"
                options={{
                  headerShown: true,
                  headerTitle: () => <HeaderBrand />,
                  headerRight: () => <HomeHeaderButton />,
                }}
              />
              <Stack.Screen
                name="booking/[groomerId]"
                options={{
                  headerShown: true,
                  headerTitle: () => <HeaderBrand title="Book" />,
                  headerRight: () => <HomeHeaderButton />,
                }}
              />
              <Stack.Screen
                name="pet/new"
                options={{
                  headerShown: true,
                  headerTitle: () => <HeaderBrand title="Add pet" />,
                  headerRight: () => <HomeHeaderButton />,
                }}
              />
              <Stack.Screen
                name="pet/[id]"
                options={{
                  headerShown: true,
                  headerTitle: () => <HeaderBrand />,
                  headerRight: () => <HomeHeaderButton />,
                }}
              />
              <Stack.Screen
                name="chat/[threadId]"
                options={{
                  headerShown: true,
                  headerTitle: () => <HeaderBrand title="Chat" />,
                  headerRight: () => <HomeHeaderButton />,
                }}
              />
              <Stack.Screen
                name="help"
                options={{
                  headerShown: true,
                  headerTitle: () => <HeaderBrand title="Help" />,
                  headerRight: () => <HomeHeaderButton />,
                }}
              />
              <Stack.Screen
                name="contact-support"
                options={{
                  headerShown: true,
                  headerTitle: () => <HeaderBrand title="Contact us" />,
                  headerRight: () => <HomeHeaderButton />,
                }}
              />
            </Stack>
          </RouteGuard>
        </AuthProvider>
        <StatusBar style="auto" />
      </StripeRoot>
    </SafeAreaProvider>
  );
}
