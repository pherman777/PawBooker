import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActionSheetHost } from '@/components/ActionSheetHost';
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
      // groomer-signup guides a logged-out visitor through creating a groomer
      // account, so it lives outside the (auth) group and is allowed here too.
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

// On web, RN's mobile-first flex layouts stretch edge-to-edge on a wide
// browser window (500px-wide text inputs, etc.). Native (iOS/Android) is
// untouched — this only kicks in for the web build.
//
// The page itself scrolls (html/body), not a wrapping div. That's forced on
// us: react-navigation's Stack renders each screen with `position: absolute`
// so it can layer/animate screens, which means an overflowing screen's
// content never grows any ordinary ancestor <div>'s scrollHeight - only the
// real browser viewport (html/body) picks up content that visually overflows
// that way, so it's the only element that can actually own this scroll.
// (Tried moving scroll onto a plain div for a themed, always-visible
// scrollbar - `::-webkit-scrollbar` can't be forced onto html/body at all in
// Chrome or Safari, so it's a lost cause there too - and it broke scrolling
// entirely: the div's scrollHeight stayed equal to its clientHeight no
// matter how much on-screen content there was, because none of it was
// counted through the Stack's absolutely-positioned screen container.)
//
// `flex: 1` alone doesn't reliably reach all the way down to screens like
// (salon)'s FlatList through several third-party provider wrappers
// (KeyboardProvider, SafeAreaProvider) on web - it was leaving the box
// shorter than the actual window, with dead space below it. Measuring the
// real window height and setting it explicitly sidesteps that propagation
// question entirely.
//
// minHeight (not height): the shell should be AT LEAST the full viewport
// tall (so the dark background always fills the screen even with little
// content) but must be able to grow taller when content needs more room -
// that's what lets the real page scroll instead of trapping scroll inside
// whatever list happens to be on screen. See scripts/deploy-groomer-web.sh
// for the matching index.html patch (Expo's default web reset pins
// html/body/#root to a hard 100% height and disables body scroll, which
// fights this) and (salon)/index.tsx's FlatList, which forces
// `overflow: visible` on web so it never tries to own its own scroll and
// fight this one.
function useWebPageScroll() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const html = document.documentElement;
    const { body } = document;
    const root = document.getElementById('root');
    const prev = {
      htmlHeight: html.style.height,
      htmlMinHeight: html.style.minHeight,
      htmlBackground: html.style.backgroundColor,
      bodyHeight: body.style.height,
      bodyMinHeight: body.style.minHeight,
      bodyOverflowY: body.style.overflowY,
      bodyBackground: body.style.backgroundColor,
      rootHeight: root?.style.height,
      rootMinHeight: root?.style.minHeight,
    };
    html.style.height = 'auto';
    html.style.minHeight = '100%';
    html.style.backgroundColor = Colors.light.background;
    body.style.height = 'auto';
    body.style.minHeight = '100%';
    body.style.overflowY = 'auto';
    // Every screen's own dark background only ever covers one viewport's
    // worth of height: on web, React Navigation's Stack wraps each screen's
    // content in a `position: absolute` box, and an absolutely-positioned
    // box doesn't grow taller than its containing block just because its
    // content does (same reason a plain div can't own page scroll here -
    // see the WebShell comment below). So on a screen taller than one
    // screenful, every component's own background stops at the fold and the
    // page shows raw white past that point. Painting the background on body
    // itself sidesteps the whole problem - it always covers the full
    // scrollable page no matter how any component's box is sized.
    body.style.backgroundColor = Colors.light.background;
    if (root) {
      root.style.height = 'auto';
      root.style.minHeight = '100%';
    }

    return () => {
      html.style.height = prev.htmlHeight;
      html.style.minHeight = prev.htmlMinHeight;
      html.style.backgroundColor = prev.htmlBackground;
      body.style.height = prev.bodyHeight;
      body.style.minHeight = prev.bodyMinHeight;
      body.style.overflowY = prev.bodyOverflowY;
      body.style.backgroundColor = prev.bodyBackground;
      if (root) {
        root.style.height = prev.rootHeight ?? '';
        root.style.minHeight = prev.rootMinHeight ?? '';
      }
    };
  }, []);
}

function WebShell({ children }: { children: React.ReactNode }) {
  const { height } = useWindowDimensions();
  useWebPageScroll();
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={[webShellStyles.outer, { minHeight: height }]}>
      <View style={webShellStyles.inner}>{children}</View>
      <ActionSheetHost />
    </View>
  );
}

const webShellStyles = StyleSheet.create({
  // The canvas itself (background) stays full browser width - no visible
  // box or border. The content column used to be capped here at a single
  // hardcoded maxWidth for every screen; that's gone now - each screen picks
  // its own width via constants/webLayout.ts's webContentWidth(), the same
  // way a real website varies a dashboard's width from a form's.
  outer: {
    alignItems: 'center',
    backgroundColor: Colors.light.background,
  },
  inner: {
    flex: 1,
    width: '100%',
    backgroundColor: Colors.light.background,
  },
});

function HeaderBrand({ title }: { title?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Logo size={22} tile={false} />
      {title ? (
        <Text style={{ fontSize: 17, fontWeight: '600', color: Colors.light.bandText }}>{title}</Text>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <KeyboardProvider>
      <SafeAreaProvider>
        <StripeRoot>
          <AuthProvider>
            <RouteGuard>
              <WebShell>
              <Stack
                screenOptions={{
                  headerShown: false,
                  headerBackButtonDisplayMode: 'minimal',
                  // The 8 screens below that opt into headerShown:true were
                  // otherwise falling through to React Navigation's
                  // unthemed default chrome - a real, live bug, since
                  // RouteGuard already lets a logged-in groomer reach
                  // chat/help/contact-support.
                  headerStyle: { backgroundColor: Colors.light.band },
                  headerTintColor: Colors.light.bandText,
                  headerTitleStyle: { color: Colors.light.bandText },
                  headerShadowVisible: false,
                }}>
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
                  name="account"
                  options={{
                    headerShown: true,
                    headerTitle: () => <HeaderBrand title="Account" />,
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
              </WebShell>
            </RouteGuard>
          </AuthProvider>
          <StatusBar style="dark" />
        </StripeRoot>
      </SafeAreaProvider>
    </KeyboardProvider>
  );
}
