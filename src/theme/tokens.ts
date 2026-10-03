/**
 * YOLO Deals design tokens.
 *
 * One colour family per theme. A theme sets the page, the hero at the top of
 * Home and the category pages, the category tiles, the display face for
 * headings, and a single accent. The accent goes on the one thing a screen
 * exists for (Claim, Book) and on money saved; everything structural is ink or
 * the hero's own colour. Photography carries the rest.
 *
 * In development builds on web, ?theme=forest in the URL previews any theme
 * without editing this file.
 */

export interface Theme {
  /** Primary call-to-action fill, the deal count, "You save". */
  accent: string;
  /** Type and icons on an accent fill. */
  onAccent: string;
  /** Selected chips, the active tab pill, primary buttons. */
  selected: string;
  page: string;
  /** Inset fills below the hero: applied-filter chips, panels, skeletons. */
  inset: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** The top of Home and of category pages. Two or more stops, top to bottom. */
  hero: { colors: readonly [string, string, ...string[]]; text: string; muted: string; light: boolean };
  /** The radius selector and subheading chips on the hero. */
  heroChip: { track: string; thumb: string; onThumb: string; text: string; border: string };
  heroSearch: { bg: string; text: string; hint: string; icon: string; border: string };
  tile: { bg: string; border: string; icon: string; label: string; count: string; onCount: string };
  countPill: { bg: string; text: string };
  /** Heading face: greetings, page titles, section titles. */
  display: string;
  /** Optional sheen for accent fills (the primary button), top-left to bottom-right. */
  accentGradient?: readonly [string, string, ...string[]];
  /** The accent as text on the page, when the fill colour is too light to read. */
  accentText?: string;
  /** Type and icons on a `selected` fill (the active tab, chips). Default white. */
  onSelected?: string;
  /** Primary buttons: 12 for soft corners, 999 for pills. */
  buttonRadius?: number;
}

