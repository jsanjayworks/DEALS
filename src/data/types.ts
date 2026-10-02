/**
 * Domain types. Field names mirror supabase/migrations/0001_init.sql so the
 * local adapter and the Supabase adapter return identically-shaped rows.
 */

export type DealStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'VERIFICATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'ARCHIVED';

export type OfferingKind =
  | 'product'
  | 'service'
  | 'meal'
  | 'experience'
  | 'event'
  | 'property'
  | 'transport'
  | 'other';

export type DealTypeCode =
  | 'discount'
  | 'bundle'
  | 'bxgy'
  | 'booking'
  | 'experience'
  | 'time_based'
  | 'flash'
  | 'free'
  | 'service_package'
  | 'property'
  | 'business_offer'
  | 'transport'
  | 'community';

export type CtaType =
  | 'buy'
  | 'book'
  | 'claim'
  | 'reserve'
  | 'enquire'
  | 'call'
  | 'chat'
  | 'directions'
  | 'register'
  | 'visit';

export type Vertical =
  | 'food'
  | 'retail'
  | 'events'
  | 'mobility'
  | 'property'
  | 'services'
  | 'business'
  | 'community';

export type AudienceKind =
  | 'everyone'
  | 'verified'
  | 'members'
  | 'new_customers'
  | 'existing_customers';

export type CustomerActionType =
  | 'claim'
  | 'booking'
  | 'reserve'
  | 'enquiry'
  | 'registration'
  | 'purchase_intent';

export type CustomerActionStatus =
  | 'pending'
  | 'confirmed'
  | 'redeemed'
  | 'cancelled'
  | 'expired';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Locality {
  id: string;
  name: string;
  city: string;
  centroid: LatLng;
  aliases: string[];
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  vertical: Vertical;
  icon: string;
  parent_id: string | null;
}

export interface Business {
  id: string;
  name: string;
  phone: string;
  email: string;
  primary_category_id: string;
  verification_status: 'unverified' | 'pending' | 'verified' | 'rejected';
  rating_avg: number;
  rating_count: number;
  locality_id: string;
  address_line: string;
  location: LatLng;
}

export interface DealAvailability {
  /** 0 = Sunday … 6 = Saturday. Empty array means every day. */
  days: number[];
  start_time: string;
  end_time: string;
}

export interface DealEligibility {
  audience: AudienceKind;
  min_age: number | null;
  min_spend: number | null;
  membership_required: boolean;
  advance_booking_hours: number | null;
  custom_rule: string | null;
}

export interface Deal {
  id: string;
  business_id: string;
  category_id: string;
  deal_type_code: DealTypeCode;
  offering_kind: OfferingKind;
  title: string;
  short_description: string;
  description: string;
  status: DealStatus;
  original_price: number | null;
  deal_price: number | null;
  /** Generated column in Postgres; computed on write in the local adapter. */
  discount_pct: number | null;
  /** Rent and subscriptions read as "₹38,000/mo" rather than a one-off price. */
  price_unit: string | null;
  taxes_note: string | null;
  min_purchase: number | null;
  max_qty_per_customer: number | null;
  starts_at: string;
  ends_at: string;
  capacity_total: number | null;
  capacity_remaining: number | null;
  booking_required: boolean;
  cancellation_policy: string | null;
  terms: string | null;
  attributes: Record<string, string | number | boolean>;
  tags: string[];
  location: LatLng;
  image: string;
  primary_cta: CtaType;
  secondary_ctas: CtaType[];
  availability: DealAvailability;
  eligibility: DealEligibility;
  rejection_reason: string | null;
  published_at: string | null;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  /** Counters the merchant analytics screen reads. */
  views: number;
  searches: number;
}

/** A deal joined with its business, locality and computed distance. */
export interface DealCardModel extends Deal {
  business: Business;
  category: Category;
  locality_name: string;
  distance_km: number;
  is_verified: boolean;
  ending_soon: boolean;
}

export interface CustomerAction {
  id: string;
  deal_id: string;
  customer_id: string;
  action_type: CustomerActionType;
  status: CustomerActionStatus;
  quantity: number;
  slot_start: string | null;
  redemption_code: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  profile_id: string;
  kind:
    | 'deal_approved'
    | 'deal_rejected'
    | 'action_confirmed'
    | 'new_claim'
    | 'ending_soon';
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface DealStatusHistoryEntry {
  id: string;
  deal_id: string;
  from_status: DealStatus | null;
  to_status: DealStatus;
  actor: 'merchant' | 'admin' | 'system';
  reason: string | null;
  created_at: string;
}

/** Hard filters applied in the WHERE clause before ranking. */
export interface SearchFilters {
  keywords: string[];
  vertical: Vertical | null;
  category_slug: string | null;
  price_min: number | null;
  price_max: number | null;
  radius_km: number | null;
  locality: string | null;
  time_of_day: 'morning' | 'lunch' | 'evening' | 'night' | null;
  day_of_week: number[];
  deal_types: DealTypeCode[];
  attributes: Record<string, string | number>;
  verified_only: boolean;
  min_rating: number | null;
  ending_soon: boolean;
  sort: SortKey;
}

export type SortKey = 'relevance' | 'distance' | 'ending_soon' | 'best_value';

export type FeedSection =
  | 'near_you'
  | 'today'
  | 'trending'
  | 'new'
  | 'ending_soon';
