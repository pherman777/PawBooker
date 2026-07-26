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

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { session, groomerProfile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  usePushNotifications(session);

  useEffect(() => {
    if (loading) return;

    const segment = segments[0];

    if (!session) {
      if (segment !== '(auth)') router.replace('/(auth)/sign-in');
      return;
    }

    if (groomerProfile) {
      if (segment !== '(salon)') router.replace('/(salon)');
      return;
    }

    if (segment === '(auth)' || segment === '(salon)') {
      router.replace('/(tabs)');
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
  return (
    <Pressable
      onPress={() => router.push('/(tabs)')}
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
            </Stack>
          </RouteGuard>
        </AuthProvider>
        <StatusBar style="auto" />
      </StripeRoot>
    </SafeAreaProvider>
  );
}
