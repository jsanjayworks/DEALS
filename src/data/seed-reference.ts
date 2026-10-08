import type { Business, Category, Locality } from './types';

/** Real Bengaluru locality centroids — card distances are computed from these. */
export const LOCALITIES: Locality[] = [
  { id: 'loc-kor', name: 'Koramangala', city: 'Bengaluru', centroid: { lat: 12.9352, lng: 77.6245 }, aliases: ['koramangala', 'kormangala', 'kor'] },
  { id: 'loc-hsr', name: 'HSR Layout', city: 'Bengaluru', centroid: { lat: 12.9116, lng: 77.6474 }, aliases: ['hsr', 'hsr layout', 'hsrlayout'] },
  { id: 'loc-ind', name: 'Indiranagar', city: 'Bengaluru', centroid: { lat: 12.9719, lng: 77.6412 }, aliases: ['indiranagar', 'indira nagar', 'ingr'] },
  { id: 'loc-jay', name: 'Jayanagar', city: 'Bengaluru', centroid: { lat: 12.9250, lng: 77.5938 }, aliases: ['jayanagar', 'jaya nagar'] },
  { id: 'loc-wht', name: 'Whitefield', city: 'Bengaluru', centroid: { lat: 12.9698, lng: 77.7500 }, aliases: ['whitefield', 'white field'] },
  { id: 'loc-mar', name: 'Marathahalli', city: 'Bengaluru', centroid: { lat: 12.9591, lng: 77.6974 }, aliases: ['marathahalli', 'marathalli'] },
  { id: 'loc-mgr', name: 'MG Road', city: 'Bengaluru', centroid: { lat: 12.9756, lng: 77.6068 }, aliases: ['mg road', 'mgroad'] },
  { id: 'loc-ecy', name: 'Electronic City', city: 'Bengaluru', centroid: { lat: 12.8452, lng: 77.6602 }, aliases: ['electronic city', 'ecity', 'e city'] },
  { id: 'loc-bel', name: 'Bellandur', city: 'Bengaluru', centroid: { lat: 12.9304, lng: 77.6784 }, aliases: ['bellandur'] },
  { id: 'loc-jpn', name: 'JP Nagar', city: 'Bengaluru', centroid: { lat: 12.9063, lng: 77.5857 }, aliases: ['jp nagar', 'jpnagar'] },
];

export const DEFAULT_LOCALITY_ID = 'loc-kor';

/**
 * Facet attributes per top-level category, as categories.attribute_schema.
 * A property marked x-facet becomes a row of subheadings on that category's
 * page, built from the values live deals actually carry. Adding "cuisine:
 * Korean" to a deal is enough to make Korean appear under Food.
 */
const FOOD_SCHEMA = {
  properties: { cuisine: { type: 'string', title: 'Cuisine', 'x-facet': true } },
} as const;
const PROPERTY_SCHEMA = {
  properties: {
    bhk: { type: 'integer', title: 'Size', 'x-facet': true, 'x-label': '{value} BHK' },
    furnishing: { type: 'string', title: 'Furnishing', 'x-facet': true },
    area_sqft: { type: 'integer', title: 'Area (sq ft)' },
  },
} as const;
const MOBILITY_SCHEMA = {
  properties: { vehicle: { type: 'string', title: 'Vehicle', 'x-facet': true } },
} as const;

/**
 * Top-level verticals plus leaf subcategories. Adding a category is a data
 * change, not a code change — the PRD taxonomy principle.
 *
 * Top-level icons name glyphs in components/Icon, so the Home grid draws them
 * from data. Leaves keep their Ionicons names for the admin console.
 */
