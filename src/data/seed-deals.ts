import { businessById } from './seed-reference';
import type {
  AttributeValue,
  CtaType,
  Deal,
  DealTypeCode,
  OfferingKind,
} from './types';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** Anchored once at module load so feed sections stay stable within a session. */
const NOW = Date.now();

const iso = (ms: number) => new Date(ms).toISOString();

interface DealSeed {
  id: string;
  biz: string;
  cat: string;
  type: DealTypeCode;
  kind: OfferingKind;
  title: string;
  blurb: string;
  desc?: string;
  mrp?: number;
  price?: number;
  unit?: string;
  cta: CtaType;
  also?: CtaType[];
  cap?: number;
  left?: number;
  /** Days from now that the deal ends. Under 1 lands it in Ending Soon. */
  endsIn: number;
  /** Days ago the deal was published. Under 3 lands it in New. */
  pubAgo?: number;
  days?: number[];
  from?: string;
  to?: string;
  tags?: string[];
  attrs?: Record<string, string | number | boolean>;
  /** How many people the deal is for, smallest and largest group. */
  party?: [number, number];
  /** Vehicle tags the deal is for (see data/vehicles.ts). */
  fits?: string[];
  minAge?: number;
  views?: number;
  searches?: number;
  booking?: boolean;
  minSpend?: number;
  taxes?: string;
  cancel?: string;
  terms?: string;
}

