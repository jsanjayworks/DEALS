/**
 * What the voice assistant understands, as plain data. The same shapes come
 * back from Claude (src/app/api/assist+api.ts) and from the built-in rules
 * (rules.ts), so the screens never care which one answered.
 */

export type VoiceLang = 'en-IN' | 'hi-IN' | 'kn-IN';

export const VOICE_LANGS: { code: VoiceLang; label: string }[] = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिंदी' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
];

/** Screens a spoken "show my …" can open. */
export const SCREENS = [
  'home',
  'search',
  'my_deals',
  'saved',
  'notifications',
  'profile',
  'help',
  'order_history',
  'vehicle',
  'merchant_dashboard',
  'merchant_bookings',
  'merchant_redeem',
  'merchant_new_deal',
  'merchant_deals',
  'merchant_insights',
] as const;
export type Screen = (typeof SCREENS)[number];

/**
 * Jobs the assistant does rather than only taking someone somewhere: it
 * answers in the sheet from their own orders, or acts after a tap to confirm.
 */
export const CUSTOMER_JOBS = ['recommend', 'reorder', 'savings', 'my_codes', 'cancel', 'business_info'] as const;
export const MERCHANT_JOBS = ['merchant_summary', 'merchant_pause', 'merchant_resume', 'merchant_redeem'] as const;
export const INTENT_KINDS = ['search', 'book', 'go', 'open_business', ...CUSTOMER_JOBS, ...MERCHANT_JOBS] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];

/** Who is asking: a customer, or an owner on their merchant screens. */
export type AssistMode = 'customer' | 'merchant';

export interface CustomerIntent {
  kind: IntentKind;
  /** English search words: what, price, place, group size, time ("biryani under 300 in HSR for 4"). */
  query: string | null;
  screen: Screen | null;
  /** A place they named, for booking or opening it. */
  business: string | null;
  /** YYYY-MM-DD in Bengaluru time. */
  date: string | null;
  /** HH:MM, 24-hour. */
  time: string | null;
  people: number | null;
  /** A redemption code a merchant read out, letters and digits only ("RNG7K2"). */
  code: string | null;
  /** One short English line of what was understood, shown back to them. */
  heard: string;
}

export interface MerchantProduct {
  title: string;
  description: string;
  price: number | null;
  original_price: number | null;
  /** A monthly plan or membership, priced per month. */
  per_month: boolean;
  party_min: number | null;
  party_max: number | null;
}

export interface MerchantProfile {
  owner_name: string | null;
  owner_role: string | null;
  business_name: string | null;
  /** "South Indian restaurant", "bike service garage". */
  business_type: string | null;
  /** One of the areas the app covers, by name, when clearly the same place. */
  area: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
  open_time: string | null;
  close_time: string | null;
  /** 0 = Sunday … 6 = Saturday; null or empty for every day. */
  days: number[] | null;
  cost_for_two: number | null;
  amenities: string[];
  cuisines: string[];
  products: MerchantProduct[];
}

export interface DealVoiceDraft {
  offering: string | null;
  title: string | null;
  short_description: string | null;
  description: string | null;
  price: number | null;
  original_price: number | null;
  start_time: string | null;
  end_time: string | null;
  days: number[] | null;
  party_min: number | null;
  party_max: number | null;
  keywords: string[];
  needs_booking: boolean;
  slot_capacity: number | null;
}

export type AssistTask = 'customer' | 'merchant' | 'deal';

export interface AssistRequest {
  task: AssistTask;
  text: string;
  lang: VoiceLang;
  /** Today in Bengaluru, YYYY-MM-DD, and the time, HH:MM: for "tomorrow at 8". */
  today: string;
  now: string;
  /** The areas the app covers, so a place can be matched to one. */
  areas: string[];
  /** Customer or merchant screens; changes what "pause" or "today" mean. */
  mode?: AssistMode;
  /** The owner's business, so "how's business" needs no name. */
  business?: string | null;
}
