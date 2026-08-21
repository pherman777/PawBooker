import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

// The app-wide default status bar style is 'dark' (constants/theme.ts's light,
// headerless `background`). Screens with a dark `band` header - the ones that
// opt into `headerShown: true` in app/_layout.tsx - need white status bar text
// instead, or it's unreadable against the dark bar. Call this at the top of
// those screens only (before any early returns, per rules of hooks).
export function useLightStatusBar() {
  useEffect(() => {
    StatusBar.setStyle('light');
    return () => StatusBar.setStyle('dark');
  }, []);
}