const SEED: DealSeed[] = [
  // ---------- Food ----------
  { id: 'd-001', attrs: { cuisine: 'Continental' }, biz: 'biz-brunchclub', cat: 'cat-food-brunch', type: 'bundle', kind: 'meal',
    title: 'Weekend Brunch for Two', blurb: 'Unlimited brunch spread with one round of mimosas',
    desc: 'A full weekend spread: live counters, continental and South Indian mains, dessert bar, and one round of mimosas per guest. Walk in or reserve ahead for the terrace seating.',
    mrp: 899, price: 629, cta: 'claim', also: ['call', 'directions'], cap: 40, left: 12, endsIn: 6, pubAgo: 5,
    days: [0, 6], from: '11:00', to: '16:00', tags: ['brunch', 'unlimited', 'weekend', 'mimosa'],
    views: 1840, searches: 620, taxes: 'Taxes included. Service charge extra.',
    cancel: 'Free cancellation up to 2 hours before your slot.' },

  { id: 'd-002', attrs: { cuisine: 'South Indian' }, biz: 'biz-rangoli', cat: 'cat-food-lunch', type: 'discount', kind: 'meal',
    title: 'South Indian Thali Lunch', blurb: 'Full banana-leaf thali, 14 items',
    desc: 'Traditional Karnataka thali served on banana leaf with unlimited rice, sambar, two palyas, kosambari, payasa and more.',
    mrp: 320, price: 199, cta: 'claim', also: ['call', 'directions'], cap: 120, left: 54, endsIn: 14, pubAgo: 9,
    days: [1, 2, 3, 4, 5], from: '12:00', to: '15:30', tags: ['thali', 'lunch', 'vegetarian', 'south indian'],
    views: 3210, searches: 1480 },

  { id: 'd-003', attrs: { cuisine: 'Cafe' }, biz: 'biz-thirdwave', cat: 'cat-food-cafe', type: 'bxgy', kind: 'meal',
    title: 'Buy 1 Get 1 on All Coffee', blurb: 'Every brew, all day, dine-in only',
    desc: 'Applies to all hot and cold coffee on the menu. Dine-in only, one offer per bill.',
    mrp: 280, price: 140, cta: 'claim', also: ['directions'], cap: 200, left: 88, endsIn: 0.6, pubAgo: 12,
    from: '08:00', to: '22:00', tags: ['coffee', 'bogo', 'cafe', 'buy one get one'],
    views: 5120, searches: 2340, taxes: 'GST extra as applicable.' },

  { id: 'd-004', attrs: { cuisine: 'Biryani' }, biz: 'biz-meghana', cat: 'cat-food-dinner', type: 'discount', kind: 'meal',
    title: 'Boneless Biryani Family Pack', blurb: 'Serves 4, with raita and gravy',
    mrp: 1240, price: 849, cta: 'buy', also: ['call', 'directions'], cap: 60, left: 23, endsIn: 9, pubAgo: 4,
    from: '12:00', to: '23:00', tags: ['biryani', 'family pack', 'dinner', 'chicken'],
    views: 4480, searches: 1920 },

  { id: 'd-005', attrs: { cuisine: 'Bar Food' }, biz: 'biz-toitbrew', cat: 'cat-food-bar', type: 'time_based', kind: 'meal',
    title: 'Happy Hours: Craft Beer Pitchers', blurb: 'Pitchers at pint prices, 4 to 7 PM',
    desc: 'All house-brewed beers on tap. Valid Monday to Thursday, 4 PM to 7 PM. Age 21 and above only.',
    mrp: 850, price: 499, cta: 'reserve', also: ['call', 'directions'], cap: 80, left: 31, endsIn: 20, pubAgo: 15,
    days: [1, 2, 3, 4], from: '16:00', to: '19:00', tags: ['beer', 'happy hours', 'craft', 'pub'],
    minAge: 21, views: 6240, searches: 2810, booking: true },

  // The demo merchant's table booking: a cap per time slot, so 8 PM can fill up.
  { id: 'd-077', attrs: { cuisine: 'South Indian', slot_capacity: 6, party_min: 4, party_max: 4 }, biz: 'biz-rangoli',
    cat: 'cat-food-dinner', type: 'booking', kind: 'meal',
    title: 'Family Dinner Table for 4', blurb: 'A reserved table, four thalis, filter coffee and dessert',
    desc: 'A table for four held at your time, with a South Indian thali each, filter coffee and payasam. Tables are held for 15 minutes past your booking.',
    mrp: 1600, price: 999, cta: 'reserve', also: ['call', 'directions'], cap: 120, left: 103, endsIn: 20, pubAgo: 3,
    from: '18:00', to: '22:30', tags: ['table', 'dinner', 'family', 'reservation', 'thali'],
    views: 1180, searches: 540, booking: true, cancel: 'Free cancellation up to 2 hours before your table.' },

  { id: 'd-006', attrs: { cuisine: 'South Indian' }, biz: 'biz-southspice', cat: 'cat-food-lunch', type: 'discount', kind: 'meal',
    title: 'Breakfast Combo: Idli Vada Coffee', blurb: 'Classic Bengaluru breakfast under 100',
    mrp: 150, price: 89, cta: 'claim', also: ['directions'], cap: 150, left: 112, endsIn: 25, pubAgo: 20,
    from: '07:00', to: '11:00', tags: ['breakfast', 'idli', 'vada', 'filter coffee'],
    views: 2180, searches: 940 },

  { id: 'd-007', attrs: { cuisine: 'Japanese' }, biz: 'biz-sushibar', cat: 'cat-food-dinner', type: 'bundle', kind: 'meal',
    title: 'Sushi Platter for Two', blurb: '24 pieces, chef selection, with miso soup',
    mrp: 2200, price: 1499, cta: 'book', also: ['call'], cap: 20, left: 6, endsIn: 4, pubAgo: 2,
    days: [4, 5, 6], from: '19:00', to: '23:00', tags: ['sushi', 'japanese', 'platter', 'date night'],
    views: 1420, searches: 580, booking: true, cancel: 'Cancel up to 4 hours before the slot for a full refund.' },

  { id: 'd-008', attrs: { cuisine: 'Desserts' }, biz: 'biz-cafenoir', cat: 'cat-food-cafe', type: 'flash', kind: 'meal',
    title: 'Flash Deal: Cheesecake Slice', blurb: 'New York cheesecake, today only',
    mrp: 320, price: 149, cta: 'claim', also: ['directions'], cap: 30, left: 4, endsIn: 0.35, pubAgo: 0,
    from: '11:00', to: '21:00', tags: ['dessert', 'cheesecake', 'flash'], views: 890, searches: 410 },

  { id: 'd-009', attrs: { cuisine: 'North Indian' }, biz: 'biz-tandoor', cat: 'cat-food-dinner', type: 'discount', kind: 'meal',
    title: '30% Off North Indian Dinner', blurb: 'Whole à la carte menu, dine-in',
    mrp: 1000, price: 700, cta: 'claim', also: ['call', 'directions'], cap: 70, left: 44, endsIn: 11, pubAgo: 6,
    from: '19:00', to: '23:00', tags: ['north indian', 'dinner', 'tandoor'], views: 1120, searches: 460 },

  { id: 'd-010', attrs: { cuisine: 'Cafe' }, biz: 'biz-chaipoint', cat: 'cat-food-cafe', type: 'free', kind: 'meal',
    title: 'Free Chai with Any Snack', blurb: 'Kadak chai on the house',
    mrp: 60, price: 0, cta: 'claim', also: ['directions'], cap: 300, left: 198, endsIn: 18, pubAgo: 11,
    from: '07:00', to: '20:00', tags: ['chai', 'free', 'snack'], views: 2640, searches: 1180, minSpend: 99 },

  { id: 'd-011', attrs: { cuisine: 'South Indian' }, biz: 'biz-rangoli', cat: 'cat-food-dinner', type: 'bxgy', kind: 'meal',
    title: 'Buy 2 Get 1 Dosa Free', blurb: 'All dosa varieties, evening menu',
    mrp: 390, price: 260, cta: 'claim', also: ['directions'], cap: 90, left: 67, endsIn: 8, pubAgo: 1,
    from: '17:00', to: '21:30', tags: ['dosa', 'bogo', 'evening'], views: 760, searches: 320 },

  { id: 'd-012', attrs: { cuisine: 'Cafe' }, biz: 'biz-brunchclub', cat: 'cat-food-cafe', type: 'time_based', kind: 'meal',
    title: 'Coffee Meeting Combo', blurb: 'Two coffees and a sandwich platter, weekday mornings',
    mrp: 640, price: 420, cta: 'claim', also: ['call'], cap: 50, left: 28, endsIn: 16, pubAgo: 7,
    days: [1, 2, 3, 4, 5], from: '09:00', to: '12:00', tags: ['coffee', 'meeting', 'work', 'sandwich'],
    views: 1340, searches: 890 },

  // ---------- Services ----------
  { id: 'd-013', biz: 'biz-cultfit', cat: 'cat-services-fitness', type: 'discount', kind: 'service',
    title: 'Gym 3-Month Pass', blurb: 'All classes, all centres, no joining fee',
    desc: 'Unlimited access to strength and cardio floors plus group classes. Joining fee of 1,500 waived for YOLO users.',
    mrp: 12000, price: 6999, cta: 'buy', also: ['call', 'directions'], cap: 50, left: 17, endsIn: 10, pubAgo: 3,
    from: '05:00', to: '23:00', tags: ['gym', 'fitness', 'membership', '3 month'],
    views: 4920, searches: 2640, cancel: 'Transferable once. No refunds after activation.' },

  { id: 'd-014', biz: 'biz-glowsalon', cat: 'cat-services-salon', type: 'bundle', kind: 'service',
    title: 'Haircut, Spa and Styling Package', blurb: 'Two-hour salon package for one',
    mrp: 3500, price: 1999, cta: 'book', also: ['call', 'directions'], cap: 24, left: 9, endsIn: 13, pubAgo: 8,
    days: [1, 2, 3, 4, 5, 6], from: '10:00', to: '20:00', tags: ['salon', 'spa', 'haircut', 'styling'],
    views: 2210, searches: 1130, booking: true },

  { id: 'd-015', biz: 'biz-ironhouse', cat: 'cat-services-fitness', type: 'free', kind: 'service',
    title: 'Free 7-Day Gym Trial', blurb: 'Full access, no card needed',
    mrp: 1400, price: 0, cta: 'claim', also: ['call', 'directions'], cap: 40, left: 22, endsIn: 21, pubAgo: 14,
    from: '06:00', to: '22:00', tags: ['gym', 'free trial', 'fitness'], views: 1680, searches: 720 },

  { id: 'd-016', biz: 'biz-urbanfix', cat: 'cat-services-repair', type: 'discount', kind: 'service',
    title: 'AC Service at Home', blurb: 'Deep clean and gas check, 90 minutes',
    mrp: 1200, price: 699, cta: 'book', also: ['call'], cap: 100, left: 61, endsIn: 30, pubAgo: 10,
    from: '08:00', to: '19:00', tags: ['ac service', 'home repair', 'cleaning'],
    views: 3080, searches: 1640, booking: true },

  { id: 'd-017', biz: 'biz-yogashala', cat: 'cat-services-fitness', type: 'discount', kind: 'service',
    title: 'Morning Yoga: 10-Class Pack', blurb: 'Hatha and Vinyasa, 6:30 AM batch',
    mrp: 4000, price: 2499, cta: 'book', also: ['call', 'directions'], cap: 20, left: 7, endsIn: 7, pubAgo: 2,
    days: [1, 2, 3, 4, 5], from: '06:30', to: '08:00', tags: ['yoga', 'morning', 'class pack'],
    views: 980, searches: 520, booking: true },

  { id: 'd-018', biz: 'biz-urbanfix', cat: 'cat-services-cleaning', type: 'service_package', kind: 'service',
    title: 'Full Home Deep Clean', blurb: '2BHK, 4-person crew, 5 hours',
    mrp: 5500, price: 3499, cta: 'enquire', also: ['call'], cap: 30, left: 18, endsIn: 28, pubAgo: 16,
    from: '08:00', to: '18:00', tags: ['deep clean', 'home', '2bhk'], views: 1540, searches: 810 },

  { id: 'd-019', biz: 'biz-glowsalon', cat: 'cat-services-makeup', type: 'flash', kind: 'service',
    title: 'Flash: Bridal Trial Makeup', blurb: 'Two slots left this week',
    mrp: 8000, price: 4500, cta: 'enquire', also: ['call'], cap: 4, left: 2, endsIn: 0.8, pubAgo: 0,
    from: '10:00', to: '18:00', tags: ['bridal', 'makeup', 'trial', 'flash'], views: 620, searches: 280 },

  // ---------- Events ----------
  { id: 'd-020', biz: 'biz-comedyhouse', cat: 'cat-events-comedy', type: 'booking', kind: 'event',
    title: 'Friday Night Comedy Show', blurb: 'Four comics, 90 minutes, one drink included',
    desc: 'An all-new line-up of Bengaluru stand-up regulars. Doors at 8 PM, show starts 8:30 PM sharp. Age 18 and above.',
    mrp: 799, price: 499, cta: 'book', also: ['call', 'directions'], cap: 120, left: 34, endsIn: 3, pubAgo: 4,
    days: [5], from: '20:00', to: '22:30', tags: ['comedy', 'standup', 'friday', 'night'],
    minAge: 18, views: 5680, searches: 3120, booking: true,
    cancel: 'Tickets are non-refundable but transferable up to 24 hours before.' },

  { id: 'd-021', biz: 'biz-fandango', cat: 'cat-events-music', type: 'booking', kind: 'event',
    title: 'Indie Live: Rooftop Gig', blurb: 'Three bands, food trucks, Saturday',
    mrp: 1200, price: 799, cta: 'book', also: ['directions'], cap: 300, left: 142, endsIn: 5, pubAgo: 6,
    days: [6], from: '18:00', to: '23:00', tags: ['music', 'live', 'indie', 'rooftop'],
    minAge: 18, views: 3420, searches: 1680, booking: true },

  { id: 'd-022', biz: 'biz-clayworks', cat: 'cat-events-workshop', type: 'experience', kind: 'experience',
    title: 'Pottery Wheel Workshop', blurb: 'Beginner session, take your piece home',
    mrp: 2500, price: 1599, cta: 'register', also: ['call', 'directions'], cap: 12, left: 3, endsIn: 6, pubAgo: 1,
    days: [0, 6], from: '11:00', to: '14:00', tags: ['pottery', 'workshop', 'weekend', 'craft'],
    views: 1860, searches: 940, booking: true },

  { id: 'd-023', biz: 'biz-openmic', cat: 'cat-events-comedy', type: 'free', kind: 'event',
    title: 'Open Mic Night: Free Entry', blurb: 'Perform or just watch, Wednesdays',
    mrp: 300, price: 0, cta: 'register', also: ['directions'], cap: 60, left: 41, endsIn: 2, pubAgo: 3,
    days: [3], from: '19:30', to: '22:00', tags: ['open mic', 'free', 'comedy', 'music'],
    minAge: 18, views: 2140, searches: 1020 },

  { id: 'd-024', biz: 'biz-fandango', cat: 'cat-events-nightlife', type: 'flash', kind: 'event',
    title: 'Last 20 Tickets: DJ Night', blurb: 'Tonight, doors at 9 PM',
    mrp: 1500, price: 899, cta: 'book', also: ['directions'], cap: 200, left: 20, endsIn: 0.4, pubAgo: 0,
    from: '21:00', to: '02:00', tags: ['dj', 'night', 'party', 'flash'],
    minAge: 21, views: 4210, searches: 2240, booking: true },

  { id: 'd-025', biz: 'biz-clayworks', cat: 'cat-events-workshop', type: 'experience', kind: 'experience',
    title: 'Watercolour Basics for Beginners', blurb: 'All materials provided, 3 hours',
    mrp: 1800, price: 1199, cta: 'register', also: ['call'], cap: 15, left: 8, endsIn: 12, pubAgo: 9,
    days: [6], from: '15:00', to: '18:00', tags: ['painting', 'watercolour', 'workshop'],
    views: 940, searches: 430, booking: true },

  // ---------- Mobility ----------
  { id: 'd-026', attrs: { vehicle: 'Car' }, biz: 'biz-bluecabs', cat: 'cat-mobility-cab', type: 'transport', kind: 'transport',
    title: 'Airport Cab, Flat Fare', blurb: 'Electronic City to KIA, sedan, all-in',
    desc: 'Flat fare including tolls and parking. Book at least 3 hours ahead. Meet and greet at the pickup point.',
    mrp: 1299, price: 499, cta: 'book', also: ['call'], cap: 80, left: 37, endsIn: 22, pubAgo: 13,
    from: '00:00', to: '23:59', tags: ['airport', 'cab', 'kia', 'flat fare'],
    views: 6480, searches: 3840, booking: true, cancel: 'Free cancellation up to 1 hour before pickup.' },

  { id: 'd-027', attrs: { vehicle: 'Scooty' }, biz: 'biz-zipbikes', cat: 'cat-mobility-rental', type: 'discount', kind: 'transport',
    title: 'Scooter Rental: Weekly Pack', blurb: 'Helmet and 300 km included',
    mrp: 2800, price: 1799, cta: 'reserve', also: ['call', 'directions'], cap: 25, left: 11, endsIn: 17, pubAgo: 5,
    from: '08:00', to: '20:00', tags: ['scooter', 'rental', 'weekly', 'bike'],
    views: 1920, searches: 1040, booking: true },

  { id: 'd-028', attrs: { vehicle: 'Car' }, biz: 'biz-bluecabs', cat: 'cat-mobility-cab', type: 'discount', kind: 'transport',
    title: 'Outstation: Bengaluru to Mysuru', blurb: 'Round trip, same day, SUV',
    mrp: 6500, price: 4299, cta: 'enquire', also: ['call'], cap: 15, left: 6, endsIn: 26, pubAgo: 18,
    from: '05:00', to: '22:00', tags: ['outstation', 'mysuru', 'road trip', 'suv'],
    views: 2240, searches: 1320 },

  // ---------- Property ----------
  { id: 'd-029', biz: 'biz-urbannest', cat: 'cat-property-rent', type: 'property', kind: 'property',
    title: '2BHK in HSR Layout', blurb: 'Semi-furnished, Sector 7, no brokerage',
    desc: 'East-facing 2BHK on the second floor with covered parking, 24x7 water and power backup. Walking distance to 27th Main.',
    mrp: 42000, price: 38000, unit: '/mo', cta: 'enquire', also: ['call', 'directions'], endsIn: 40, pubAgo: 7,
    from: '09:00', to: '19:00', tags: ['2bhk', 'rent', 'hsr', 'semi furnished', 'no brokerage'],
    attrs: { bhk: 2, area_sqft: 1150, furnishing: 'Semi-furnished', floor: 2, parking: true },
    views: 3840, searches: 2180, minSpend: 76000 },

  { id: 'd-030', biz: 'biz-coliveco', cat: 'cat-property-coliving', type: 'property', kind: 'property',
    title: 'Co-living Single Room, Marathahalli', blurb: 'All bills, meals and housekeeping included',
    mrp: 18000, price: 14500, unit: '/mo', cta: 'enquire', also: ['call'], endsIn: 35, pubAgo: 11,
    from: '09:00', to: '20:00', tags: ['coliving', 'pg', 'single room', 'marathahalli', 'furnished'],
    attrs: { bhk: 1, area_sqft: 180, furnishing: 'Fully furnished', meals: true, parking: false },
    views: 2680, searches: 1540 },

  { id: 'd-031', biz: 'biz-propkart', cat: 'cat-property-rent', type: 'property', kind: 'property',
    title: '3BHK in JP Nagar', blurb: 'Fully furnished, gated community',
    mrp: 62000, price: 55000, unit: '/mo', cta: 'enquire', also: ['call', 'directions'], endsIn: 45, pubAgo: 2,
    from: '09:00', to: '19:00', tags: ['3bhk', 'rent', 'jp nagar', 'furnished', 'gated'],
    attrs: { bhk: 3, area_sqft: 1680, furnishing: 'Fully furnished', floor: 5, parking: true },
    views: 1480, searches: 860 },

  { id: 'd-032', biz: 'biz-urbannest', cat: 'cat-property-rent', type: 'property', kind: 'property',
    title: '1BHK Studio, HSR Sector 2', blurb: 'Compact studio, ideal for one',
    mrp: 24000, price: 19500, unit: '/mo', cta: 'enquire', also: ['call'], endsIn: 38, pubAgo: 4,
    from: '09:00', to: '19:00', tags: ['1bhk', 'studio', 'rent', 'hsr'],
    attrs: { bhk: 1, area_sqft: 620, furnishing: 'Semi-furnished', floor: 3, parking: true },
    views: 2040, searches: 1180 },

  // ---------- Business ----------
  { id: 'd-033', biz: 'biz-hivedesk', cat: 'cat-business-coworking', type: 'business_offer', kind: 'service',
    title: 'Private Office Under 50,000', blurb: '6-seat cabin, Indiranagar, all-inclusive',
    desc: 'Lockable 6-seat cabin with high-speed internet, meeting-room credits, printing and pantry. Minimum 3-month term.',
    mrp: 68000, price: 48000, unit: '/mo', cta: 'enquire', also: ['call', 'directions'], cap: 8, left: 3, endsIn: 32, pubAgo: 6,
    days: [1, 2, 3, 4, 5], from: '08:00', to: '21:00', tags: ['office', 'coworking', 'private cabin', 'indiranagar'],
    attrs: { seats: 6, internet_mbps: 300, meeting_credits: 20 },
    views: 1860, searches: 1240 },

  { id: 'd-034', biz: 'biz-hivedesk', cat: 'cat-business-coworking', type: 'discount', kind: 'service',
    title: 'Hot Desk Monthly Pass', blurb: 'Any desk, any day, 24x7 access',
    mrp: 9000, price: 5999, unit: '/mo', cta: 'buy', also: ['directions'], cap: 40, left: 16, endsIn: 24, pubAgo: 8,
    from: '00:00', to: '23:59', tags: ['hot desk', 'coworking', 'monthly'],
    views: 2340, searches: 1420 },

  { id: 'd-035', biz: 'biz-printhub', cat: 'cat-business-b2b', type: 'business_offer', kind: 'service',
    title: 'Bulk Visiting Cards: 1000 Pcs', blurb: 'Matte lamination, free design, 48h',
    mrp: 3200, price: 1799, cta: 'enquire', also: ['call'], cap: 50, left: 34, endsIn: 29, pubAgo: 17,
    days: [1, 2, 3, 4, 5, 6], from: '10:00', to: '19:00', tags: ['printing', 'visiting cards', 'bulk', 'b2b'],
    views: 820, searches: 460 },

  { id: 'd-036', biz: 'biz-printhub', cat: 'cat-business-b2b', type: 'discount', kind: 'service',
    title: 'Shop Signage and Banners', blurb: 'Flex printing, installation included',
    mrp: 8500, price: 5900, cta: 'enquire', also: ['call'], cap: 20, left: 12, endsIn: 27, pubAgo: 19,
    from: '10:00', to: '19:00', tags: ['signage', 'banner', 'printing', 'shop'],
    views: 540, searches: 290 },

  // ---------- Retail ----------
  { id: 'd-037', biz: 'biz-decathlon', cat: 'cat-retail-fashion', type: 'discount', kind: 'product',
    title: 'Running Shoes: Flat 40% Off', blurb: 'Selected models, all sizes',
    mrp: 4499, price: 2699, cta: 'buy', also: ['directions'], cap: 200, left: 84, endsIn: 8, pubAgo: 5,
    from: '10:00', to: '21:30', tags: ['shoes', 'running', 'sports', 'sale'],
    views: 4120, searches: 2080 },

  { id: 'd-038', biz: 'biz-techbazaar', cat: 'cat-retail-electronics', type: 'discount', kind: 'product',
    title: 'Wireless Earbuds Clearance', blurb: 'Last season stock, 1-year warranty',
    mrp: 3999, price: 1499, cta: 'buy', also: ['call', 'directions'], cap: 60, left: 19, endsIn: 2, pubAgo: 3,
    from: '10:30', to: '20:30', tags: ['earbuds', 'electronics', 'clearance', 'wireless'],
    views: 3280, searches: 1740 },

  { id: 'd-039', biz: 'biz-freshkart', cat: 'cat-retail-grocery', type: 'bundle', kind: 'product',
    title: 'Organic Veggie Basket', blurb: '5 kg mixed seasonal produce',
    mrp: 850, price: 549, cta: 'buy', also: ['directions'], cap: 80, left: 42, endsIn: 1.5, pubAgo: 2,
    from: '07:00', to: '21:00', tags: ['organic', 'vegetables', 'grocery', 'basket'],
    views: 1640, searches: 920 },

  { id: 'd-040', biz: 'biz-threadco', cat: 'cat-retail-fashion', type: 'bxgy', kind: 'product',
    title: 'Buy 2 Get 1: Cotton Shirts', blurb: 'Handloom cotton, all colours',
    mrp: 2970, price: 1980, cta: 'buy', also: ['directions'], cap: 100, left: 58, endsIn: 15, pubAgo: 10,
    from: '11:00', to: '21:00', tags: ['shirts', 'cotton', 'bogo', 'handloom'],
    views: 1180, searches: 640 },

  { id: 'd-041', biz: 'biz-decathlon', cat: 'cat-retail-fashion', type: 'flash', kind: 'product',
    title: 'Flash: Yoga Mats at 299', blurb: '6 mm thickness, 40 left',
    mrp: 999, price: 299, cta: 'buy', also: ['directions'], cap: 40, left: 9, endsIn: 0.5, pubAgo: 0,
    from: '10:00', to: '21:30', tags: ['yoga mat', 'flash', 'fitness'],
    views: 2480, searches: 1340 },

  { id: 'd-042', biz: 'biz-freshkart', cat: 'cat-retail-grocery', type: 'free', kind: 'product',
    title: 'Free Cold-Pressed Juice', blurb: 'On grocery bills above 999',
    mrp: 180, price: 0, cta: 'claim', also: ['directions'], cap: 120, left: 76, endsIn: 19, pubAgo: 12,
    from: '07:00', to: '21:00', tags: ['juice', 'free', 'grocery'],
    views: 980, searches: 440, minSpend: 999 },

  { id: 'd-043', biz: 'biz-techbazaar', cat: 'cat-retail-electronics', type: 'discount', kind: 'product',
    title: 'Laptop Service and Upgrade', blurb: 'SSD upgrade with free diagnostics',
    mrp: 6500, price: 4200, cta: 'enquire', also: ['call', 'directions'], cap: 30, left: 21, endsIn: 23, pubAgo: 14,
    from: '10:30', to: '20:00', tags: ['laptop', 'ssd', 'repair', 'upgrade'],
    views: 1340, searches: 780 },

  // ---------- Community ----------
  { id: 'd-044', biz: 'biz-skillcamp', cat: 'cat-events-classes', type: 'experience', kind: 'experience',
    title: 'Spoken Kannada Crash Course', blurb: '8 sessions, conversation-first',
    desc: 'Learn everyday Kannada for autos, markets and neighbours. Small batches of 10, taught conversation-first with no grammar drills.',
    mrp: 4500, price: 2999, cta: 'register', also: ['call', 'directions'], cap: 10, left: 4, endsIn: 10, pubAgo: 2,
    days: [2, 4], from: '19:00', to: '20:30', tags: ['kannada', 'language', 'class', 'course'],
    views: 2840, searches: 1680, booking: true },

  { id: 'd-045', biz: 'biz-greencity', cat: 'cat-events-volunteer', type: 'community', kind: 'experience',
    title: 'Lake Cleanup Drive', blurb: 'Sunday morning, gloves and breakfast provided',
    mrp: 0, price: 0, cta: 'register', also: ['directions'], cap: 100, left: 63, endsIn: 4, pubAgo: 3,
    days: [0], from: '06:30', to: '09:30', tags: ['volunteer', 'lake', 'cleanup', 'environment', 'free'],
    views: 1240, searches: 380 },

  { id: 'd-046', biz: 'biz-skillcamp', cat: 'cat-events-classes', type: 'discount', kind: 'experience',
    title: 'Weekend Guitar Classes', blurb: 'Beginner batch, guitar provided',
    mrp: 6000, price: 3999, cta: 'register', also: ['call'], cap: 12, left: 5, endsIn: 14, pubAgo: 6,
    days: [0, 6], from: '10:00', to: '11:30', tags: ['guitar', 'music', 'class', 'weekend'],
    views: 1480, searches: 820, booking: true },

  { id: 'd-047', biz: 'biz-greencity', cat: 'cat-events-volunteer', type: 'community', kind: 'experience',
    title: 'Teach Coding to Kids', blurb: 'Two hours a week, training given',
    mrp: 0, price: 0, cta: 'enquire', also: ['call'], cap: 25, left: 14, endsIn: 31, pubAgo: 15,
    days: [6], from: '15:00', to: '17:00', tags: ['volunteer', 'teaching', 'coding', 'kids', 'free'],
    views: 680, searches: 240 },

  // ---------- More food for density ----------
  { id: 'd-048', attrs: { cuisine: 'Biryani' }, biz: 'biz-meghana', cat: 'cat-food-lunch', type: 'time_based', kind: 'meal',
    title: 'Express Lunch Under 300', blurb: 'Rice bowl, curry and dessert, 30 min',
    mrp: 420, price: 279, cta: 'claim', also: ['directions'], cap: 100, left: 73, endsIn: 13, pubAgo: 1,
    days: [1, 2, 3, 4, 5], from: '12:30', to: '15:00', tags: ['lunch', 'express', 'rice bowl', 'under 300'],
    views: 2180, searches: 1640 },

  { id: 'd-049', attrs: { cuisine: 'Italian' }, biz: 'biz-toitbrew', cat: 'cat-food-dinner', type: 'bundle', kind: 'meal',
    title: 'Pizza and Pitcher Combo', blurb: '12-inch pizza with a beer pitcher',
    mrp: 1450, price: 999, cta: 'reserve', also: ['call', 'directions'], cap: 50, left: 24, endsIn: 9, pubAgo: 7,
    days: [4, 5, 6], from: '18:00', to: '23:30', tags: ['pizza', 'beer', 'combo', 'pub'],
    minAge: 21, views: 3640, searches: 1920, booking: true },

  { id: 'd-050', attrs: { cuisine: 'Continental' }, biz: 'biz-thirdwave', cat: 'cat-food-brunch', type: 'discount', kind: 'meal',
    title: 'All-Day Breakfast Plate', blurb: 'Eggs, sourdough, hash and juice',
    mrp: 580, price: 399, cta: 'claim', also: ['directions'], cap: 70, left: 38, endsIn: 11, pubAgo: 4,
    from: '08:00', to: '18:00', tags: ['breakfast', 'eggs', 'brunch', 'all day'],
    views: 1920, searches: 1080 },

  { id: 'd-051', attrs: { cuisine: 'South Indian' }, biz: 'biz-southspice', cat: 'cat-food-dinner', type: 'discount', kind: 'meal',
    title: 'Family Dinner Pack for 4', blurb: 'Chapati, two curries, rice and sweet',
    mrp: 980, price: 649, cta: 'buy', also: ['call', 'directions'], cap: 45, left: 27, endsIn: 12, pubAgo: 9,
    from: '19:00', to: '22:30', tags: ['family', 'dinner', 'pack', 'vegetarian'],
    views: 1420, searches: 760 },

  { id: 'd-052', attrs: { cuisine: 'Desserts' }, biz: 'biz-cafenoir', cat: 'cat-food-cafe', type: 'time_based', kind: 'meal',
    title: 'Evening Tea and Pastry', blurb: 'Any tea with a pastry, 4 to 7 PM',
    mrp: 420, price: 249, cta: 'claim', also: ['directions'], cap: 60, left: 44, endsIn: 16, pubAgo: 11,
    from: '16:00', to: '19:00', tags: ['tea', 'pastry', 'evening', 'cafe'],
    views: 860, searches: 410 },

  { id: 'd-053', attrs: { cuisine: 'Japanese' }, biz: 'biz-sushibar', cat: 'cat-food-lunch', type: 'discount', kind: 'meal',
    title: 'Bento Box Lunch', blurb: 'Veg or chicken, miso and salad included',
    mrp: 650, price: 449, cta: 'claim', also: ['call', 'directions'], cap: 40, left: 21, endsIn: 7, pubAgo: 2,
    days: [1, 2, 3, 4, 5], from: '12:00', to: '15:00', tags: ['bento', 'lunch', 'japanese'],
    views: 1180, searches: 690 },

  { id: 'd-054', biz: 'biz-cultfit', cat: 'cat-services-fitness', type: 'flash', kind: 'service',
    title: 'Flash: Personal Training Pack', blurb: '10 sessions, one trainer, today only',
    mrp: 20000, price: 11999, cta: 'enquire', also: ['call'], cap: 6, left: 2, endsIn: 0.7, pubAgo: 0,
    from: '06:00', to: '21:00', tags: ['personal training', 'flash', 'gym'],
    views: 1640, searches: 880 },

  { id: 'd-055', biz: 'biz-comedyhouse', cat: 'cat-events-comedy', type: 'booking', kind: 'event',
    title: 'Sunday Improv Jam', blurb: 'Audience-driven, 75 minutes',
    mrp: 600, price: 349, cta: 'book', also: ['directions'], cap: 80, left: 47, endsIn: 5, pubAgo: 1,
    days: [0], from: '19:00', to: '20:30', tags: ['improv', 'comedy', 'sunday'],
    minAge: 16, views: 1340, searches: 620, booking: true },

  { id: 'd-056', attrs: { vehicle: 'Bike' }, biz: 'biz-zipbikes', cat: 'cat-mobility-rental', type: 'free', kind: 'transport',
    title: 'First Ride Free: E-Bike', blurb: 'Up to 10 km, new users',
    mrp: 150, price: 0, cta: 'claim', also: ['directions'], cap: 200, left: 127, endsIn: 20, pubAgo: 13,
    from: '06:00', to: '22:00', tags: ['ebike', 'free', 'first ride', 'rental'],
    views: 2240, searches: 1140 },

  // ---------- Subcategories added with the category pages ----------
  { id: 'd-057', biz: 'biz-glowsalon', cat: 'cat-services-facials', type: 'discount', kind: 'service',
    title: 'Hydra Facial with Cleanup', blurb: '60 minutes, all skin types',
    desc: 'Deep cleanse, exfoliation, extraction and hydration in one sitting, finished with a cooling mask. Patch test on request.',
    mrp: 3200, price: 1899, cta: 'book', also: ['call'], cap: 24, left: 15, endsIn: 18, pubAgo: 2,
    days: [1, 2, 3, 4, 5, 6], from: '10:00', to: '20:00', tags: ['facial', 'skin', 'hydra', 'glow'],
    views: 980, searches: 430, booking: true },

  { id: 'd-058', biz: 'biz-propkart', cat: 'cat-property-villa', type: 'property', kind: 'property',
    title: '3BHK Villa, JP Nagar', blurb: 'Independent villa with terrace and garden',
    desc: 'Two-floor independent villa in a quiet lane off 24th Main: three bedrooms, terrace, small garden and two-car parking.',
    mrp: 85000, price: 76000, unit: '/mo', cta: 'enquire', also: ['call', 'directions'], endsIn: 35, pubAgo: 4,
    from: '09:00', to: '19:00', tags: ['3bhk', 'villa', 'independent', 'jp nagar', 'garden'],
    attrs: { bhk: 3, area_sqft: 2400, furnishing: 'Semi-furnished', parking: true },
    views: 1260, searches: 640, minSpend: 152000 },

  { id: 'd-059', attrs: { vehicle: 'Bike' }, biz: 'biz-zipbikes', cat: 'cat-mobility-rental', type: 'discount', kind: 'transport',
    title: 'Royal Enfield Weekend Rental', blurb: 'Classic 350, Saturday to Monday',
    mrp: 3600, price: 2499, cta: 'reserve', also: ['call', 'directions'], cap: 12, left: 5, endsIn: 21, pubAgo: 6,
    days: [5, 6], from: '08:00', to: '20:00', tags: ['bike', 'royal enfield', 'weekend', 'rental'],
    views: 1420, searches: 690, booking: true, minAge: 18 },

  // ---------- Vehicle care: every service around a vehicle ----------
  { id: 'd-060', biz: 'biz-thundergarage', cat: 'cat-services-vehicle', type: 'service_package', kind: 'service',
    title: 'Royal Enfield General Service', blurb: 'Oil change, chain clean and a 30-point check',
    desc: 'Periodic service by mechanics trained on Royal Enfield: engine oil and filter, chain clean and lube, brake and clutch adjustment, electricals check and a wash. Free pick-up and drop within 5 km. Any repair beyond the service is quoted before work starts.',
    mrp: 2400, price: 1499, cta: 'book', also: ['call', 'directions'], cap: 30, left: 11, endsIn: 18, pubAgo: 2,
    days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '19:00',
    tags: ['royal enfield', 'bike service', 'oil change', 'repair', 'servicing'], fits: ['royal-enfield'],
    views: 1980, searches: 1130, booking: true },

  { id: 'd-061', biz: 'biz-thundergarage', cat: 'cat-services-vehicle', type: 'bundle', kind: 'product',
    title: 'Touring Kit for Royal Enfield', blurb: 'Crash guard, saddle stays and tank bag, fitted',
    desc: 'Everything for a long ride, fitted while you wait: a powder-coated crash guard, saddle stays for soft panniers and a magnetic tank bag. Fits the Classic, Bullet, Hunter, Meteor and Himalayan.',
    mrp: 6200, price: 4299, cta: 'reserve', also: ['call'], cap: 15, left: 6, endsIn: 12, pubAgo: 4,
    days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '19:00',
    tags: ['royal enfield', 'touring', 'accessories', 'crash guard'], fits: ['royal-enfield'],
    views: 860, searches: 420 },

  { id: 'd-062', biz: 'biz-sparkwash', cat: 'cat-services-vehicle', type: 'discount', kind: 'service',
    title: 'Bike Foam Wash and Polish', blurb: 'Foam wash, chain lube and tyre shine in 30 minutes',
    mrp: 350, price: 199, cta: 'claim', also: ['directions'], cap: 120, left: 74, endsIn: 15, pubAgo: 1,
    from: '08:00', to: '20:00', tags: ['bike wash', 'foam wash', 'polish', 'two wheeler'], fits: ['bike', 'scooter'],
    views: 1540, searches: 980 },

  { id: 'd-063', biz: 'biz-sparkwash', cat: 'cat-services-vehicle', type: 'discount', kind: 'service',
    title: 'Car Foam Wash and Interior Clean', blurb: 'Foam wash, vacuum and dashboard polish',
    mrp: 1600, price: 899, cta: 'book', also: ['call', 'directions'], cap: 60, left: 27, endsIn: 10, pubAgo: 3,
    from: '08:00', to: '20:00', tags: ['car wash', 'interior cleaning', 'foam wash', 'detailing'], fits: ['car'],
    views: 1320, searches: 760, booking: true },

  { id: 'd-064', biz: 'biz-tyrehub', cat: 'cat-services-vehicle', type: 'discount', kind: 'service',
    title: 'Wheel Alignment and Balancing', blurb: 'Computerised alignment, all four wheels',
    mrp: 900, price: 499, cta: 'book', also: ['call', 'directions'], cap: 50, left: 31, endsIn: 22, pubAgo: 6,
    days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '19:00',
    tags: ['wheel alignment', 'balancing', 'tyres', 'car service'], fits: ['car'], views: 720, searches: 390 },

  { id: 'd-065', biz: 'biz-tyrehub', cat: 'cat-services-vehicle', type: 'service_package', kind: 'service',
    title: 'Scooter General Service', blurb: 'Activa, Jupiter, Access and more: oil, brakes, battery',
    mrp: 999, price: 649, cta: 'book', also: ['call'], cap: 40, left: 22, endsIn: 16, pubAgo: 5,
    days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '18:00',
    tags: ['scooter service', 'activa', 'jupiter', 'oil change', 'servicing'], fits: ['scooter'],
    views: 1110, searches: 640 },

  { id: 'd-066', biz: 'biz-tyrehub', cat: 'cat-services-vehicle', type: 'service_package', kind: 'service',
    title: 'Car Periodic Service', blurb: 'Engine oil, filters and a 50-point inspection',
    mrp: 4800, price: 2999, cta: 'book', also: ['call', 'directions'], cap: 25, left: 9, endsIn: 19, pubAgo: 2,
    days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '19:00',
    tags: ['car service', 'oil change', 'servicing', 'inspection'], fits: ['car'],
    views: 940, searches: 520, booking: true },

  { id: 'd-067', biz: 'biz-decathlon', cat: 'cat-retail-fashion', type: 'discount', kind: 'product',
    title: 'Riding Jacket and Gloves: 30% Off', blurb: 'CE-rated armour, for bikes and scooters',
    mrp: 5999, price: 4199, cta: 'claim', also: ['directions'], cap: 40, left: 18, endsIn: 14, pubAgo: 3,
    from: '10:00', to: '21:00', tags: ['riding gear', 'jacket', 'gloves', 'safety'], fits: ['bike', 'scooter'],
    views: 870, searches: 450 },

  // ---------- Cheap chicken ----------
  { id: 'd-068', attrs: { cuisine: 'Mughlai' }, biz: 'biz-kebabco', cat: 'cat-food-dinner', type: 'discount', kind: 'meal',
    title: 'Chicken Seekh Kebab Plate', blurb: 'Four seekh kebabs, rumali roti and mint chutney',
    mrp: 280, price: 179, cta: 'claim', also: ['call', 'directions'], cap: 100, left: 58, endsIn: 12, pubAgo: 1,
    from: '12:00', to: '23:00', tags: ['chicken', 'kebab', 'seekh', 'non-veg'], views: 1680, searches: 940 },

  { id: 'd-069', attrs: { cuisine: 'Mughlai' }, biz: 'biz-kebabco', cat: 'cat-food-lunch', type: 'bundle', kind: 'meal',
    title: 'Chicken Roll Combo', blurb: 'Chicken tikka roll with fries and a cold drink',
    mrp: 240, price: 149, cta: 'claim', also: ['directions'], cap: 150, left: 96, endsIn: 9, pubAgo: 2,
    from: '11:00', to: '23:00', tags: ['chicken', 'roll', 'wrap', 'combo', 'non-veg'], views: 2040, searches: 1210 },

  // ---------- Group deals: priced for a set number of people ----------
  { id: 'd-070', attrs: { cuisine: 'Biryani' }, biz: 'biz-meghana', cat: 'cat-food-dinner', type: 'bundle', kind: 'meal',
    title: 'Biryani Feast for 5', blurb: 'Two biryanis, two starters, raita and dessert',
    desc: 'Built for a table of four to six: one chicken and one mutton biryani (family size), chicken 65, paneer pepper fry, raita, salan and a gulab jamun each.',
    mrp: 2400, price: 1599, cta: 'reserve', also: ['call', 'directions'], cap: 30, left: 14, endsIn: 11, pubAgo: 2,
    from: '12:00', to: '23:00', tags: ['biryani', 'group', 'feast', 'chicken', 'sharing'], party: [4, 6],
    views: 1460, searches: 820, booking: true },

  { id: 'd-071', attrs: { cuisine: 'North Indian' }, biz: 'biz-tandoor', cat: 'cat-food-dinner', type: 'bundle', kind: 'meal',
    title: 'Tandoori Platter for 4', blurb: 'Chicken tikka, paneer tikka, kebabs and a naan basket',
    mrp: 1800, price: 1199, cta: 'reserve', also: ['call', 'directions'], cap: 40, left: 19, endsIn: 13, pubAgo: 3,
    from: '19:00', to: '23:00', tags: ['tandoori', 'platter', 'chicken', 'paneer', 'group'], party: [3, 5],
    views: 980, searches: 540 },

  { id: 'd-072', biz: 'biz-comedyhouse', cat: 'cat-events-comedy', type: 'booking', kind: 'event',
    title: 'Comedy Night: Group of 5', blurb: 'Five tickets, a reserved table and one pitcher',
    mrp: 3000, price: 1999, cta: 'book', also: ['directions'], cap: 20, left: 8, endsIn: 6, pubAgo: 1,
    days: [5, 6], from: '20:00', to: '22:00', tags: ['comedy', 'group', 'friends', 'tickets'], party: [5, 5],
    minAge: 18, views: 760, searches: 410, booking: true },

  { id: 'd-073', biz: 'biz-glowsalon', cat: 'cat-services-salon', type: 'bundle', kind: 'service',
    title: "Couple's Spa Day", blurb: 'Side-by-side massage and steam for two',
    mrp: 5200, price: 3499, cta: 'book', also: ['call'], cap: 16, left: 7, endsIn: 17, pubAgo: 4,
    days: [1, 2, 3, 4, 5, 6], from: '10:00', to: '20:00', tags: ['spa', 'couple', 'massage', 'date'], party: [2, 2],
    views: 1120, searches: 680, booking: true },

  { id: 'd-074', attrs: { cuisine: 'Bar Food' }, biz: 'biz-toitbrew', cat: 'cat-food-bar', type: 'bundle', kind: 'meal',
    title: 'Party Pack: 3 Pitchers and Platters', blurb: 'For six to eight friends, with a reserved table',
    mrp: 4200, price: 2999, cta: 'reserve', also: ['call', 'directions'], cap: 15, left: 6, endsIn: 8, pubAgo: 2,
    days: [4, 5, 6], from: '18:00', to: '23:00', tags: ['beer', 'party', 'group', 'pitchers', 'platter'], party: [6, 8],
    minAge: 21, views: 1290, searches: 610, booking: true },

  { id: 'd-075', biz: 'biz-fandango', cat: 'cat-events-music', type: 'bundle', kind: 'event',
    title: 'Gig Tickets: Pack of 4', blurb: "Four entries to Saturday's rooftop gig",
    mrp: 2400, price: 1599, cta: 'book', also: ['directions'], cap: 25, left: 12, endsIn: 7, pubAgo: 1,
    days: [6], from: '18:00', to: '23:00', tags: ['gig', 'music', 'group', 'tickets'], party: [4, 4],
    views: 690, searches: 330 },

  { id: 'd-076', attrs: { cuisine: 'Continental' }, biz: 'biz-brunchclub', cat: 'cat-food-brunch', type: 'bundle', kind: 'meal',
    title: 'Family Sunday Brunch for 4', blurb: 'Two adults, two kids, unlimited spread',
    mrp: 2600, price: 1799, cta: 'reserve', also: ['call'], cap: 20, left: 9, endsIn: 9, pubAgo: 3,
    days: [0], from: '11:00', to: '16:00', tags: ['brunch', 'family', 'kids', 'sunday'], party: [4, 4],
    views: 840, searches: 420, booking: true },
];

