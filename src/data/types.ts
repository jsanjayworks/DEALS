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

/** One attribute in a category's schema, as stored in categories.attribute_schema. */
export interface AttributeSpec {
  readonly type: 'string' | 'integer' | 'number' | 'boolean';
  readonly title?: string;
  /** Shown as a row of subheadings on the category page. */
  readonly 'x-facet'?: boolean;
  /** How a value reads, e.g. "{value} BHK". */
  readonly 'x-label'?: string;
}

/**
 * One value in deals.attributes. Most are scalars ("cuisine": "Japanese",
 * "bhk": 2); a few cross-category ones are lists, like the vehicles a service
 * is for. Two keys mean the same thing on every deal:
 *   party_min / party_max  how many people the deal is for ("for 4 to 6")
 *   vehicles               vehicle tags, see data/vehicles.ts
 */
export type AttributeValue = string | number | boolean | string[];

/** JSON Schema subset for deals.attributes. Absent means {}. */
export interface AttributeSchema {
  readonly properties?: Readonly<Record<string, AttributeSpec>>;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  vertical: Vertical;
  icon: string;
  parent_id: string | null;
  attribute_schema?: AttributeSchema;
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
  /** What the business does and sells, in the owner's words. */
  description?: string | null;
  /** Words customers find it by, from the owner's description. */
  keywords?: string[];
  /** The person who set it up: owner, manager… */
  owner_role?: string | null;
  /** What a meal for two usually costs, in rupees: restaurants show it like District does. */
  cost_for_two?: number | null;
  /** Keys from data/amenities.ts: parking, rooftop, pure veg… */
  amenities?: string[];
  cuisines?: string[];
  /** Usual opening hours, HH:MM. */
  open_time?: string | null;
  close_time?: string | null;
  /** Photos of the place and its food or work, first one the cover. */
  photos?: string[];
  /** What it sells, with prices: the menu or rate card on the shop page. */
  menu?: MenuItem[];
}

/** A customer's stars and words about a visit, shown on deal and shop pages. */
export interface Review {
  id: string;
  deal_id: string;
  deal_title?: string;
  business_id: string;
  customer_id: string;
  /** First name and initial, or null where the backend keeps names private. */
  customer_name: string | null;
  rating: number;
  body: string | null;
  created_at: string;
  /** The redeemed order it is about: a verified visit. */
  action_id: string | null;
}

export interface MenuItem {
  name: string;
  price: number | null;
  description?: string | null;
  /** Food only: vegetarian or not; null for everything else. */
  veg?: boolean | null;
  photo?: string | null;
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
  attributes: Record<string, AttributeValue>;
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
    | 'ending_soon'
    | 'business_verified'
    | 'business_rejected'
    | 'support_reply'
    | 'deal_paused'
    | 'rate_visit'
    | 'new_review'
    | 'order_cancelled'
    | 'review_needed'
    | 'verification_needed';
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
  /** The group going: a deal matches when its party_min..party_max overlaps. */
  party_min: number | null;
  party_max: number | null;
  /** A deal matches when its attributes.vehicles shares any of these tags. */
  vehicle_tags: string[];
  /** Amenity keys (data/amenities.ts) the place must have: rooftop, pure veg… */
  amenities: string[];
  /** Places at or under this cost for two, in rupees. */
  max_cost_for_two: number | null;
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
