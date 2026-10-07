/**
 * The voice assistant's understanding, on the server: what someone said
 * (from speech recognition, in English, Hindi, Kannada or a mix) in, one
 * structured answer out, matching src/voice/types.ts.
 *
 * Runs only where ANTHROPIC_API_KEY is set (.env.local, or the host's
 * secrets); the key never reaches the browser. Without it this answers 503
 * and the app falls back to its built-in rules (src/voice/rules.ts).
 */

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { AMENITY_KEYS } from '../../data/amenities';
import { INTENT_KINDS, SCREENS } from '../../voice/types';

const MODEL = 'claude-opus-5-5';
const MAX_CHARS = 4000;

const nullableString = z.string().nullable();
const nullableInt = z.number().int().nullable();

const CustomerSchema = z.object({
  kind: z.enum(INTENT_KINDS),
  query: nullableString,
  screen: z.enum(SCREENS).nullable(),
  business: nullableString,
  date: nullableString,
  time: nullableString,
  people: nullableInt,
  code: nullableString,
  heard: z.string(),
});

const ProductSchema = z.object({
  title: z.string(),
  description: z.string(),
  price: z.number().nullable(),
  original_price: z.number().nullable(),
  per_month: z.boolean(),
  party_min: nullableInt,
  party_max: nullableInt,
});

const MerchantSchema = z.object({
  owner_name: nullableString,
  owner_role: nullableString,
  business_name: nullableString,
  business_type: nullableString,
  area: nullableString,
  address: nullableString,
  phone: nullableString,
  description: nullableString,
  open_time: nullableString,
  close_time: nullableString,
  days: z.array(z.number().int()).nullable(),
  cost_for_two: z.number().nullable(),
  amenities: z.array(z.enum(AMENITY_KEYS as [string, ...string[]])),
  cuisines: z.array(z.string()),
  products: z.array(ProductSchema),
});

const DealSchema = z.object({
  offering: nullableString,
  title: nullableString,
  short_description: nullableString,
  description: nullableString,
  price: z.number().nullable(),
  original_price: z.number().nullable(),
  start_time: nullableString,
  end_time: nullableString,
  days: z.array(z.number().int()).nullable(),
  party_min: nullableInt,
  party_max: nullableInt,
  keywords: z.array(z.string()),
  needs_booking: z.boolean(),
  slot_capacity: nullableInt,
});

const COMMON = `The text comes from speech recognition, so expect missing punctuation, misheard words and a mix of English, Hindi and Kannada (in their own scripts or in Latin letters). Read it generously, the way a helpful shop assistant in Bengaluru would. Write every output field in English, translating names of dishes, services and things into the words Indian customers search for in English (बिरयानी → biryani, ದೋಸೆ → dosa, बाल कटवाना → haircut). Never invent facts the speaker did not say; leave a field null (or an empty list) instead.`;