/**
 * Photos: free Unsplash images (Unsplash License), each chosen to show what
 * its deal is about, so a chai deal shows chai. Keyed by deal id, with a
 * per-category fallback for anything not listed.
 *
 * d-902 is deliberately off-topic: it is the demo's rejected deal, sent back
 * because "the offer image does not show the actual product".
 */
const PHOTO: Record<string, string> = {
  'd-001': '1567620905732-2d1ec7ab7445', // pancakes, brunch
  'd-002': '1742281258189-3b933879867a', // thali on a banana leaf
  'd-003': '1495474472287-4d71bcdd2085', // two coffees
  'd-004': '1589302168068-964664d93dc0', // biryani
  'd-005': '1535958636474-b021ee887b13', // beer on tap
  'd-006': '1630383249896-424e482df921', // idli, vada
  'd-007': '1553621042-f6e147245754', // sushi boat
  'd-008': '1533134242443-d4fd215305ad', // cheesecake
  'd-009': '1585937421612-70a008356fbe', // curries
  'd-010': '1571934811356-5cc061b6821f', // tea
  'd-011': '1668236543090-82eba5ee5976', // dosa
  'd-012': '1509042239860-f550ce710b93', // coffee and plants
  'd-013': '1534438327276-14e5300c3a48', // gym floor
  'd-014': '1560066984-138dadb4c035', // salon
  'd-015': '1571019613454-1cb2f99b2d8b', // workout
  'd-016': '1621905251189-08b45d6a269e', // technician
  'd-017': '1544367567-0f2fcb009e0b', // yoga at sunrise
  'd-018': '1581578731548-c64695cc6952', // cleaning
  'd-019': '1487412947147-5cebf100ffc2', // makeup
  'd-020': '1527224857830-43a7acc85260', // LAUGH neon
  'd-021': '1459749411175-04bf5292ceea', // live gig
  'd-022': '1493106641515-6b5631de4bb9', // pottery wheel
  'd-023': '1585699324551-f6c309eedeca', // stage
  'd-024': '1470225620780-dba8ba36b745', // DJ decks
  'd-025': '1513364776144-60967b0f800f', // paints and brush
  'd-026': '1449965408869-eaa3f722e40d', // driving
  'd-027': '1558981403-c5f9899a28bc', // two-wheeler
  'd-028': '1469854523086-cc02fe5d8800', // road trip
  'd-029': '1502672260266-1c1ef2d93688', // living room
  'd-030': '1524758631624-e2822e304c36', // shared lounge
  'd-031': '1522708323590-d24dbb6b0267', // apartment
  'd-032': '1502672260266-1c1ef2d93688', // studio
  'd-033': '1497366216548-37526070297c', // office
  'd-034': '1497215728101-856f4ea42174', // hot desks
  'd-035': '1563986768609-322da13575f3', // work on laptop
  'd-036': '1441986300917-64674bd600d8', // shopfront
  'd-037': '1542291026-7eec264c27ff', // running shoe
  'd-038': '1590658268037-6bf12165a8df', // earbuds
  'd-039': '1488459716781-31db52582fe9', // veg market
  'd-040': '1489987707025-afc232f7ea0f', // shirts
  'd-041': '1601925260368-ae2f83cf8b7f', // yoga mats
  'd-042': '1622597467836-f3285f2131b8', // cold-pressed juice
  'd-043': '1517336714731-489689fd1ca8', // laptop
  'd-044': '1524178232363-1fb2b075b655', // classroom
  'd-045': '1618477461853-cf6ed80faba5', // cleanup
  'd-046': '1510915361894-db8b60106cb1', // guitar
  'd-047': '1515879218367-8466d910aaa4', // code
  'd-048': '1546069901-ba9599a7e63c', // lunch bowl
  'd-049': '1565299624946-b28f40a0ae38', // pizza
  'd-050': '1533089860892-a7c6f0a88666', // breakfast plate
  'd-051': '1504754524776-8f4f37790ca0', // spread for the table
  'd-052': '1561336313-0bd5e0b27ec8', // coffees
  'd-053': '1569050467447-ce54b3bbc37d', // katsu
  'd-054': '1534438327276-14e5300c3a48', // gym floor
  'd-055': '1503095396549-807759245b35', // stage silhouettes
  'd-056': '1571068316344-75bc76f77890', // bicycle
  'd-057': '1570172619644-dfd03ed5d881', // facial
  'd-058': '1560448204-e02f11c3d0e2', // villa living room
  'd-059': '1558981806-ec527fa84c39', // motorcycle
  'd-060': '1619642751034-765dfdf7c58e', // mechanic at work
  'd-061': '1558618666-fcd25c85cd64', // workshop tools
  'd-062': '1609630875171-b1321377ee65', // gleaming bike
  'd-063': '1607860108855-64acf2078ed9', // car foam wash
  'd-064': '1625047509248-ec889cbff17f', // under the bonnet
  'd-065': '1599256872237-5dcc0fbe9668', // hands on an engine
  'd-066': '1486262715619-67b85e0b08d3', // engine bay
  'd-067': '1558980664-10e7170b5df9', // rider in full gear
  'd-068': '1555939594-58d7cb561ad1', // kebabs on the grill
  'd-069': '1626700051175-6818013e1d4f', // chicken wraps
  'd-070': '1528605248644-14dd04022da1', // a big table eating together
  'd-071': '1599487488170-d11ec9c172f0', // tandoori skewers
  'd-072': '1540575467063-178a50c2df87', // audience
  'd-073': '1600334089648-b0d9d3028eb2', // hot-stone massage
  'd-074': '1543007630-9710e4a00a20', // bar
  'd-075': '1517457373958-b7bdd4587205', // crowd under lights
  'd-076': '1511795409834-ef04bbd61622', // long table set for brunch
  'd-900': '1699708263762-00ca477760bd', // kaju katli, for a festive sweets box
  'd-901': '1589301760014-d929f3979dbc', // idli on banana leaf
  'd-902': '1565193566173-7a0ee3dbe261', // vases: deliberately not coffee
  'd-910': '1571019613454-1cb2f99b2d8b', // workout
  'd-911': '1560448204-e02f11c3d0e2', // villa
};

