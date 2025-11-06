/**
 * Design Tokens - WarFaire Design System
 * Presentational styling constants
 */

export const tokens = {
  typography: {
    title: { size: 20, lineHeight: 24 },
    body: { size: 14, lineHeight: 20 },
    caption: { size: 12, lineHeight: 16 }
  },
  spacing: {
    xs: 8,
    sm: 16,
    md: 24
  },
  radius: 8,
  stroke: 1,
  icons: {
    size: 24,
    stroke: 2,
    smallSize: 16
  }
} as const;
