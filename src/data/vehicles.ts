/**
 * The vehicles a customer can say they own, and how deals declare which
 * vehicles they are for.
 *
 * A deal lists vehicle tags in attributes.vehicles. A tag is one of:
 *   a type    'bike' | 'scooter' | 'car'        any vehicle of that kind
 *   a brand   'royal-enfield', 'honda', …       any model of that brand
 *   a model   're-classic-350', …               that model only
 *
 * A customer's vehicle expands to all three of its own tags, so "Royal
 * Enfield Classic 350" matches a Royal Enfield specialist, a deal for any
 * bike, and a deal for that exact model. That is how one choice surfaces
 * every service around the vehicle — servicing, washes, tyres, accessories,
 * riding gear — across categories, not only bikes.
 */

export type VehicleType = 'bike' | 'scooter' | 'car';

export interface VehicleModel {
  id: string;
  type: VehicleType;
  brand: string;
  model: string;
  /** Extra words people type for it, lower case. */
  aliases: string[];
}

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  bike: 'Bike',
  scooter: 'Scooter',
  car: 'Car',
};

export const VEHICLE_TYPES: VehicleType[] = ['bike', 'scooter', 'car'];

export const VEHICLES: VehicleModel[] = [
  // Bikes. Aliases are only what is safe to match on its own: "classic" or
  // "city" alone means something else, so those need the brand or the number.
  { id: 're-classic-350', type: 'bike', brand: 'Royal Enfield', model: 'Classic 350', aliases: ['classic 350', 're classic', 'enfield classic'] },
  { id: 're-bullet-350', type: 'bike', brand: 'Royal Enfield', model: 'Bullet 350', aliases: ['bullet 350', 're bullet', 'enfield bullet'] },
  { id: 're-hunter-350', type: 'bike', brand: 'Royal Enfield', model: 'Hunter 350', aliases: ['hunter 350', 're hunter'] },
  { id: 're-meteor-350', type: 'bike', brand: 'Royal Enfield', model: 'Meteor 350', aliases: ['meteor 350', 're meteor'] },
  { id: 're-himalayan', type: 'bike', brand: 'Royal Enfield', model: 'Himalayan', aliases: ['himalayan'] },
  { id: 'bajaj-pulsar', type: 'bike', brand: 'Bajaj', model: 'Pulsar', aliases: ['pulsar'] },
  { id: 'tvs-apache', type: 'bike', brand: 'TVS', model: 'Apache', aliases: ['apache'] },
  { id: 'hero-splendor', type: 'bike', brand: 'Hero', model: 'Splendor', aliases: ['splendor'] },
  { id: 'honda-shine', type: 'bike', brand: 'Honda', model: 'Shine', aliases: ['honda shine'] },
  { id: 'ktm-duke', type: 'bike', brand: 'KTM', model: 'Duke', aliases: ['ktm duke'] },
  { id: 'yamaha-r15', type: 'bike', brand: 'Yamaha', model: 'R15', aliases: ['r15'] },
  // Scooters
  { id: 'honda-activa', type: 'scooter', brand: 'Honda', model: 'Activa', aliases: ['activa'] },
  { id: 'tvs-jupiter', type: 'scooter', brand: 'TVS', model: 'Jupiter', aliases: ['jupiter'] },
  { id: 'suzuki-access', type: 'scooter', brand: 'Suzuki', model: 'Access 125', aliases: ['access 125', 'suzuki access'] },
  { id: 'ather-450', type: 'scooter', brand: 'Ather', model: '450X', aliases: ['ather 450', '450x'] },
  { id: 'ola-s1', type: 'scooter', brand: 'Ola Electric', model: 'S1', aliases: ['ola s1', 'ola scooter'] },
  // Cars
  { id: 'maruti-swift', type: 'car', brand: 'Maruti Suzuki', model: 'Swift', aliases: ['swift'] },
  { id: 'maruti-baleno', type: 'car', brand: 'Maruti Suzuki', model: 'Baleno', aliases: ['baleno'] },
  { id: 'hyundai-creta', type: 'car', brand: 'Hyundai', model: 'Creta', aliases: ['creta'] },
  { id: 'hyundai-i20', type: 'car', brand: 'Hyundai', model: 'i20', aliases: ['i20'] },
  { id: 'tata-nexon', type: 'car', brand: 'Tata', model: 'Nexon', aliases: ['nexon'] },
  { id: 'mahindra-xuv700', type: 'car', brand: 'Mahindra', model: 'XUV700', aliases: ['xuv700', 'xuv 700'] },
  { id: 'toyota-innova', type: 'car', brand: 'Toyota', model: 'Innova', aliases: ['innova', 'crysta'] },
  { id: 'kia-seltos', type: 'car', brand: 'Kia', model: 'Seltos', aliases: ['seltos'] },
  { id: 'honda-city', type: 'car', brand: 'Honda', model: 'City', aliases: ['honda city'] },
];