export const CATEGORIES: Category[] = [
  { id: 'cat-food', slug: 'food', name: 'Food', vertical: 'food', icon: 'utensils', parent_id: null, attribute_schema: FOOD_SCHEMA },
  { id: 'cat-retail', slug: 'retail', name: 'Retail', vertical: 'retail', icon: 'bag', parent_id: null },
  { id: 'cat-events', slug: 'events', name: 'Events', vertical: 'events', icon: 'calendarStar', parent_id: null },
  { id: 'cat-mobility', slug: 'mobility', name: 'Mobility', vertical: 'mobility', icon: 'car', parent_id: null, attribute_schema: MOBILITY_SCHEMA },
  { id: 'cat-property', slug: 'property', name: 'Property', vertical: 'property', icon: 'building', parent_id: null, attribute_schema: PROPERTY_SCHEMA },
  { id: 'cat-services', slug: 'services', name: 'Services', vertical: 'services', icon: 'sparkles', parent_id: null },
  { id: 'cat-business', slug: 'business', name: 'Business', vertical: 'business', icon: 'briefcase', parent_id: null },

  { id: 'cat-food-lunch', slug: 'lunch', name: 'Lunch', vertical: 'food', icon: 'restaurant-outline', parent_id: 'cat-food' },
  { id: 'cat-food-brunch', slug: 'brunch', name: 'Brunch', vertical: 'food', icon: 'cafe-outline', parent_id: 'cat-food' },
  { id: 'cat-food-cafe', slug: 'cafe', name: 'Cafe and Coffee', vertical: 'food', icon: 'cafe-outline', parent_id: 'cat-food' },
  { id: 'cat-food-dinner', slug: 'dinner', name: 'Dinner', vertical: 'food', icon: 'wine-outline', parent_id: 'cat-food' },
  { id: 'cat-food-bar', slug: 'bar', name: 'Bars and Pubs', vertical: 'food', icon: 'beer-outline', parent_id: 'cat-food' },
  { id: 'cat-retail-fashion', slug: 'fashion', name: 'Fashion', vertical: 'retail', icon: 'shirt-outline', parent_id: 'cat-retail' },
  { id: 'cat-retail-electronics', slug: 'electronics', name: 'Electronics', vertical: 'retail', icon: 'phone-portrait-outline', parent_id: 'cat-retail' },
  { id: 'cat-retail-grocery', slug: 'grocery', name: 'Grocery', vertical: 'retail', icon: 'basket-outline', parent_id: 'cat-retail' },
  { id: 'cat-events-comedy', slug: 'comedy', name: 'Comedy and Stand-up', vertical: 'events', icon: 'mic-outline', parent_id: 'cat-events' },
  { id: 'cat-events-music', slug: 'music', name: 'Live Music', vertical: 'events', icon: 'musical-notes-outline', parent_id: 'cat-events' },
  { id: 'cat-events-nightlife', slug: 'nightlife', name: 'Nightlife', vertical: 'events', icon: 'moon-outline', parent_id: 'cat-events' },
  { id: 'cat-events-workshop', slug: 'workshop', name: 'Workshops', vertical: 'events', icon: 'color-palette-outline', parent_id: 'cat-events' },
  { id: 'cat-events-classes', slug: 'classes', name: 'Classes', vertical: 'events', icon: 'school-outline', parent_id: 'cat-events' },
  { id: 'cat-events-volunteer', slug: 'volunteer', name: 'Volunteering', vertical: 'events', icon: 'heart-outline', parent_id: 'cat-events' },
  { id: 'cat-mobility-cab', slug: 'cab', name: 'Cabs', vertical: 'mobility', icon: 'car-outline', parent_id: 'cat-mobility' },
  { id: 'cat-mobility-rental', slug: 'bike-rental', name: 'Bike and Scooty Rental', vertical: 'mobility', icon: 'bicycle-outline', parent_id: 'cat-mobility' },
  { id: 'cat-property-rent', slug: 'rent', name: 'Flats', vertical: 'property', icon: 'home-outline', parent_id: 'cat-property' },
  { id: 'cat-property-villa', slug: 'villa', name: 'Villas', vertical: 'property', icon: 'home-outline', parent_id: 'cat-property' },
  { id: 'cat-property-coliving', slug: 'coliving', name: 'Rooms and PG', vertical: 'property', icon: 'bed-outline', parent_id: 'cat-property' },
  { id: 'cat-services-salon', slug: 'salon', name: 'Salon and Spa', vertical: 'services', icon: 'cut-outline', parent_id: 'cat-services' },
  { id: 'cat-services-makeup', slug: 'makeup', name: 'Makeup', vertical: 'services', icon: 'brush-outline', parent_id: 'cat-services' },
  { id: 'cat-services-facials', slug: 'facials', name: 'Facials and Skin', vertical: 'services', icon: 'flower-outline', parent_id: 'cat-services' },
  { id: 'cat-services-cleaning', slug: 'cleaning', name: 'Home Cleaning', vertical: 'services', icon: 'sparkles-outline', parent_id: 'cat-services' },
  { id: 'cat-services-repair', slug: 'repair', name: 'Home Repair', vertical: 'services', icon: 'hammer-outline', parent_id: 'cat-services' },
  { id: 'cat-services-fitness', slug: 'fitness', name: 'Fitness', vertical: 'services', icon: 'barbell-outline', parent_id: 'cat-services' },
  { id: 'cat-services-vehicle', slug: 'vehicle-care', name: 'Vehicle Care', vertical: 'services', icon: 'construct-outline', parent_id: 'cat-services' },
  { id: 'cat-business-coworking', slug: 'coworking', name: 'Coworking', vertical: 'business', icon: 'business-outline', parent_id: 'cat-business' },
  { id: 'cat-business-b2b', slug: 'b2b', name: 'B2B Offers', vertical: 'business', icon: 'briefcase-outline', parent_id: 'cat-business' },
];

