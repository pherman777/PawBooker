import { Platform, type ViewStyle } from 'react-native';

// The whole page scrolls on web (html/body — see useWebPageScroll in
// app/_layout.tsx), not any individual screen's ScrollView/FlatList. But
// react-native-web gives ScrollView/FlatList's own container `overflow:
// hidden` by default, which traps/clips their content in a fixed-height box
// instead of letting it flow into the page. Spread this into a
// ScrollView/FlatList's `style` array (never `contentContainerStyle`, and
// never the `scrollEnabled` prop — react-native-web appends its own
// `overflow: hidden` AFTER any style you pass, so `scrollEnabled={false}`
// silently loses to it) to stop that clipping. Plain `View`+`.map()` screens
// don't need this — a View has no scroll container of its own to trap
// anything in.
export const webFlushScroll: ViewStyle | null =
  Platform.OS === 'web' ? ({ overflow: 'visible' } as const) : null;