export const THEMES = {
  /**
   * Premium: navy for structure and selection, gold for the one action and
   * the saving, on a cool paper grey. Gold fills carry navy type; gold as text
   * uses a deeper shade so it stays readable.
   */
  premium: {
    accent: '#D6A93A',
    onAccent: '#0E2240',
    accentGradient: ['#F0D27A', '#D6A93A', '#B88A1E'],
    accentText: '#8A6508',
    selected: '#16325C',
    onSelected: '#E2BE5A',
    buttonRadius: 999,
    page: '#F4F5F8',
    inset: '#EBEEF4',
    border: '#E2E6EE',
    text: '#0F1B2D',
    textSecondary: '#4A5568',
    textMuted: '#646D7E',
    hero: { colors: ['#2A4C84', '#16325C', '#0B1D38'], text: '#FFFFFF', muted: 'rgba(255,255,255,0.74)', light: false },
    heroChip: {
      track: 'rgba(255,255,255,0.12)',
      thumb: '#E2BE5A',
      onThumb: '#0E2240',
      text: 'rgba(255,255,255,0.86)',
      border: 'rgba(255,255,255,0.14)',
    },
    heroSearch: { bg: '#FFFFFF', text: '#0F1B2D', hint: '#646D7E', icon: '#16325C', border: '#E2E6EE' },
    tile: { bg: '#FFFFFF', border: '#E2E6EE', icon: '#16325C', label: '#0F1B2D', count: '#16325C', onCount: '#E2BE5A' },
    countPill: { bg: '#16325C', text: '#E2BE5A' },
    display: 'BricolageGrotesque_700Bold',
  },
  /** Warm cream paper, a serif with character, burnt orange. */
  editorial: {
    accent: '#C2410C',
    onAccent: '#FFFFFF',
    selected: '#7C2D12',
    page: '#F7F2EA',
    inset: '#EEE7DC',
    border: '#E6DDD0',
    text: '#1B1714',
    textSecondary: '#5C534C',
    textMuted: '#7A6F66',
    hero: { colors: ['#F7F2EA', '#F7F2EA'], text: '#1B1714', muted: '#7A6F66', light: true },
    heroChip: { track: '#EEE7DC', thumb: '#7C2D12', onThumb: '#FFFFFF', text: '#5C534C', border: '#E6DDD0' },
    heroSearch: { bg: '#FFFFFF', text: '#1B1714', hint: '#7A6F66', icon: '#C2410C', border: '#E6DDD0' },
    tile: { bg: '#FFFFFF', border: '#ECE4D8', icon: '#C2410C', label: '#1B1714', count: '#7C2D12', onCount: '#FFFFFF' },
    countPill: { bg: '#C2410C', text: '#FFFFFF' },
    display: 'Fraunces_600SemiBold',
  },
  /** A warm coral-to-amber hero, white type, deep rust for actions. */
  sunset: {
    accent: '#C2410C',
    onAccent: '#FFFFFF',
    selected: '#9A3412',
    page: '#FFF8F3',
    inset: '#FDEDE3',
    border: '#F6E2D6',
    text: '#2A1710',
    textSecondary: '#6B4A3D',
    textMuted: '#8A6A5D',
    hero: { colors: ['#E0461E', '#F05A2A', '#F9743A'], text: '#FFFFFF', muted: 'rgba(255,255,255,0.82)', light: false },
    heroChip: {
      track: 'rgba(255,255,255,0.2)',
      thumb: '#FFFFFF',
      onThumb: '#C2410C',
      text: '#FFFFFF',
      border: 'rgba(255,255,255,0.24)',
    },
    heroSearch: { bg: '#FFFFFF', text: '#2A1710', hint: '#8A6A5D', icon: '#C2410C', border: 'transparent' },
    tile: {
      bg: 'rgba(255,255,255,0.18)',
      border: 'rgba(255,255,255,0.26)',
      icon: '#FFFFFF',
      label: '#FFFFFF',
      count: '#FFFFFF',
      onCount: '#C2410C',
    },
    countPill: { bg: '#FFFFFF', text: '#C2410C' },
    display: 'BricolageGrotesque_700Bold',
  },
  /** Deep green to emerald, one hue, a fresh mint page. */
  forest: {
    accent: '#0F7A55',
    onAccent: '#FFFFFF',
    selected: '#0E4D38',
    page: '#F4F9F6',
    inset: '#E3F1EA',
    border: '#DCEBE3',
    text: '#0F2019',
    textSecondary: '#46594F',
    textMuted: '#62766B',
    hero: { colors: ['#0E4D38', '#16805C'], text: '#FFFFFF', muted: 'rgba(255,255,255,0.75)', light: false },
    heroChip: {
      track: 'rgba(255,255,255,0.14)',
      thumb: '#FFFFFF',
      onThumb: '#0E4D38',
      text: '#FFFFFF',
      border: 'rgba(255,255,255,0.18)',
    },
    heroSearch: { bg: '#FFFFFF', text: '#0F2019', hint: '#62766B', icon: '#0F7A55', border: 'transparent' },
    tile: {
      bg: 'rgba(255,255,255,0.12)',
      border: 'rgba(255,255,255,0.16)',
      icon: '#FFFFFF',
      label: '#FFFFFF',
      count: '#FFFFFF',
      onCount: '#0E4D38',
    },
    countPill: { bg: '#FFFFFF', text: '#0E4D38' },
    display: 'BricolageGrotesque_700Bold',
  },
  /** One hue, cobalt, from a deep hero to the button. */
  ocean: {
    accent: '#2B4FE0',
    onAccent: '#FFFFFF',
    selected: '#1B2C6B',
    page: '#F5F7FC',
    inset: '#E9EEFA',
    border: '#E1E7F5',
    text: '#0F1630',
    textSecondary: '#4D5675',
    textMuted: '#6B7391',
    hero: { colors: ['#14256B', '#2B4FE0'], text: '#FFFFFF', muted: 'rgba(255,255,255,0.72)', light: false },
    heroChip: {
      track: 'rgba(255,255,255,0.14)',
      thumb: '#FFFFFF',
      onThumb: '#14256B',
      text: '#FFFFFF',
      border: 'rgba(255,255,255,0.18)',
    },
    heroSearch: { bg: '#FFFFFF', text: '#0F1630', hint: '#6B7391', icon: '#2B4FE0', border: 'transparent' },
    tile: {
      bg: 'rgba(255,255,255,0.12)',
      border: 'rgba(255,255,255,0.16)',
      icon: '#FFFFFF',
      label: '#FFFFFF',
      count: '#FFFFFF',
      onCount: '#14256B',
    },
    countPill: { bg: '#FFFFFF', text: '#14256B' },
    display: 'BricolageGrotesque_700Bold',
  },
  /** White, with a soft rose-to-peach glow at the top. */
  glow: {
    accent: '#E11D48',
    onAccent: '#FFFFFF',
    selected: '#9F1239',
    page: '#FFFFFF',
    inset: '#F5F3F4',
    border: '#EFE9EB',
    text: '#24161B',
    textSecondary: '#525252',
    textMuted: '#737373',
    hero: { colors: ['#FFD9E2', '#FFEDE4', '#FFFFFF'], text: '#24161B', muted: '#6B5A5F', light: true },
    heroChip: {
      track: 'rgba(255,255,255,0.75)',
      thumb: '#9F1239',
      onThumb: '#FFFFFF',
      text: '#525252',
      border: 'rgba(0,0,0,0.06)',
    },
    heroSearch: { bg: '#FFFFFF', text: '#24161B', hint: '#737373', icon: '#E11D48', border: 'rgba(0,0,0,0.04)' },
    tile: {
      bg: 'rgba(255,255,255,0.85)',
      border: 'rgba(225,29,72,0.10)',
      icon: '#E11D48',
      label: '#24161B',
      count: '#9F1239',
      onCount: '#FFFFFF',
    },
    countPill: { bg: '#E11D48', text: '#FFFFFF' },
    display: 'BricolageGrotesque_700Bold',
  },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

/** The one line to change to re-theme the app. */
export const ACTIVE_THEME: ThemeName = 'premium';

/** Dev-only web preview: ?theme=… on the URL that opens the app. */
function preview<T extends string>(key: string, allowed: Record<T, unknown>): T | null {
  if (!__DEV__) return null;
  const search = (globalThis as { location?: { search?: string } }).location?.search;
  if (!search) return null;
  const v = new URLSearchParams(search).get(key);
  return v && v in allowed ? (v as T) : null;
}

export const theme: Theme = THEMES[preview('theme', THEMES) ?? ACTIVE_THEME];

export const color = {
  /** Selected and structural fills: active chips, the tab pill, primary buttons. */
  brand: theme.selected,
  /** Headings that need the last bit of weight; the verified tick. */
  brandStrong: theme.text,
  /** Dashed upload borders, soft edges, disabled tracks. */
  surfaceSoft: theme.border,
  /** Inset fills: applied-filter chips, panels, skeletons. */
  surfaceSoftAlt: theme.inset,
  background: theme.page,
  text: theme.text,
  textSecondary: theme.textSecondary,
  textMuted: theme.textMuted,
  border: theme.border,
  /** The accent: primary call-to-action fills, money saved. */
  cta: theme.accent,
  /** Type and icons on a `cta` fill. */
  onCta: theme.onAccent,
  /** The accent as readable text on the page: savings, highlights. */
  accentText: theme.accentText ?? theme.accent,
  /** On a `brand` (selected) fill. */
  onBrand: theme.onSelected ?? '#FFFFFF',
  /** A soft accent tint for highlight tiles. */
  accentSoft: alphaHex(theme.accent, 0.16),
  /** Links and search hints. */
  interactive: theme.accent,
  /** A whisper of the accent for selected rows and savings panels. */
  deal: alphaHex(theme.accent, 0.08),
  surface: '#FFFFFF',
  star: theme.text,
  /** Errors, destructive actions, sold-out and ending warnings. */
  alert: '#D92D20',
  /** Notification dot. */
  alertSoft: '#D92D20',
  white: '#FFFFFF',
  black: '#000000',
} as const;

function alphaHex(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * a);
  const to = (c: number) => mix(c).toString(16).padStart(2, '0');
  return '#' + to((n >> 16) & 255) + to((n >> 8) & 255) + to(n & 255);
}

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
  neutral: { fg: '#525252', bg: '#F3F3F3' },
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
  /** The theme's heading face. */
  display: theme.display,
} as const;

