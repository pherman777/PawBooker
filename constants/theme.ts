export const Colors = {
  light: {
    text: '#2B332C',
    textMuted: '#6F766A',
    background: '#F7F8F3',
    surface: '#EBEDE2',
    border: '#DADECB',
    tint: '#6B8F72',
    secondary: '#BB7360',
    tabIconDefault: '#9CA391',
    tabIconSelected: '#6B8F72',
    success: '#4F8A5B',
    warning: '#BB7360',
    danger: '#B14B3E',
  },
} as const;

export type ThemeColors = typeof Colors.light;
