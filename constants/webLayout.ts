import { Platform, type ViewStyle } from 'react-native';

// Matches public/styles/site.css's own split: `.wrap` (1080px) for regular
// content, `.page` (680px) for narrow text/form pages - plus a wider mode
// for data-dense screens the marketing site doesn't have (dashboards,
// tables). Native is unaffected (full-bleed device width, as before).
export const CONTENT_WIDTH = {
  form: 680,
  content: 1080,
  dashboard: 1440,
} as const;

export type ContentWidthMode = keyof typeof CONTENT_WIDTH;

export function webContentWidth(mode: ContentWidthMode): ViewStyle | null {
  if (Platform.OS !== 'web') return null;
  return { width: '100%', maxWidth: CONTENT_WIDTH[mode], alignSelf: 'center' };
}