/** 'Royal Enfield' -> 'royal-enfield'. */
export function brandKey(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function vehicleById(id: string | null | undefined): VehicleModel | null {
  return VEHICLES.find((v) => v.id === id) ?? null;
}

/** The tags a customer's vehicle matches: its model, its brand and its type. */
export function vehicleTags(v: VehicleModel): string[] {
  return [v.id, brandKey(v.brand), v.type];
}

export function vehicleLabel(v: VehicleModel): string {
  return v.brand + ' ' + v.model;
}

/** Brands people type, with the tag they stand for ("re" and "bullet" are Royal Enfield). */
export const BRAND_WORDS: Record<string, string> = {
  'royal enfield': 'royal-enfield',
  enfield: 'royal-enfield',
  bullet: 'royal-enfield',
  re: 'royal-enfield',
  bajaj: 'bajaj',
  tvs: 'tvs',
  hero: 'hero',
  honda: 'honda',
  ktm: 'ktm',
  yamaha: 'yamaha',
  suzuki: 'suzuki',
  ather: 'ather',
  'ola electric': 'ola-electric',
  maruti: 'maruti-suzuki',
  'maruti suzuki': 'maruti-suzuki',
  hyundai: 'hyundai',
  tata: 'tata',
  mahindra: 'mahindra',
  toyota: 'toyota',
  kia: 'kia',
};

/** Words for a kind of vehicle. */
export const TYPE_WORDS: Record<string, VehicleType> = {
  bike: 'bike',
  bikes: 'bike',
  motorcycle: 'bike',
  motorbike: 'bike',
  'two wheeler': 'bike',
  'two-wheeler': 'bike',
  scooter: 'scooter',
  scooty: 'scooter',
  scooters: 'scooter',
  car: 'car',
  cars: 'car',
  'four wheeler': 'car',
  'four-wheeler': 'car',
  suv: 'car',
  sedan: 'car',
  hatchback: 'car',
};

const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * The tags to search with when someone names a brand or a kind of vehicle.
 * The first tag is the one they named; the rest widen it, so "Royal Enfield"
 * also finds every RE model and anything for bikes, and "car" finds deals for
 * any car model or car brand.
 */
export function brandSearchTags(brand: string): string[] {
  const models = VEHICLES.filter((v) => brandKey(v.brand) === brand);
  return uniq([brand, ...models.map((v) => v.id), ...models.map((v) => v.type)]);
}

export function typeSearchTags(t: VehicleType): string[] {
  const models = VEHICLES.filter((v) => v.type === t);
  return uniq([t, ...models.map((v) => v.id), ...models.map((v) => brandKey(v.brand))]);
}

export interface VehicleMention {
  /** Tags to filter by, the named one first. */
  tags: string[];
  /** The words that named it, to take out of the keywords. */
  phrases: string[];
}

/**
 * Finds a vehicle in normalised query text (lower case, single spaces, padded
 * with a space each side). A model wins over a brand, a brand over a type:
 * "royal enfield classic 350 service" is the Classic 350, not every bike.
 */
export function findVehicleMention(text: string): VehicleMention | null {
  const has = (phrase: string) => text.includes(' ' + phrase + ' ');
  const longestFirst = (a: string, b: string) => b.length - a.length;

  const modelPhrases = VEHICLES.flatMap((v) =>
    [(v.brand + ' ' + v.model).toLowerCase(), ...v.aliases].map((p) => ({ v, p })),
  ).sort((a, b) => longestFirst(a.p, b.p));
  const model = modelPhrases.find((m) => has(m.p));
  if (model) {
    const key = brandKey(model.v.brand);
    const brandWords = Object.keys(BRAND_WORDS).filter((w) => BRAND_WORDS[w] === key && has(w));
    return { tags: vehicleTags(model.v), phrases: [model.p, ...brandWords] };
  }

  const brandWords = Object.keys(BRAND_WORDS).sort(longestFirst);
  const brand = brandWords.find((w) => has(w));
  if (brand) {
    const key = BRAND_WORDS[brand];
    return {
      tags: brandSearchTags(key),
      phrases: brandWords.filter((w) => BRAND_WORDS[w] === key && has(w)),
    };
  }

  const typeWords = Object.keys(TYPE_WORDS).sort(longestFirst);
  const typeWord = typeWords.find((w) => has(w));
  if (typeWord) {
    const t = TYPE_WORDS[typeWord];
    return {
      tags: typeSearchTags(t),
      phrases: typeWords.filter((w) => TYPE_WORDS[w] === t && has(w)),
    };
  }
  return null;
}

/** The chip for a vehicle filter, read from its first (named) tag. */
export function vehicleFilterLabel(tags: string[]): string | null {
  const first = tags[0];
  if (!first) return null;
  const model = vehicleById(first);
  if (model) return vehicleLabel(model);
  if ((VEHICLE_TYPES as string[]).includes(first)) {
    return 'Any ' + VEHICLE_TYPE_LABEL[first as VehicleType].toLowerCase();
  }
  const v = VEHICLES.find((x) => brandKey(x.brand) === first);
  return v ? v.brand : null;
}

/**
 * Who a deal's vehicle tags are for, to follow "For": "Royal Enfield",
 * "Royal Enfield Classic 350", "bikes and scooters".
 */
export function vehicleFitLabel(tags: string[]): string | null {
  if (tags.length === 0) return null;
  // Every model and brand named, then the kinds only if nothing narrower was.
  const named = [
    ...VEHICLES.filter((v) => tags.includes(v.id)).map(vehicleLabel),
    ...[...new Set(VEHICLES.filter((v) => tags.includes(brandKey(v.brand))).map((v) => v.brand))],
  ];
  const words =
    named.length > 0
      ? named
      : VEHICLE_TYPES.filter((t) => tags.includes(t)).map((t) => VEHICLE_TYPE_LABEL[t].toLowerCase() + 's');
  if (words.length === 0) return null;
  const shown = words.length > 3 ? [...words.slice(0, 3), 'more'] : words;
  return shown.length === 1
    ? shown[0]
    : shown.slice(0, -1).join(', ') + ' and ' + shown[shown.length - 1];
}

/**
 * What a customer can pick as their vehicle: a model id, or "type:bike" when
 * theirs is not in the list. Both turn into search tags and a name.
 */
export function choiceTags(id: string | null): string[] {
  if (!id) return [];
  if (id.startsWith('type:')) {
    const t = id.slice(5) as VehicleType;
    return VEHICLE_TYPES.includes(t) ? [t] : [];
  }
  const v = vehicleById(id);
  return v ? vehicleTags(v) : [];
}

export function choiceLabel(id: string | null): string | null {
  if (!id) return null;
  if (id.startsWith('type:')) {
    const t = id.slice(5) as VehicleType;
    return VEHICLE_TYPES.includes(t) ? 'your ' + VEHICLE_TYPE_LABEL[t].toLowerCase() : null;
  }
  const v = vehicleById(id);
  return v ? vehicleLabel(v) : null;
}

/** A deal's vehicle tags, whatever shape the attribute arrived in. */
export function dealVehicleTags(attributes: Record<string, unknown>): string[] {
  const v = attributes.vehicles;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
