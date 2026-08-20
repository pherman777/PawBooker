// "Hybrid" — dark chrome (nav bars, primary buttons) paired with light warm
// content surfaces, matching the redesigned dashboard (dashboard/app/
// globals.css) and marketing site. Evolved from "Warm Stone" (the previous
// all-dark theme): same sage/clay brand identity, but dark stayed too heavy
// for a public-facing product — these are the dashboard's own validated hex
// values, reused as-is rather than re-derived, so every surface stays
// pixel-consistent across web and native.
// Kept under the `light` key (rather than renamed) so the ~60 files already
// importing `Colors.light.*` don't need touching.
const hybrid = {
  text: '#2B332C',
  textMuted: '#6B7264',
  background: '#EAE7DB',
  // Full-bleed nav-bar/chrome background - the one place that stays dark.
  // Same hex on both platforms; only `background`/`surface`/`text` flipped
  // from dark to light in this revision.
  band: '#24281F',
  surface: '#FBFAF4',
  // Elevated cards sitting on top of `surface`.
  surfaceElevated: '#F1EFE4',
  border: '#DCDFD0',
  tint: '#6B8F72',
  secondary: '#BB7360',
  tabIconDefault: '#B7BAA9',
  tabIconSelected: '#6B8F72',
  success: '#4F8A5B',
  warning: '#B9852E',
  danger: '#B14B3E',
  // Text/borders drawn *on* `band` - `text`/`textMuted`/`border` are now the
  // light-surface (dark-on-light) values, so anything rendered directly on
  // the dark band (nav bars, filled dark chrome) needs these instead, or it
  // reads as illegible dark-on-dark.
  bandText: '#F3F2EA',
  bandTextMuted: '#B7BAA9',
  bandBorder: '#3C4136',
};

export const Colors = {
  light: hybrid,
} as const;

export type ThemeColors = typeof Colors.light;
