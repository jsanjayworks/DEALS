/**
 * YOLO Deals design tokens — PRD section 28 palette.
 * Teal guides attention; orange, terracotta and lemon are accents used sparingly.
 */

export const color = {
  // Brand
  deepAqua: '#006D77',
  deepTeal: '#137C78',
  turquoise: '#33B3B2',

  // Surfaces
  seafoam: '#83C5BE',
  lightAqua: '#8AD0CE',
  paleIce: '#EDF6F9',
  white: '#FFFFFF',

  // Accents
  warmOrange: '#F4A261',
  citrusOrange: '#F79621',
  terracotta: '#E76F51',
  coral: '#E36849',
  lemonGlow: '#FFBE2F',

  // Text
  text: '#0F2A2E',
  textSecondary: '#4A6468',
  textDisabled: '#9AAFB2',
  divider: '#D6E6EA',

  // Status
  statusActive: '#1C8C5A',
  statusActiveBg: '#E3F5EC',
  statusPending: '#B8860B',
  statusPendingBg: '#FDF3DC',
  statusRejected: '#C0392B',
  statusRejectedBg: '#FDECEA',
  statusInfo: '#2B6CB0',
  statusInfoBg: '#E8F1FB',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Inter type scale from the design prompt. */
export const type = {
  display: { fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 40 },
  h1: { fontFamily: 'Inter_600SemiBold', fontSize: 24, lineHeight: 32 },
  h2: { fontFamily: 'Inter_600SemiBold', fontSize: 20, lineHeight: 28 },
  h3: { fontFamily: 'Inter_600SemiBold', fontSize: 17, lineHeight: 24 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  captionMedium: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18 },
  overline: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  price: { fontFamily: 'Inter_700Bold', fontSize: 20, lineHeight: 28, fontVariant: ['tabular-nums' as const] },
} as const;

export const shadow = {
  card: {
    shadowColor: '#0F2A2E',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sheet: {
    shadowColor: '#0F2A2E',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} as const;

/** Formats paise-free INR the way Indian pricing reads: ₹38,000 not ₹38,000.00 */
export function inr(amount: number): string {
  return '\u20B9' + Math.round(amount).toLocaleString('en-IN');
}