export const TOP_CATEGORIES = CATEGORIES.filter((c) => c.parent_id === null);

/** Small lat/lng jitter so pins inside one locality do not stack. */
function near(localityId: string, dLat: number, dLng: number) {
  const loc = LOCALITIES.find((l) => l.id === localityId)!;
  return { lat: loc.centroid.lat + dLat, lng: loc.centroid.lng + dLng };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

type BizSeed = [
  id: string,
  name: string,
  categoryId: string,
  localityId: string,
  address: string,
  verified: boolean,
  rating: number,
  ratingCount: number,
  dLat: number,
  dLng: number,
];

const BIZ: BizSeed[] = [
  ['biz-rangoli', 'Rangoli Kitchen', 'cat-food-lunch', 'loc-kor', '5th Block, 80 Feet Road', true, 4.6, 412, 0.002, 0.001],
  ['biz-thirdwave', 'Brewline Coffee', 'cat-food-cafe', 'loc-ind', '12th Main, Indiranagar', true, 4.5, 1890, -0.001, 0.002],
  ['biz-brunchclub', 'Sunny Side Brunch Co.', 'cat-food-brunch', 'loc-kor', '7th Block, Jyoti Nivas Road', true, 4.7, 623, -0.003, 0.002],
  ['biz-toitbrew', 'Terrace Tap Brewpub', 'cat-food-bar', 'loc-ind', '100 Feet Road, Indiranagar', true, 4.8, 5240, 0.002, -0.001],
  ['biz-meghana', 'Saffron Dum Biryani', 'cat-food-dinner', 'loc-hsr', '27th Main, Sector 2', true, 4.4, 3180, 0.001, 0.003],
  ['biz-cafenoir', 'Cafe Mocha Lane', 'cat-food-cafe', 'loc-mgr', 'Brigade Road Junction', false, 4.2, 278, -0.002, 0.001],
  ['biz-southspice', 'South Spice Darshini', 'cat-food-lunch', 'loc-jay', '4th Block, Jayanagar', true, 4.3, 892, 0.001, -0.002],
  ['biz-tandoor', 'Tandoor Tales', 'cat-food-dinner', 'loc-wht', 'Varthur Road, Whitefield', false, 4.1, 334, 0.002, 0.002],
  ['biz-sushibar', 'Sakura Sushi Bar', 'cat-food-dinner', 'loc-ind', 'CMH Road, Indiranagar', true, 4.6, 718, -0.002, -0.001],
  ['biz-chaipoint', 'Chai Adda Express', 'cat-food-cafe', 'loc-ecy', 'Phase 1, Electronic City', true, 4.0, 1104, 0.001, 0.001],
  ['biz-cultfit', 'FitHive Koramangala', 'cat-services-fitness', 'loc-kor', '6th Block, 80 Feet Road', true, 4.5, 2210, 0.001, -0.002],
  ['biz-ironhouse', 'Iron House Gym', 'cat-services-fitness', 'loc-hsr', 'Sector 1, HSR Layout', false, 4.2, 189, -0.002, 0.001],
  ['biz-glowsalon', 'Glow Salon and Spa', 'cat-services-salon', 'loc-ind', 'Double Road, Indiranagar', true, 4.4, 967, 0.003, 0.001],
  ['biz-urbanfix', 'UrbanFix Home Services', 'cat-services-repair', 'loc-bel', 'Outer Ring Road, Bellandur', true, 4.3, 1540, 0.001, 0.002],
  ['biz-yogashala', 'Prana Yoga Shala', 'cat-services-fitness', 'loc-jpn', '6th Phase, JP Nagar', false, 4.7, 243, -0.001, 0.001],
  ['biz-decathlon', 'SportsDen Marathahalli', 'cat-retail-fashion', 'loc-mar', 'Outer Ring Road', true, 4.4, 4120, 0.002, -0.001],
  ['biz-techbazaar', 'Tech Bazaar', 'cat-retail-electronics', 'loc-mgr', 'SP Road Extension', false, 4.0, 512, 0.001, 0.002],
  ['biz-freshkart', 'FreshKart Organics', 'cat-retail-grocery', 'loc-hsr', 'Sector 3, HSR Layout', true, 4.5, 783, 0.002, -0.002],
  ['biz-threadco', 'Thread and Co.', 'cat-retail-fashion', 'loc-kor', '5th Block, Koramangala', false, 4.1, 221, -0.001, -0.001],
  ['biz-comedyhouse', 'Laugh Lounge', 'cat-events-comedy', 'loc-kor', '7th Block, Koramangala', true, 4.7, 1320, 0.003, -0.001],
  ['biz-fandango', 'Groove Yard Live', 'cat-events-music', 'loc-wht', 'ITPL Main Road', true, 4.5, 684, -0.002, 0.002],
  ['biz-clayworks', 'Clay Works Studio', 'cat-events-workshop', 'loc-jay', '11th Main, Jayanagar', false, 4.8, 156, 0.001, 0.001],
  ['biz-openmic', 'Mic Drop Collective', 'cat-events-comedy', 'loc-ind', '80 Feet Road, Indiranagar', false, 4.4, 298, -0.003, 0.001],
  ['biz-bluecabs', 'Blue Cabs Bengaluru', 'cat-mobility-cab', 'loc-ecy', 'Hosur Road', true, 4.2, 2890, 0.002, 0.001],
  ['biz-zipbikes', 'ZipBikes Rentals', 'cat-mobility-rental', 'loc-kor', '5th Block, Koramangala', false, 4.1, 437, -0.001, 0.002],
  ['biz-urbannest', 'UrbanNest Properties', 'cat-property-rent', 'loc-hsr', 'Sector 7, HSR Layout', true, 4.0, 318, 0.003, 0.001],
  ['biz-coliveco', 'NestTogether Co-living', 'cat-property-coliving', 'loc-mar', 'Kundalahalli Gate', true, 4.2, 592, -0.002, -0.001],
  ['biz-propkart', 'PropKart Realty', 'cat-property-rent', 'loc-jpn', '7th Phase, JP Nagar', false, 3.9, 142, 0.001, -0.002],
  ['biz-hivedesk', 'HiveDesk Coworking', 'cat-business-coworking', 'loc-ind', 'CMH Road, Indiranagar', true, 4.6, 874, 0.002, 0.003],
  ['biz-printhub', 'PrintHub Business Services', 'cat-business-b2b', 'loc-bel', 'Bellandur Main Road', false, 4.1, 203, -0.001, 0.001],
  ['biz-skillcamp', 'SkillCamp Bengaluru', 'cat-events-classes', 'loc-kor', '4th Block, Koramangala', true, 4.5, 661, 0.001, 0.003],
  ['biz-greencity', 'Green City Volunteers', 'cat-events-volunteer', 'loc-jay', 'Jayanagar East', true, 4.9, 87, -0.002, -0.002],
  ['biz-thundergarage', 'Thunder Garage', 'cat-services-vehicle', 'loc-kor', '8th Block, Koramangala', true, 4.6, 742, -0.002, 0.003],
  ['biz-sparkwash', 'Spark Car and Bike Wash', 'cat-services-vehicle', 'loc-hsr', '19th Main, Sector 4', true, 4.4, 1186, 0.002, -0.003],
  ['biz-tyrehub', 'TyreHub Auto Care', 'cat-services-vehicle', 'loc-bel', 'Sarjapur Road, Bellandur', false, 4.2, 365, 0.003, -0.002],
  ['biz-kebabco', 'The Kebab Co.', 'cat-food-dinner', 'loc-kor', '1st Block, Koramangala', true, 4.5, 1730, 0.001, -0.003],
];

export const BUSINESSES: Business[] = BIZ.map(
  ([id, name, categoryId, localityId, address, verified, rating, ratingCount, dLat, dLng]) => ({
    id,
    name,
    phone: '+9198' + String(Math.abs(hash(id)) % 100000000).padStart(8, '0'),
    // From the name, not the id: the ids keep older sample names that are real brands.
    email: name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '@example.in',
    primary_category_id: categoryId,
    verification_status: verified ? ('verified' as const) : ('unverified' as const),
    rating_avg: rating,
    rating_count: ratingCount,
    locality_id: localityId,
    address_line: address,
    location: near(localityId, dLat, dLng),
  }),
);

/** The business the demo merchant account owns. */
export const DEMO_BUSINESS_ID = 'biz-rangoli';

export const businessById = (id: string) => BUSINESSES.find((b) => b.id === id)!;
export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id)!;
export const localityById = (id: string) => LOCALITIES.find((l) => l.id === id)!;
export const localityOf = (businessId: string) => localityById(businessById(businessId).locality_id);