export const type = {
  display: { fontFamily: font.display, fontSize: 32, lineHeight: 40, letterSpacing: -0.6 },
  h1: { fontFamily: font.display, fontSize: 24, lineHeight: 32, letterSpacing: -0.3 },
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

/** "r,g,b" for a #RRGGBB token, for building rgba() strings inside worklets. */
export function rgbOf(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
}

/**
 * A palette colour at an opacity. Every translucent surface (glass, scrims,
 * hover washes) goes through this, so changing a token re-tints all of them.
 */
export function alpha(hex: string, a: number): string {
  return 'rgba(' + rgbOf(hex) + ',' + a + ')';
}

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

/**
 * Chart series colours, in fixed order and independent of the brand palette, so
 * charts read the same whichever palette is active. The first three slots of the
 * dataviz reference order, checked with its validator on all pairs (light
 * surface): lightness, chroma, CVD ΔE 9.2 worst pair, normal-vision ΔE 24.0.
 * Aqua sits under 3:1 against white, so every chart that uses it must print its
 * values as text beside the marks.
 */
export const chart = {
  series1: '#2A78D6',
  series2: '#EB6834',
  series3: '#1BAF7A',
  /** Single-series bars, where identity is not in question. */
  single: color.brand,
  track: color.border,
} as const;
