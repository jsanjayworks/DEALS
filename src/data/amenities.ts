/**
 * What a place offers beyond its deals: the tags people filter going-out
 * places by (District, Zomato). Kept as a fixed list so they can be filters.
 */

export const AMENITIES = [
  { key: 'pure_veg', label: 'Pure veg' },
  { key: 'serves_alcohol', label: 'Serves alcohol' },
  { key: 'outdoor_seating', label: 'Outdoor seating' },
  { key: 'rooftop', label: 'Rooftop' },
  { key: 'live_music', label: 'Live music' },
  { key: 'parking', label: 'Parking' },
  { key: 'wifi', label: 'Wi-Fi' },
  { key: 'ac', label: 'Air conditioned' },
  { key: 'family_friendly', label: 'Family friendly' },
  { key: 'pet_friendly', label: 'Pet friendly' },
  { key: 'wheelchair', label: 'Wheelchair access' },
  { key: 'card_payment', label: 'Cards and UPI' },
] as const;

export type AmenityKey = (typeof AMENITIES)[number]['key'];

export const AMENITY_KEYS = AMENITIES.map((a) => a.key) as AmenityKey[];

export function amenityLabel(key: string): string {
  return AMENITIES.find((a) => a.key === key)?.label ?? key.replace(/_/g, ' ');
}
