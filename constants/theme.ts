// "Warm Stone" — a warmer, more contrasted revision of the original
// black-and-green palette. Diverges from the marketing site's still-original
// colors on purpose (public/styles/site.css is unchanged) — follow-up work
// should bring the marketing site to match so the two don't drift apart.
// Kept under the `light` key (rather than renamed) so the ~60 files already
// importing `Colors.light.*` don't need touching.
const stone = {
  text: '#F2F1E9',
  textMuted: '#C2C4B4',
  background: '#2C302A',
  // Full-bleed section/nav-bar background, one step darker than `background`
  // — the marketing site's layered ground -> band -> surface -> surface-2
  // depth, which the app didn't have before.
  band: '#24281F',
  surface: '#363A31',
  // Elevated cards sitting on top of `surface` (marketing's "surface-2").
  surfaceElevated: '#40453A',
  border: '#52584A',
  tint: '#9CC2A0',
  secondary: '#D89C87',
  tabIconDefault: '#C2C4B4',
  tabIconSelected: '#9CC2A0',
  // success/warning/danger used to double up with tint/secondary (warning
  // was literally the same hex as secondary) - now distinct hues so state
  // colors never get confused with the brand accent.
  success: '#7FB86B',
  warning: '#D9A75A',
  danger: '#E2685A',
};

export const Colors = {
  light: stone,
} as const;

export type ThemeColors = typeof Colors.light;
