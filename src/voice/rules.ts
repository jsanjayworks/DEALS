/**
 * The assistant's built-in understanding, for when Claude is not available
 * (no API key, offline). It handles clearly spoken English, and the common
 * Hindi and Kannada words for the app's screens; anything else becomes a
 * search, which the search parser already reads well.
 */

import { LOCALITIES } from '../data/seed-reference';
import { keywordsFrom } from '../merchant/classify';
import type { AssistMode, CustomerIntent, DealVoiceDraft, MerchantProduct, MerchantProfile, Screen } from './types';

const NAV: [RegExp, Screen][] = [
  [/\b(saved|favou?rites?|wishlist)\b|सेव|ಉಳಿಸಿದ/i, 'saved'],
  [/\b(notifications?|alerts?)\b|सूचना|ನೋಟಿಫಿಕೇಶನ್/i, 'notifications'],
  [/\b(order history|past orders|history)\b/i, 'order_history'],
  [/\b(my (deals|codes|orders|bookings|reservations)|my booking)\b|मेरी डील|मेरे ऑर्डर|ನನ್ನ ಡೀಲ್/i, 'my_deals'],
  [/\b(help|support|customer care)\b|मदद|ಸಹಾಯ/i, 'help'],
  [/\b(my vehicle|my bike|my car)\b/i, 'vehicle'],
  [/\b(profile|account|settings)\b|प्रोफाइल|ಪ್ರೊಫೈಲ್/i, 'profile'],
  [/\b((today|tonight)'?s bookings|all bookings|table bookings)\b/i, 'merchant_bookings'],
  [/\b(redeem|scan (a )?code|enter (a )?code)\b/i, 'merchant_redeem'],
  [/\b(new deal|create (a )?deal|post (a )?deal|add (a )?deal)\b/i, 'merchant_new_deal'],
  [/\b(insights|stats|analytics)\b/i, 'merchant_insights'],
  [/\b(dashboard)\b/i, 'merchant_dashboard'],
  [/^(go )?home$|\bhome page\b/i, 'home'],
];

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** YYYY-MM-DD for today plus `add` days, from a YYYY-MM-DD today. */
function shiftDay(today: string, add: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + add));
  return t.toISOString().slice(0, 10);
}

function dateFrom(text: string, today: string): string | null {
  if (/\b(day after tomorrow)\b/i.test(text)) return shiftDay(today, 2);
  if (/\b(tomorrow|tmrw)\b|कल|ನಾಳೆ/i.test(text)) return shiftDay(today, 1);
  if (/\b(today|tonight|this evening)\b|आज|ಇಂದು/i.test(text)) return today;
  const day = DAY_NAMES.findIndex((n) => new RegExp('\\b' + n + '\\b', 'i').test(text));
  if (day >= 0) {
    const [y, m, d] = today.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return shiftDay(today, (day - dow + 7) % 7 || 7);
  }
  return null;
}