/** When a deal has no photo of its own: one per top-level category. */
const CATEGORY_PHOTO: Record<string, string> = {
  food: '1504674900247-0877df9cc836',
  services: '1560066984-138dadb4c035',
  events: '1501281668745-f7f57925c3b4',
  mobility: '1449965408869-eaa3f722e40d',
  property: '1522708323590-d24dbb6b0267',
  business: '1497366216548-37526070297c',
  retail: '1441986300917-64674bd600d8',
  community: '1618477461853-cf6ed80faba5',
};

/** Group sizes for deals written before party sizes existed. */
const PARTY: Record<string, [number, number]> = {
  'd-001': [2, 2], // brunch for two
  'd-004': [3, 4], // family pack, serves 4
  'd-005': [2, 6], // pitchers
  'd-007': [2, 2], // sushi for two
  'd-012': [2, 2], // two coffees
  'd-049': [2, 3], // pizza and a pitcher
  'd-051': [4, 4], // family dinner for 4
};

/** What is in a dish, so "chicken" or "veg" finds it when the title does not say. */
const EXTRA_TAGS: Record<string, string[]> = {
  'd-002': ['veg'],
  'd-006': ['veg'],
  'd-009': ['chicken', 'paneer'],
  'd-011': ['veg'],
  'd-048': ['chicken'],
  'd-053': ['chicken', 'veg'],
};

