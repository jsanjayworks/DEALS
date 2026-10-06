/**
 * Turns a spreadsheet of real deals into SQL for the live database.
 *
 *   npx -y tsx scripts/import-deals.mts deals.csv > import.sql
 *
 * Then open Supabase → SQL Editor, paste import.sql and run it. The editor
 * runs as the database owner, so no secret key ever leaves the dashboard.
 * Running the same file twice updates the rows instead of duplicating them:
 * ids are derived from the business name, area and deal title.
 *
 * Columns (header row required; template in docs/import-template.csv):
 *
 *   required  business, category, area, title, price, ends
 *   optional  phone, email, address, lat, lng, summary, description,
 *             usual_price, starts, days, open, close, action, type,
 *             limit_total, per_person, min_age, party, vehicles, cuisine,
 *             tags, photo, verified, booking
 *
 *   category  a category slug: lunch, dinner, cafe, bar, brunch, salon,
 *             vehicle-care, fitness, cleaning, rent, … (printed on error)
 *   area      a locality: Koramangala, HSR Layout, Indiranagar, …
 *   dates     YYYY-MM-DD; starts defaults to today
 *   days      all (default), weekdays, weekends, or e.g. mon,tue,fri / mon-fri
 *   open      HH:MM, default 10:00; close default 21:00
 *   party     group size, e.g. 4 or 4-6
 *   vehicles  semicolon list: bike;scooter;car or brands like royal-enfield
 *   tags      semicolon list of words people search for: chicken;kebab
 *   photo     a photo URL; without one, a library photo matched to the title
 *   verified  yes if you have checked the business yourself
 *
 * Imported deals go live at once (status ACTIVE). Imported businesses have
 * no owner until the merchant signs up and an admin links them.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CATEGORIES, LOCALITIES } from '../src/data/seed-reference';
import { matchPhoto } from '../src/data/photo-library';
import { BRAND_WORDS, VEHICLES, VEHICLE_TYPES, brandKey } from '../src/data/vehicles';
import type { CtaType, DealTypeCode, OfferingKind, Vertical } from '../src/data/types';

const file = process.argv[2];
if (!file) {
  console.error('usage: npx -y tsx scripts/import-deals.mts deals.csv > import.sql');
  process.exit(2);
}

// ---------------------------------------------------------------- CSV ------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const [header, ...body] = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, ''));
const cols = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
const records = body.map((r) => Object.fromEntries(cols.map((c, i) => [c, (r[i] ?? '').trim()])));

// ------------------------------------------------------------ helpers ------
function uu(slug: string): string {
  const h = createHash('md5').update(slug).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), '5' + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20), h.slice(20, 32)].join('-');
}
const q = (v: unknown) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? 'null' : String(v));
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pt = (lat: number, lng: number) => `st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography`;
const arr = (xs: string[]) => (xs.length ? `array[${xs.map(q).join(',')}]::text[]` : `'{}'::text[]`);
const num = (s: string) => {
  const t = s.replace(/[,₹\s]/g, '');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
};
const list = (s: string) => s.split(/[;|]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

const KIND: Record<Vertical, OfferingKind> = {
  food: 'meal', retail: 'product', events: 'event', mobility: 'transport', property: 'property',
  services: 'service', business: 'service', community: 'experience',
};
const CTAS: CtaType[] = ['buy', 'book', 'claim', 'reserve', 'enquire', 'call', 'register', 'visit'];
const TYPES: DealTypeCode[] = ['discount', 'bundle', 'bxgy', 'booking', 'experience', 'time_based', 'flash',
  'free', 'service_package', 'property', 'business_offer', 'transport', 'community'];
const DAY: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const VEHICLE_TAGS = new Set<string>([
  ...VEHICLE_TYPES, ...VEHICLES.map((v) => v.id), ...VEHICLES.map((v) => brandKey(v.brand)), ...Object.values(BRAND_WORDS),
]);

function days(s: string): number[] | string {
  const t = s.toLowerCase().replace(/\s+/g, '');
  if (!t || t === 'all' || t === 'daily' || t === 'everyday') return [];
  if (t === 'weekdays') return [1, 2, 3, 4, 5];
  if (t === 'weekends' || t === 'weekend') return [0, 6];
  const out = new Set<number>();
  for (const part of t.split(',')) {
    const range = part.split('-').map((d) => DAY[d.slice(0, 3)]);
    if (range.some((d) => d === undefined)) return 'days "' + s + '" not understood';
    if (range.length === 2) {
      for (let d = range[0]; ; d = (d + 1) % 7) {
        out.add(d);
        if (d === range[1]) break;
      }
    } else out.add(range[0]);
  }
  return [...out].sort();
}

function jitter(seed: string): [number, number] {
  const h = createHash('md5').update(seed).digest();
  return [((h[0] / 255) - 0.5) * 0.006, ((h[1] / 255) - 0.5) * 0.006];
}

// ------------------------------------------------------------ rows ---------
const errors: string[] = [];
const out: string[] = [];
const w = (s = '') => out.push(s);
const today = new Date().toISOString().slice(0, 10);
const seenBiz = new Set<string>();

w('-- YOLO Deals import, generated ' + new Date().toISOString() + ' from ' + file);
w('-- Paste into Supabase → SQL Editor and run. Safe to run again: it updates in place.');
w('begin;');
w();

records.forEach((r, i) => {
  const line = i + 2;
  const err = (m: string) => errors.push('row ' + line + ' (' + (r.title || r.business || '?') + '): ' + m);

  const category = CATEGORIES.find((c) => c.slug === r.category?.toLowerCase());
  const area = LOCALITIES.find(
    (l) => l.name.toLowerCase() === r.area?.toLowerCase() || l.aliases.includes(r.area?.toLowerCase()),
  );
  const price = num(r.price ?? '');
  const usual = num(r.usual_price ?? '');
  const total = num(r.limit_total ?? '');
  const per = num(r.per_person ?? '') ?? 2;
  const minAge = num(r.min_age ?? '');
  const dayList = days(r.days ?? '');
  const action = (r.action || 'claim').toLowerCase() as CtaType;
  const type = (r.type || (price === 0 ? 'free' : 'discount')).toLowerCase() as DealTypeCode;
  const open = r.open || '10:00';
  const close = r.close || '21:00';
  const starts = r.starts || today;
  const ends = r.ends;
  const lat = num(r.lat ?? '');
  const lng = num(r.lng ?? '');

  if (!r.business) err('business is empty');
  if (!r.title || r.title.length < 4) err('title is missing or too short');
  if (!category) err('category "' + r.category + '" is not one of: ' + CATEGORIES.map((c) => c.slug).join(', '));
  if (!area) err('area "' + r.area + '" is not one of: ' + LOCALITIES.map((l) => l.name).join(', '));
  if (price === null || Number.isNaN(price) || price < 0) err('price must be a number (0 for free)');
  if (usual !== null && (Number.isNaN(usual) || (price !== null && usual <= price))) err('usual_price must be higher than price');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ends ?? '')) err('ends must be a date like 2026-11-30');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(starts)) err('starts must be a date like 2026-10-05');
  if (ends && ends < today) err('ends is in the past');
  if (typeof dayList === 'string') err(dayList);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(close)) err('open and close must be HH:MM');
  if (!CTAS.includes(action)) err('action must be one of: ' + CTAS.join(', '));
  if (!TYPES.includes(type)) err('type must be one of: ' + TYPES.join(', '));
  if ((lat === null) !== (lng === null) || Number.isNaN(lat) || Number.isNaN(lng)) err('give both lat and lng, or neither');

  let party: [number, number] | null = null;
  if (r.party) {
    const m = r.party.match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/);
    if (!m) err('party must look like 4 or 4-6');
    else party = [Number(m[1]), Number(m[2] ?? m[1])];
    if (party && (party[0] < 1 || party[1] < party[0] || party[1] > 50)) err('party range is not sensible');
  }
  const vehicles = list(r.vehicles ?? '').map((v) => BRAND_WORDS[v] ?? v);
  for (const v of vehicles) if (!VEHICLE_TAGS.has(v)) err('vehicle "' + v + '" is not known (bike, scooter, car, or a brand)');

  if (errors.some((e) => e.startsWith('row ' + line + ' '))) return;
  const cat = category!;
  const loc = area!;

  const bizKey = 'import:' + key(r.business) + ':' + key(loc.name);
  const bizId = uu(bizKey);
  const locId = uu(bizKey + '-loc');
  const [dLat, dLng] = jitter(bizKey);
  const point = lat !== null && lng !== null ? pt(lat, lng) : pt(loc.centroid.lat + dLat, loc.centroid.lng + dLng);
  const dealId = uu(bizKey + ':' + key(r.title));

  if (!seenBiz.has(bizId)) {
    seenBiz.add(bizId);
    w('-- ' + r.business + ', ' + loc.name);
    w(`insert into businesses (id, name, phone, email, primary_category_id, verification_status)
  values (${q(bizId)}, ${q(r.business)}, ${q(r.phone)}, ${q(r.email)},
    (select id from categories where slug = ${q(cat.slug)}), ${/^y/i.test(r.verified ?? '') ? "'verified'" : "'unverified'"})
  on conflict (id) do update set name = excluded.name, phone = excluded.phone, email = excluded.email;`);
    w(`insert into business_locations (id, business_id, address_line, locality_id, city, location, is_primary)
  values (${q(locId)}, ${q(bizId)}, ${q(r.address || loc.name)}, (select id from localities where name = ${q(loc.name)}),
    'Bengaluru', ${point}, true)
  on conflict (id) do update set address_line = excluded.address_line, location = excluded.location;`);
  }

  const attrs: Record<string, unknown> = {};
  if (r.cuisine) attrs.cuisine = r.cuisine;
  if (party) {
    attrs.party_min = party[0];
    attrs.party_max = party[1];
  }
  if (vehicles.length) attrs.vehicles = vehicles;
  const tags = list(r.tags ?? '');
  const summary = r.summary || r.title;
  const photo =
    r.photo ||
    matchPhoto({ id: dealId, title: r.title, tags, description: summary, categorySlug: cat.slug, categoryName: cat.name, vertical: cat.vertical });
  const booking = /^y/i.test(r.booking ?? '') || action === 'book' || action === 'reserve';

  w(`insert into deals (id, business_id, category_id, deal_type_code, offering_kind, title, short_description,
  description, status, original_price, deal_price, max_qty_per_customer, starts_at, ends_at, capacity_total,
  capacity_remaining, booking_required, attributes, tags, location, search_radius_m, published_at)
values (${q(dealId)}, ${q(bizId)}, (select id from categories where slug = ${q(cat.slug)}), ${q(type)}, ${q(KIND[cat.vertical])},
  ${q(r.title)}, ${q(summary)}, ${q(r.description || summary)}, 'ACTIVE', ${n(usual)}, ${n(price)}, ${n(per)},
  ${q(starts + 'T00:00:00+05:30')}, ${q(ends + 'T23:59:00+05:30')}, ${n(total)}, ${n(total)}, ${booking},
  ${q(JSON.stringify(attrs))}::jsonb, ${arr(tags)}, ${point}, 5000, now())
on conflict (id) do update set title = excluded.title, short_description = excluded.short_description,
  description = excluded.description, original_price = excluded.original_price, deal_price = excluded.deal_price,
  ends_at = excluded.ends_at, attributes = excluded.attributes, tags = excluded.tags;`);
  w(`delete from deal_media where deal_id = ${q(dealId)};
insert into deal_media (deal_id, kind, storage_path, position) values (${q(dealId)}, 'image', ${q(photo)}, 0);`);
  w(`delete from deal_availability where deal_id = ${q(dealId)};`);
  const dl = dayList as number[];
  w(`insert into deal_availability (deal_id, day_of_week, start_time, end_time) values ${
    (dl.length ? dl : [null]).map((d) => `(${q(dealId)}, ${d === null ? 'null' : d}, ${q(open)}, ${q(close)})`).join(', ')
  };`);
  w(`insert into deal_eligibility (deal_id, audience, min_age, membership_required, advance_booking_hours)
  values (${q(dealId)}, 'everyone', ${n(minAge)}, false, ${booking ? '2' : 'null'})
  on conflict (deal_id) do update set min_age = excluded.min_age;`);
  w(`delete from deal_actions where deal_id = ${q(dealId)};
insert into deal_actions (deal_id, action_type, is_primary, sort_order) values
  (${q(dealId)}, ${q(action)}, true, 0)${action !== 'call' && r.phone ? `, (${q(dealId)}, 'call', false, 1)` : ''}, (${q(dealId)}, 'directions', false, 2);`);
  w(`insert into deal_locations (deal_id, business_location_id, mode, location, service_radius_m)
  values (${q(dealId)}, ${q(locId)}, 'store', ${point}, 5000)
  on conflict (deal_id, business_location_id) do nothing;`);
  for (const t of tags) w(`insert into tags (slug) values (${q(t)}) on conflict (slug) do nothing;`);
  w();
});

w('commit;');

if (errors.length) {
  console.error('Not written: fix these rows first.\n\n' + errors.join('\n'));
  process.exit(1);
}
process.stdout.write(out.join('\n') + '\n');
console.error('OK: ' + records.length + ' deals from ' + seenBiz.size + ' businesses.');