function timeFrom(text: string): string | null {
  // The first number that reads as a time: after "at", or with minutes or am/pm ("for 4" is not one).
  for (const m of text.matchAll(/\b(at\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|o'?clock)?(?!\d)/gi)) {
    if (!m[1] && !m[3] && !m[4]) continue;
    let h = Number(m[2]);
    const min = m[3] ? Number(m[3]) : 0;
    if (h > 23 || min > 59) continue;
    const mer = (m[4] ?? '').toLowerCase();
    if (mer.startsWith('p') && h < 12) h += 12;
    else if (mer.startsWith('a') && h === 12) h = 0;
    // A bare "at 8" for a table means the evening; mornings only when said.
    else if (!mer.startsWith('a') && h >= 1 && h <= 11 && !/\b(breakfast|morning)\b/i.test(text)) h += 12;
    return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  }
  return null;
}

function peopleFrom(text: string): number | null {
  const m = text.match(/\bfor\s+(\d{1,2})\b|\b(\d{1,2})\s*(people|persons|pax|guests)\b/i);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 50 ? n : null;
}

/** Speech in Hindi or Kannada script: the rules cannot read its words, only its few fixed phrases. */
const NON_LATIN = /[\u0900-\u097F\u0C80-\u0CFF]/;

type Blank = Omit<CustomerIntent, 'kind' | 'heard'>;

/** What is left once the asking words are gone: "best lunch deal for me today" → "lunch". */
function topicOf(t: string, extra?: RegExp): string | null {
  if (NON_LATIN.test(t)) return null;
  let s = t.replace(/[?!.,]/g, ' ');
  if (extra) s = s.replace(extra, ' ');
  // "Near me" is where they already are; "near Indiranagar" keeps the place.
  s = s.replace(/\b(near|around|close to) (me|us|here)\b|\b(nearby|close by|around here)\b/gi, ' ');
  s = s
    .replace(
      /\b(what'?s|whats|what is|what|which is|which|where|the|a|an|best|good|great|top|nice|deals?|offers?|for (me|us|you)|me|my|you|your|i|today|now|right now|please|can you|could you|would you|suggest|recommend(ations?)?|something|anything|want|need|show|give|tell|should|surprise|is|are|there|any|some|to|of)\b/gi,
      ' ',
    )
    .replace(/\b(eat|eating|hungry)\b/gi, 'food');
  // The picks already follow the hour; "eat tonight" means dinner.
  const night = /\b(tonight|this evening)\b/i.test(s);
  s = s.replace(/\b(tonight|this evening)\b/gi, ' ');
  if (night) s = s.replace(/\bfood\b/i, 'dinner');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length >= 3 ? s : null;
}

/** A place named after "at", "for" or "from", when it is not one of the areas. */
function placeIn(t: string): string | null {
  const at = t.match(/\b(?:at|for|from|in)\s+([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*)*)/);
  if (!at) return null;
  return LOCALITIES.some((l) => l.name.toLowerCase() === at[1].toLowerCase()) ? null : at[1];
}

/** "redeem code R N G 7 K 2" → "RNG7K2"; a YOLO- prefix is dropped. */
function codeIn(t: string): string | null {
  const after = t.match(/\bredeem\b(?:\s+(?:the\s+)?code)?\s*[:-]?\s*(.+)$/i);
  if (!after) return null;
  const raw = after[1].toUpperCase().replace(/^YOLO\s*-?\s*/, '').replace(/[^A-Z0-9]/g, '');
  return raw.length >= 4 && raw.length <= 8 ? raw : null;
}

/** The deal words in "pause the dosa deal": "dosa". */
function dealWordsIn(t: string): string | null {
  const s = t
    .replace(/[?!.,]/g, ' ')
    .replace(
      /\b(pause|stop|hide|turn|switch|off|on|resume|restart|unpause|start|again|back|the|my|our|deal|deals|offer|offers|please|can|you|for now|today|it)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return s.length >= 2 ? s : null;
}

/** Jobs a business owner asks for on their merchant screens. */
function merchantJob(t: string, blank: Blank): CustomerIntent | null {
  if (/\bredeem\b/i.test(t)) {
    const code = codeIn(t);
    return code ? { ...blank, kind: 'merchant_redeem', code, heard: 'Redeem code ' + code } : null;
  }
  if (/\b(resume|restart|unpause|turn (it )?(back )?on|switch (it )?(back )?on|back on|start .+ again)\b/i.test(t)) {
    const q = dealWordsIn(t);
    return { ...blank, kind: 'merchant_resume', query: q, heard: 'Resume ' + (q ? 'the ' + q + ' deal' : 'a deal') };
  }
  if (/\b(pause|stop|hide|turn off|switch off)\b/i.test(t)) {
    const q = dealWordsIn(t);
    return { ...blank, kind: 'merchant_pause', query: q, heard: 'Pause ' + (q ? 'the ' + q + ' deal' : 'a deal') };
  }
  if (
    /\b(how('?s| is| am| are| did)\b.*\b(business|sales|today|doing|going|shop)|(today'?s|daily) (sales|orders|summary|business)|summary|how many orders|earn(ed|ings)?|revenue|best ?sell(er|ing)?|sales)\b/i.test(t) ||
    /आज का (बिज़नेस|बिक्री)|ಇಂದಿನ ವ್ಯಾಪಾರ/.test(t)
  ) {
    return { ...blank, kind: 'merchant_summary', heard: "Today's summary" };
  }
  return null;
}

/** Which "not for me" they mean: the whole place, that kind of thing, or just this deal. */
function hideScope(t: string): 'deal' | 'business' | 'category' {
  return /\b(place|shop|restaurant|salon|store|business|from (them|here|there))\b/i.test(t)
    ? 'business'
    : /\b(kind|type|category|these|such|like this|like these)\b/i.test(t)
      ? 'category'
      : 'deal';
}

/**
 * "Stop suggesting…", "don't recommend…", "turn off suggestions for…", and
 * "stop showing me this" (only with a this or that: "don't show me pricey
 * ones" is a search).
 */
const STOP_SUGGESTING =
  /\b(stop|quit|never|no more|don['’]?t|do not)\s+([\w'’]+\s+){0,3}(suggest|recommend)|\b(stop|quit|never|no more)\s+show\w*\b.*\b(this|that|these|those|it|them)\b|\b(turn|switch) off\b.*\b(suggest|recommend)/i;

/** "Turn off personalised suggestions", "stop tracking me", "turn suggestions off". */
const SWITCH_OFF =
  /\b(turn off|switch off|stop|disable|pause|don['’]?t|do not)\b.*\b(suggest|recommend|personali[sz]|learning|tracking)|\b(turn|switch)\b.*\b(suggest|recommend|personali[sz])\w*\s+off\b/i;

/**
 * What a "stop" points at beyond the suggestions themselves: "this place" in
 * "stop suggesting this place", "biryani" in "don't recommend biryani", and
 * nothing in "turn off personalised suggestions".
 */
function stopObject(t: string): string {
  return t
    .replace(
      /\b(turn(ed)?|switch(ed)?|off|stop|quit|disable|pause|never|no more|don['’]?t|do not|please|can you|could you|just|now|any ?more|again|and|so|yolo|you|your|me|my|i['’]?m|i|all|any|anything|everything|the|for|to|from|about|on|of|based|what|do|does|did|want|need|deals?|offers?|picks|things|stuff|activity|history|data|forget|clear|personali[sz]\w*|suggest\w*|recommend\w*|show\w*|learn\w*|track\w*)\b/gi,
      ' ',
    )
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jobs a customer asks for: answers from their own orders, or an action to confirm. */
function customerJob(t: string, blank: Blank): CustomerIntent | null {
  if (/\b(not for me|not interested|not my thing|show (me )?(less|fewer)|don'?t show (me )?(this|these|that|them)|don'?t (want|like) (this|these|that|them|deals)|hide (this|it|these))\b|नहीं चाहिए|ಬೇಡ/i.test(t)) {
    return { ...blank, kind: 'not_interested', query: hideScope(t), heard: 'Not for me' };
  }
  if (/\b(clear|delete|erase|forget|wipe)\b.*\b(activity|history|data|what you (know|learned))\b/i.test(t)) {
    return { ...blank, kind: 'privacy', query: 'clear', heard: 'Clear my activity' };
  }
  // "Stop suggesting this place", "don't recommend biryani": one thing they do
  // not want, not the whole feature. Checked before switching suggestions off.
  if (STOP_SUGGESTING.test(t) && stopObject(t)) {
    return { ...blank, kind: 'not_interested', query: hideScope(t), heard: 'Not for me' };
  }
  // Off only when they name the feature and nothing else: "turn off personalised suggestions".
  if (SWITCH_OFF.test(t) && !stopObject(t)) {
    return { ...blank, kind: 'privacy', query: 'off', heard: 'Turn off personalised suggestions' };
  }
  if (/\b(turn on|switch on|enable|start)\b.*\b(suggest|personali[sz])/i.test(t)) {
    return { ...blank, kind: 'privacy', query: 'on', heard: 'Turn on personalised suggestions' };
  }
  if (/\bwhat (do you|does yolo) know about me\b|\bmy (data|privacy)\b|\bwhat have you (recorded|learned|learnt)\b/i.test(t)) {
    return { ...blank, kind: 'privacy', query: 'summary', heard: 'What YOLO knows about you' };
  }
  if (/\bhow much\b.*\b(sav|spen)|\b(my savings|saved so far|total sav|money saved)\b|कितना (बचा|बचत)|बचत|ಎಷ್ಟು ಉಳಿ|ಉಳಿತಾಯ/i.test(t)) {
    return { ...blank, kind: 'savings', heard: 'Your savings' };
  }
  if (/\b(my usual|the usual|usual order|same (as|again)|last time|order again|reorder|re-order|repeat (my )?(last )?order|last order)\b|फिर से|दोबारा|ಮತ್ತೆ/i.test(t)) {
    const q = topicOf(t, /\b(order|orders|ordered|my usual|usual|the same|same as|same|as|again|last time|last|reorder|re-order|repeat|get)\b/gi);
    return { ...blank, kind: 'reorder', query: q, heard: 'Your usual' + (q ? ': ' + q : '') };
  }
  if (/\bcancel\b|रद्द|ಕ್ಯಾನ್ಸಲ್/i.test(t)) {
    const business = placeIn(t);
    const q = topicOf(
      business ? t.replace(business, ' ') : t,
      /\b(cancel|order|booking|reservation|table|code|claim|at|from|for)\b/gi,
    );
    return { ...blank, kind: 'cancel', business, query: q, heard: 'Cancel ' + (business ?? q ?? 'an order') };
  }
  if (/\b(my (qr|codes?)|what'?s my code|when is my (booking|table|reservation|slot|appointment)|my next (booking|table|reservation)|do i have any (codes?|bookings?))\b|मेरा कोड|ನನ್ನ ಕೋಡ್/i.test(t)) {
    const business = placeIn(t);
    return { ...blank, kind: 'my_codes', business, heard: 'Your codes' + (business ? ' for ' + business : '') };
  }
  const openQ =
    t.match(/\b(?:is|are)\s+(.+?)\s+open\b/i) ??
    t.match(/\bwhat time does\s+(.+?)\s+(?:open|close)\b/i) ??
    t.match(/\b(?:timings?|hours|cost for two)\s+(?:at|of|for)\s+(.+?)[?.]?$/i) ??
    t.match(/^(.+?)\s+(?:timings?|opening hours)\b/i);
  if (openQ && /^[A-Z]/.test(openQ[1].trim())) {
    const business = openQ[1].trim();
    return { ...blank, kind: 'business_info', business, heard: 'About ' + business };
  }
  return null;
}

/** "Best deal for me today", "what should I eat tonight", "surprise me". */
function recommendJob(t: string, blank: Blank): CustomerIntent | null {
  if (
    !/\b(for me|for us|suggest|recommend|what should (i|we)|surprise me|best deals?|top deals?|good deals?|anything good|what'?s good|what to (eat|do))\b/i.test(t) &&
    !/सबसे अच्छ|सुझा|ಬೆಸ್ಟ್|ಸಲಹೆ|ಉತ್ತಮ/.test(t)
  ) {
    return null;
  }
  const q = topicOf(t);
  return { ...blank, kind: 'recommend', query: q, heard: q ? 'Best for you: ' + q : 'Best deals for you today' };
}

/**
 * Tidies a job the AI understood with the same rules the fallback uses, so
 * either way the app acts alike: "this place" in the words means the whole
 * place, and a topic like "dinner tonight" is the meal, not words to search.
 */
export function settleCustomerIntent(intent: CustomerIntent, text: string): CustomerIntent {
  if (intent.kind === 'not_interested') {
    const scope = hideScope(text);
    return scope === 'deal' ? intent : { ...intent, query: scope };
  }
  if (intent.kind === 'recommend' && intent.query) {
    return { ...intent, query: topicOf(intent.query) };
  }
  return intent;
}

export function ruleCustomerIntent(text: string, today: string, mode: AssistMode = 'customer'): CustomerIntent {
  const t = text.trim();
  const blank: Blank = { query: null, screen: null, business: null, date: null, time: null, people: null, code: null };

  const job = (mode === 'merchant' ? merchantJob(t, blank) : null) ?? customerJob(t, blank);
  if (job) return job;

  const booking = /\b(book|reserve|reservation|table for)\b|बुक|ಬುಕ್/i.test(t);
  if (booking) {
    const at = t.match(/\b(?:at|in)\s+([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*)*)/);
    const place = at && !LOCALITIES.some((l) => l.name.toLowerCase() === at[1].toLowerCase()) ? at[1] : null;
    const what = /\btable\b/i.test(t) ? 'table' : keywordsFrom(t.replace(/\b(book|reserve|a|an|the|for|at|on|tomorrow|today|tonight)\b/gi, ' ')).slice(0, 3).join(' ') || null;
    const date = dateFrom(t, today);
    const time = timeFrom(t);
    const people = peopleFrom(t);
    return {
      ...blank,
      kind: 'book',
      business: place,
      query: what,
      date,
      time,
      people,
      heard: ['Book', what ?? 'a slot', people ? 'for ' + people : '', place ? 'at ' + place : '', date ?? '', time ?? '']
        .filter(Boolean)
        .join(' '),
    };
  }

  const rec = recommendJob(t, blank);
  if (rec) return rec;

  for (const [re, screen] of NAV) {
    if (re.test(t)) return { ...blank, kind: 'go', screen, heard: 'Open ' + screen.replace(/_/g, ' ') };
  }

  const open = t.match(/^(?:open|show(?: me)?|go to)\s+(.+)$/i);
  if (open && /^[A-Z]/.test(open[1]) && !/\bdeals?\b|\bunder\b/i.test(open[1])) {
    return { ...blank, kind: 'open_business', business: open[1].trim(), heard: 'Open ' + open[1].trim() };
  }

  const query = t.replace(/^(show me|find( me)?|search( for)?|i want|i need|get me|looking for)\s+/i, '');
  return { ...blank, kind: 'search', query, heard: query };
}

// ------------------------------------------------------------ merchants ----

const PRICE = /(?:₹|rs\.?|inr|rupees?)\s*(\d{2,6})|(\d{2,6})\s*(?:₹|rs\.?|rupees?|\/-|bucks)/i;
const BARE_PRICE = /\b(?:for|at|only|just|price(?:d)? (?:at)?)\s+(\d{2,6})\b/i;

function priceIn(s: string): number | null {
  const m = s.match(PRICE) ?? s.match(BARE_PRICE);
  return m ? Number(m[1] ?? m[2]) : null;
}

function cleanTitle(s: string): string {
  const t = s
    .replace(PRICE, ' ')
    .replace(BARE_PRICE, ' ')
    .replace(/\b(instead of|usually|normally|was|mrp)\s+\d+\b/gi, ' ')
    .replace(/^\s*(and|also|we|i|sell|selling|serve|serving|have|offer|offering|do|make|a|an|the|our|also)\b\s*/gi, '')
    .replace(/^\s*(and|also|we|i|sell|serve|have|offer|do|make|a|an|the|our)\b\s*/gi, '')
    .replace(/\b(for|at|only|just)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
}

export function ruleMerchantProfile(text: string): MerchantProfile {
  const t = text.replace(/\s+/g, ' ').trim();
  // "I'm Ravi", "My name is Anitha Rao", "this is Suresh"; speech often gives a curly apostrophe.
  const owner = t.match(/\b(?:[Mm]y name is|I am|I['’]m|[Tt]his is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  const name = t.match(/\b(?:called|named)\s+([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,4})/);
  const area = LOCALITIES.find((l) => l.aliases.some((a) => new RegExp('\\b' + a + '\\b', 'i').test(t)));
  const phone = t.match(/(?:\+?91[\s-]?)?([6-9]\d{4})[\s-]?(\d{5})/);
  const typeMatch = t.match(/\b(?:run|own|have|is)\s+(?:a|an)\s+([a-z][a-z\s-]{2,40}?)(?:\s+(?:called|named|in|at|near)\b|[.,])/i);
  const hours = t.match(/\b(\d{1,2})\s*(am|pm)\s*(?:to|-|till|until)\s*(\d{1,2})\s*(am|pm)\b/i);
  const to24 = (h: string, mer: string) => {
    let n = Number(h) % 12;
    if (mer.toLowerCase() === 'pm') n += 12;
    return String(n).padStart(2, '0') + ':00';
  };

  // Products: each clause with a price in it.
  const products: MerchantProduct[] = [];
  for (const clause of t.split(/[.;]|,(?!\d)|\band\b(?=[^.]*\d)/i)) {
    const price = priceIn(clause);
    if (price == null) continue;
    const was = clause.match(/\b(?:instead of|usually|normally|was|mrp)\s*(?:₹|rs\.?)?\s*(\d{2,6})/i);
    const title = cleanTitle(clause);
    if (title.length < 3) continue;
    const party = clause.match(/\bfor\s+(\d{1,2})\s*(?:people|persons)?\b/i);
    products.push({
      title,
      description: '',
      price: was && Number(was[1]) === price ? null : price,
      original_price: was ? Number(was[1]) : null,
      per_month: /\b(per month|a month|monthly|membership)\b/i.test(clause),
      party_min: party ? Number(party[1]) : null,
      party_max: party ? Number(party[1]) : null,
    });
  }

  const type = typeMatch ? typeMatch[1].trim() : null;
  return {
    owner_name: owner ? owner[1] : null,
    owner_role: /\b(owner|i own)\b/i.test(t) ? 'Owner' : /\bmanager\b/i.test(t) ? 'Manager' : null,
    business_name: name ? name[1].trim() : null,
    business_type: type,
    area: area ? area.name : null,
    address: null,
    phone: phone ? '+91 ' + phone[1] + ' ' + phone[2] : null,
    description: type ? 'We are a ' + type + (area ? ' in ' + area.name : '') + '.' : null,
    open_time: hours ? to24(hours[1], hours[2]) : null,
    close_time: hours ? to24(hours[3], hours[4]) : null,
    days: null,
    cost_for_two: (() => {
      const m = t.match(/\bcost for two\D{0,10}(\d{2,5})/i);
      return m ? Number(m[1]) : null;
    })(),
    amenities: [
      /\b(pure veg|vegetarian only|only veg)\b/i.test(t) ? 'pure_veg' : '',
      /\b(parking)\b/i.test(t) ? 'parking' : '',
      /\b(wi-?fi)\b/i.test(t) ? 'wifi' : '',
      /\b(rooftop|terrace)\b/i.test(t) ? 'rooftop' : '',
      /\b(outdoor)\b/i.test(t) ? 'outdoor_seating' : '',
      /\b(live music)\b/i.test(t) ? 'live_music' : '',
      /\b(beer|bar|alcohol|cocktails?)\b/i.test(t) ? 'serves_alcohol' : '',
    ].filter(Boolean),
    cuisines: [],
    products,
  };
}

export function ruleDealDraft(text: string): DealVoiceDraft {
  const t = text.replace(/\s+/g, ' ').trim();
  const price = priceIn(t);
  const was = t.match(/\b(?:instead of|usually|normally|was|mrp)\s*(?:₹|rs\.?)?\s*(\d{2,6})/i);
  const hours = t.match(/\b(\d{1,2})\s*(am|pm)\s*(?:to|-|till|until)\s*(\d{1,2})\s*(am|pm)\b/i);
  const to24 = (h: string, mer: string) => {
    let n = Number(h) % 12;
    if (mer.toLowerCase() === 'pm') n += 12;
    return String(n).padStart(2, '0') + ':00';
  };
  const party = t.match(/\bfor\s+(\d{1,2})\s*(?:people|persons)?\b/i);
  const offering = cleanTitle(t.split(/[.,]/)[0] ?? t);
  return {
    offering,
    title: offering,
    short_description: (() => {
      const first = (t.split(/[.,;]/)[0] ?? '').trim();
      return first ? (first.charAt(0).toUpperCase() + first.slice(1)).slice(0, 110) : null;
    })(),
    description: t.length >= 20 ? t.charAt(0).toUpperCase() + t.slice(1) : null,
    price: was && price === Number(was[1]) ? null : price,
    original_price: was ? Number(was[1]) : null,
    start_time: hours ? to24(hours[1], hours[2]) : null,
    end_time: hours ? to24(hours[3], hours[4]) : null,
    days: /\bweekends?\b/i.test(t) ? [0, 6] : /\bweekdays?\b/i.test(t) ? [1, 2, 3, 4, 5] : null,
    party_min: party ? Number(party[1]) : null,
    party_max: party ? Number(party[1]) : null,
    keywords: keywordsFrom(t).slice(0, 8),
    needs_booking: /\b(book|booking|reserve|reservation|appointment|slot|table)\b/i.test(t),
    slot_capacity: (() => {
      const m = t.match(/\b(\d{1,3})\s*(tables|chairs|slots|bays)\b/i);
      return m ? Number(m[1]) : null;
    })(),
  };
}