function attributesFor(s: DealSeed): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = { ...(s.attrs ?? {}) };
  const party = s.party ?? PARTY[s.id];
  if (party) {
    out.party_min = party[0];
    out.party_max = party[1];
  }
  if (s.fits) out.vehicles = s.fits;
  return out;
}

function photoFor(id: string, categoryId: string): string {
  const vertical = categoryId.split('-')[1] ?? 'food';
  const key = PHOTO[id] ?? CATEGORY_PHOTO[vertical] ?? CATEGORY_PHOTO.food;
  return 'https://images.unsplash.com/photo-' + key + '?w=800&h=600&fit=crop&q=70&auto=format';
}

function expand(s: DealSeed): Deal {
  const mrp = s.mrp ?? null;
  const price = s.price ?? null;
  const discount =
    mrp !== null && price !== null && mrp > 0 ? Math.round((1 - price / mrp) * 1000) / 10 : null;
  const biz = businessById(s.biz);

  return {
    id: s.id,
    business_id: s.biz,
    category_id: s.cat,
    deal_type_code: s.type,
    offering_kind: s.kind,
    title: s.title,
    short_description: s.blurb,
    description: s.desc ?? s.blurb,
    status: 'ACTIVE',
    original_price: mrp,
    deal_price: price,
    discount_pct: discount,
    price_unit: s.unit ?? null,
    taxes_note: s.taxes ?? null,
    min_purchase: s.minSpend ?? null,
    max_qty_per_customer: 2,
    starts_at: iso(NOW - (s.pubAgo ?? 5) * DAY),
    ends_at: iso(NOW + s.endsIn * DAY),
    capacity_total: s.cap ?? null,
    capacity_remaining: s.left ?? null,
    booking_required: s.booking ?? false,
    cancellation_policy: s.cancel ?? null,
    terms:
      s.terms ??
      'Valid at the listed outlet only. Cannot be combined with other offers. Management reserves the right of admission.',
    attributes: attributesFor(s),
    tags: [...(s.tags ?? []), ...(EXTRA_TAGS[s.id] ?? [])],
    location: biz.location,
    image: photoFor(s.id, s.cat),
    primary_cta: s.cta,
    secondary_ctas: s.also ?? [],
    availability: {
      days: s.days ?? [],
      start_time: s.from ?? '09:00',
      end_time: s.to ?? '21:00',
    },
    eligibility: {
      audience: 'everyone',
      min_age: s.minAge ?? null,
      min_spend: s.minSpend ?? null,
      membership_required: false,
      advance_booking_hours: s.booking ? 2 : null,
      custom_rule: null,
    },
    rejection_reason: null,
    published_at: iso(NOW - (s.pubAgo ?? 5) * DAY),
    rating_avg: biz.rating_avg,
    rating_count: Math.round(biz.rating_count / 6),
    created_at: iso(NOW - ((s.pubAgo ?? 5) + 1) * DAY),
    views: s.views ?? 0,
    searches: s.searches ?? 0,
  };
}