const SYSTEM = {
  customer: `You turn what a customer said to YOLO Deals, a deals app for Bengaluru, into exactly one action. ${COMMON}

Actions:
- search: they want to find deals. Put an English search phrase in query that keeps every detail they gave: the thing (biryani, haircut, car wash, 2BHK), price limits ("under 300"), the area if it is one of the covered areas ("in HSR Layout"), group size ("for 4 people"), and time words ("tonight", "this weekend").
- book: they want to book or reserve something, usually a table or a time slot. business is the place's name if they said one; query is what they want (e.g. "dinner table", "haircut"). Resolve date to YYYY-MM-DD from today. time is 24-hour HH:MM: a bare "8" or "8 o'clock" for dinner means 20:00, for lunch 13:00, for breakfast 08:00. people is the party size.
- go: they want a screen of the app. screen is one of: my_deals (their deals, codes, orders or bookings as a customer), saved, notifications, profile, help, order_history, vehicle, home, search; or for a business owner: merchant_dashboard, merchant_bookings, merchant_redeem, merchant_new_deal, merchant_deals, merchant_insights.
- open_business: they name a place and want to look at it, not book it ("show me Rangoli Kitchen").

Jobs the app answers from the customer's own orders (prefer these over search when they fit):
- recommend: they want suggestions picked for them: "what's the best deal for me today", "what should I eat tonight", "surprise me", "suggest a good lunch under 200". query is the English topic and limits if any ("lunch under 200", "dinner tonight"), else null.
- reorder: they want their usual or a past order again: "order my usual", "same biryani as last time", "repeat my last order". query is the thing if they named one ("biryani", "coffee"), else null.
- savings: how much they saved or spent with the app.
- my_codes: their codes, QR or upcoming bookings ("what's my code", "when is my table booking"). business if they named a place.
- cancel: cancel one of their orders or bookings. business and query (what it was) when said. The app asks them to confirm.
- business_info: a question about one place: is it open, timings, cost for two, rating ("is Rangoli Kitchen open now"). business is the name.

Jobs for a business owner (only when they are on their merchant screens):
- merchant_summary: how business is going today: orders, earnings, bookings, best seller.
- merchant_pause / merchant_resume: hide or bring back one of their deals; query is the words naming the deal ("dosa", "thali lunch").
- merchant_redeem: redeem a customer's code. code is the letters and digits only, uppercase, without "YOLO-" (spoken "R N G seven K two" → "RNG7K2").

heard is one short English line of what you understood, for example "Biryani under ₹300 in HSR Layout for 4", "Table for 4 at Rangoli Kitchen, tomorrow 8 PM" or "Best deals for you today". Fields that do not apply to the action are null.`,

  merchant: `A business owner in Bengaluru is describing their business by voice to list it on YOLO Deals. Turn it into a listing. ${COMMON}

- owner_name, owner_role (owner, manager, chef…), business_name exactly as they named it, business_type in 2 to 5 English words ("South Indian restaurant", "bike service garage", "unisex salon").
- area: one of the covered areas, only when clearly the same place (HSR = HSR Layout, Koramangala 5th block = Koramangala); otherwise null, with their words in address. address is the street address they gave. phone is the number as digits, with +91 when it is an Indian mobile.
- description: one or two English sentences in the owner's voice ("We serve …") built only from what they said.
- open_time, close_time 24-hour HH:MM; days 0 = Sunday to 6 = Saturday, null when they did not say or said every day.
- cost_for_two only if they said it. amenities only from the allowed list, only when said (veg-only place → pure_veg; bar or beer → serves_alcohol; terrace → rooftop). cuisines in English.
- products: every product, dish, service or offer they mentioned. title is a short, appealing English title customers would search for, in Title Case, without the price ("Chicken Dum Biryani", "Family Biryani Pack for 4", "Haircut and Beard Trim"). description is one plain sentence. price is the price they will charge in rupees; when they say a usual price and an offer price, price is the offer and original_price is the usual one. per_month is true for monthly plans and memberships. party_min and party_max when the product is for a group ("for 4" → 4 and 4).`,

  deal: `A business owner is describing one deal by voice for YOLO Deals, a deals app in Bengaluru. Fill in the deal. ${COMMON}

- offering: what it is in plain words ("Chicken biryani family pack for 4"). title: a short, appealing English title in Title Case without the price. short_description: one line under 100 characters. description: two or three sentences: what is included and anything to know, only from what they said.
- price is the offer price in rupees, original_price the usual price if they said one.
- start_time, end_time 24-hour HH:MM when they said hours; days 0 = Sunday to 6 = Saturday, null for every day.
- party_min, party_max for a group size. keywords: words customers would search for it by, in English, lower case.
- needs_booking is true when customers must book a time or reserve (tables, appointments, slots). slot_capacity is how many bookings one time slot takes, if they said ("6 tables").`,
};

const FORMATS = {
  customer: betaZodOutputFormat(CustomerSchema),
  merchant: betaZodOutputFormat(MerchantSchema),
  deal: betaZodOutputFormat(DealSchema),
};

// Quick for spoken commands; more thought for a whole business description.
const EFFORT = { customer: 'low', merchant: 'medium', deal: 'low' } as const;

const LANG_NAME: Record<string, string> = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'kn-IN': 'Kannada' };

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'no_key' }, { status: 503 });
  }

  let body: {
    task?: string;
    text?: string;
    lang?: string;
    today?: string;
    now?: string;
    areas?: string[];
    mode?: string;
    business?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const task = body.task;
  const text = (body.text ?? '').trim();
  if ((task !== 'customer' && task !== 'merchant' && task !== 'deal') || !text || text.length > MAX_CHARS) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const context = [
    'Today in Bengaluru: ' + (body.today ?? '') + ', ' + (body.now ?? '') + '.',
    'The speaker chose ' + (LANG_NAME[body.lang ?? ''] ?? 'English') + ' for speech recognition.',
    'Areas the app covers: ' + (body.areas ?? []).join(', ') + '.',
    body.mode === 'merchant'
      ? 'They are the owner of ' + (body.business || 'a business') + ', on their merchant screens.'
      : 'They are a customer.',
  ].join('\n');

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: task === 'merchant' ? 16000 : 8000,
      // If this model declines, the API retries on a suitable fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT[task], format: FORMATS[task] },
      system: SYSTEM[task],
      messages: [{ role: 'user', content: context + '\n\nWhat they said:\n"""\n' + text + '\n"""' }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return Response.json({ error: 'not_understood' }, { status: 422 });
    }
    return Response.json({ result: response.parsed_output });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return Response.json({ error: 'bad_key' }, { status: 503 });
    if (error instanceof Anthropic.RateLimitError) return Response.json({ error: 'busy' }, { status: 429 });
    if (error instanceof Anthropic.APIError) return Response.json({ error: 'upstream' }, { status: 502 });
    return Response.json({ error: 'failed' }, { status: 500 });
  }
}
