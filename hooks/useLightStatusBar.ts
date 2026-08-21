import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';

// The app-wide default status bar style is 'dark' (constants/theme.ts's light,
// headerless `background`). Screens with a dark `band` header - the ones that
// opt into `headerShown: true` in app/_layout.tsx - need white status bar text
// instead, or it's unreadable against the dark bar. Call this at the top of
// those screens only (before any early returns, per rules of hooks).
//
// This has to be focus-based, not mount/unmount: native-stack keeps pushed
// screens mounted underneath whatever's on top (for the back-swipe gesture),
// so a plain useEffect's cleanup never runs when you navigate forward to
// another screen - only when this screen is actually popped. That left the
// light style stuck on every screen visited after this one until you came
// back and left again. useFocusEffect's cleanup runs on blur (losing focus),
// which fires on forward navigation too.
export function useLightStatusBar() {
  useFocusEffect(
    useCallback(() => {
      StatusBar.setStyle('light');
      return () => StatusBar.setStyle('dark');
    }, [])
  );
}