export const SEED_DEALS: Deal[] = SEED.map(expand);

/**
 * Deals the demo merchant already has in flight, so the merchant dashboard and
 * the admin review queue are not empty on first run.
 */
export const SEED_PIPELINE_DEALS: Deal[] = [
  {
    ...expand({
      id: 'd-900', attrs: { cuisine: 'Desserts' }, biz: 'biz-rangoli', cat: 'cat-food-dinner', type: 'discount', kind: 'meal',
      title: 'Festive Sweets Hamper', blurb: 'Assorted box of 12, limited run',
      mrp: 1200, price: 849, cta: 'buy', cap: 50, left: 50, endsIn: 20, pubAgo: 0,
      tags: ['sweets', 'festive', 'hamper'],
    }),
    status: 'SUBMITTED',
    published_at: null,
    views: 0,
    searches: 0,
  },
  {
    ...expand({
      id: 'd-901', attrs: { cuisine: 'South Indian' }, biz: 'biz-rangoli', cat: 'cat-food-lunch', type: 'bundle', kind: 'meal',
      title: 'Corporate Lunch Subscription', blurb: 'Weekday meals delivered to your office',
      mrp: 6000, price: 4499, unit: '/mo', cta: 'enquire', cap: 30, left: 30, endsIn: 30, pubAgo: 0,
      tags: ['corporate', 'subscription', 'lunch'],
    }),
    status: 'DRAFT',
    published_at: null,
    views: 0,
    searches: 0,
  },
  {
    ...expand({
      id: 'd-902', attrs: { cuisine: 'Cafe' }, biz: 'biz-rangoli', cat: 'cat-food-cafe', type: 'discount', kind: 'meal',
      title: 'Filter Coffee Unlimited', blurb: 'Refills all evening',
      mrp: 200, price: 99, cta: 'claim', cap: 80, left: 80, endsIn: 18, pubAgo: 1,
      tags: ['coffee', 'unlimited'],
    }),
    status: 'REJECTED',
    rejection_reason:
      'The offer image does not show the actual product. Please upload a photo of the coffee being served and resubmit.',
    published_at: null,
    views: 0,
    searches: 0,
  },
];

