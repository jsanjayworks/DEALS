/**
 * YOLO Deals design tokens.
 *
 * Source of truth: docs/design/figma-make/index.css (Tailwind v4 @theme block).
 *
 * A naming warning, because it will bite anyone comparing the two files: the
 * Figma Make tokens kept their original teal-era NAMES while the VALUES were
 * changed to plum, lilac and lime. `--color-aqua` is plum. `--color-citrus` is
 * lime. `--color-seafoam` is lilac. Nothing there is aqua, citrus or seafoam
 * any more.
 *
 * So the names below are semantic, and each carries the Make variable it maps
 * to. Change a value here only when index.css changes.
 */

export const color = {
  /** --color-aqua · primary actions, active tabs, links */
  brand: '#4B1D6B',
  /** --color-teal · merchant headers, headings, the verified check */
  brandStrong: '#3A1454',
  /** --color-turq · focus rings, AI and search accents, the New badge */
  interactive: '#8B5CF6',

  /** --color-seafoam · dashed upload borders, soft edges */
  surfaceSoft: '#D9C8F0',
  /** --color-lightaqua · secondary highlights, text selection */
  surfaceSoftAlt: '#E6D9F7',
  /** --color-ice · app background, inset panels, pressed states */
  background: '#F7F3FA',
  surface: '#FFFFFF',

  /** --color-citrus · the strong CTA fill. Pairs with brandStrong text. */
  cta: '#C8EB2A',
  /** --color-lemon · discount badges only */
  deal: '#D4F23F',
  /** --color-warm · rating stars */
  star: '#FF9F68',
  /** --color-terra · alerts, Ending Soon, capacity warnings, destructive */
  alert: '#E8445A',
  /** --color-coral · Flash Deal badge, notification dot */
  alertSoft: '#F0506E',

  /** --color-ink */
  text: '#1E1028',
  /** --color-ink2 */
  textSecondary: '#5E4E6B',
  /** --color-ink3 */
  textMuted: '#A89BB3',
  /** --color-line */
  border: '#E9E0F0',

  white: '#FFFFFF',
  black: '#000000',
} as const;

/**
 * Status colours. The Make file reaches for Tailwind's built-in emerald, amber,
 * sky and red scales here rather than the brand palette, so the exact values
 * are pinned below — Tailwind's palette is not available in React Native.
 */
export const status = {
  active: { fg: '#047857', bg: '#ECFDF5' }, // emerald-700 on emerald-50
  pending: { fg: '#B45309', bg: '#FFFBEB' }, // amber-700  on amber-50
  info: { fg: '#0369A1', bg: '#F0F9FF' }, // sky-700    on sky-50
  danger: { fg: '#B91C1C', bg: '#FEF2F2' }, // red-700    on red-50
  neutral: { fg: '#5E4E6B', bg: '#F7F3FA' }, // ink2       on ice
} as const;

export type StatusTone = keyof typeof status;

/** 8pt grid. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 6, // rounded-md  — badges
  md: 8, // rounded-lg  — small controls
  lg: 12, // rounded-xl  — buttons, inputs
  xl: 16, // rounded-2xl — cards, panels
  xxl: 24, // rounded-3xl — bottom sheets
  pill: 999,
} as const;

/**
 * Inter, matching the Make scale. Weights map to the loaded @expo-google-fonts
 * families; React Native will not synthesise a weight from a single face, so
 * each one must be a real family name.
 */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: font.bold, fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
  h1: { fontFamily: font.semibold, fontSize: 24, lineHeight: 32, letterSpacing: -0.3 },
  h2: { fontFamily: font.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  h3: { fontFamily: font.semibold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  bodySemibold: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  captionMedium: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  smallMedium: { fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
  tiny: { fontFamily: font.semibold, fontSize: 11, lineHeight: 15 },
  overline: {
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.88, // .08em at 11px
    textTransform: 'uppercase' as const,
  },
} as const;

/** Control heights, from the Make component classes. */
export const size = {
  button: 52,
  buttonSmall: 40,
  input: 48,
  chip: 36,
  tabBar: 68,
  header: 56,
  touchTarget: 44, // iOS minimum; Android is 48dp
} as const;

/**
 * Card shadow. The Make value is 0 1px 2px rgba(30,16,40,.05) — far lighter
 * than React Native's defaults, and elevation on Android needs a matching
 * nudge rather than the shadow* props, which Android ignores.
 */
export const shadow = {
  card: {
    shadowColor: color.text,
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  raised: {
    shadowColor: color.text,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sheet: {
    shadowColor: color.text,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  fab: {
    shadowColor: color.brandStrong,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;

/** Durations from the Make keyframes. */
export const motion = {
  fade: 300,
  sheet: 320,
  pop: 500,
} as const;

/**
 * Indian price formatting: lakh grouping, no decimals.
 * ₹38,000 rather than ₹38,000.00 or ₹38.0K.
 */
export function inr(amount: number): string {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

/** Discount percentage for the badge, matching the Make pct() helper. */
export function discountPct(was: number, now: number): number {
  if (!was || was <= 0) return 0;
  return Math.max(0, Math.round((1 - now / was) * 100));
}

/** Distance as it reads on a card: 800 m under a kilometre, else 1.4 km. */
export function distanceLabel(km: number): string {
  if (km < 1) return Math.round(km * 1000) + ' m';
  return km.toFixed(1) + ' km';
}