/** Another merchant's submission so the admin queue has more than one row. */
export const SEED_ADMIN_QUEUE_DEALS: Deal[] = [
  {
    ...expand({
      id: 'd-910', biz: 'biz-ironhouse', cat: 'cat-services-fitness', type: 'discount', kind: 'service',
      title: 'Annual Gym Membership', blurb: 'Twelve months, locker included',
      mrp: 24000, price: 14999, cta: 'buy', cap: 40, left: 40, endsIn: 25, pubAgo: 0,
      tags: ['gym', 'annual', 'membership'],
    }),
    status: 'SUBMITTED',
    published_at: null,
    views: 0,
    searches: 0,
  },
  {
    ...expand({
      id: 'd-911', biz: 'biz-propkart', cat: 'cat-property-villa', type: 'property', kind: 'property',
      title: '4BHK Villa, Whitefield', blurb: 'Private garden, gated layout',
      mrp: 110000, price: 95000, unit: '/mo', cta: 'enquire', endsIn: 45, pubAgo: 0,
      tags: ['4bhk', 'villa', 'whitefield'],
      attrs: { bhk: 4, area_sqft: 3200, furnishing: 'Unfurnished', parking: true },
    }),
    status: 'SUBMITTED',
    published_at: null,
    views: 0,
    searches: 0,
  },
];
