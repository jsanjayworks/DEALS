/**
 * The voice assistant's understanding, on the server: what someone said
 * (from speech recognition, in English, Hindi, Kannada or a mix) in, one
 * structured answer out, matching src/voice/types.ts.
 *
 * Uses Claude when ANTHROPIC_API_KEY is set, otherwise Groq's free tier
 * (openai/gpt-oss-120b) when GROQ_API_KEY is set: in .env.local, or the
 * host's environment. Keys never reach the browser. With neither this
 * answers 503 and the app falls back to its built-in rules
 * (src/voice/rules.ts), as it does whenever an answer fails or is unsure.
 *
 * Only a signed-in person may use it, within a daily allowance
 * (use_voice_quota, migration 0017), so nobody can spend the key by finding
 * the URL. The demo and signed-out visitors get 401 and use the built-in
 * rules instead. Without the Supabase settings it refuses everyone (503),
 * unless ASSIST_OPEN_DEV=1 is set for local development; deploys never set it.
 */

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { AMENITY_KEYS } from '../../data/amenities';
import { INTENT_KINDS, SCREENS } from '../../voice/types';

const MODEL = 'claude-opus-5-5';

/** Groq's free tier: a model with strict JSON output, so answers match the schemas below. */
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Longest input and answer per task: a command is a sentence, a business a paragraph or two. */
const MAX_CHARS = { customer: 600, deal: 2000, merchant: 4000 } as const;
const MAX_TOKENS = { customer: 2000, deal: 4000, merchant: 8000 } as const;
/**
 * Groq's free tier refuses a request whose prompt plus answer limit could
 * pass 8,000 tokens a minute, so its answers are capped lower.
 */
const GROQ_MAX_TOKENS = { customer: 1500, deal: 2500, merchant: 4500 } as const;

/**
 * How long the server waits for Claude, a little under how long the app
 * waits (src/voice/assist.ts), so a slow answer is stopped, not billed for
 * nothing. A whole business description takes longest.
 */
const TIMEOUT_MS = { customer: 18_000, deal: 28_000, merchant: 55_000 } as const;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Null when the caller may go ahead, else the response to send. Supabase
 * checks the token itself when the quota function runs as that person.
 */
async function refusal(request: Request, task: keyof typeof MAX_CHARS): Promise<Response | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    // Local development with no backend at all, by explicit choice only.
    if (process.env.ASSIST_OPEN_DEV === '1') return null;
    console.error('assist refused: EXPO_PUBLIC_SUPABASE_URL or its key is not set on the server');
    return Response.json({ error: 'misconfigured' }, { status: 503 });
  }
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return Response.json({ error: 'sign_in' }, { status: 401 });
  try {
    const res = await fetch(SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/use_voice_quota', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_task: task }),
    });
    if (res.status === 401 || res.status === 403) return Response.json({ error: 'sign_in' }, { status: 401 });
    if (!res.ok) return Response.json({ error: 'quota_check' }, { status: 503 });
    if ((await res.json()) !== true) return Response.json({ error: 'daily_limit' }, { status: 429 });
    return null;
  } catch {
    return Response.json({ error: 'quota_check' }, { status: 503 });
  }
}

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
  cost_for_two: nullableInt,
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
- book: they want to book or reserve something, usually a table or a time slot. business is the place's name if they said one; query is what they want (e.g. "dinner table", "haircut"). Resolve date to YYYY-MM-DD from today; a booking is never in the past, so Hindi "kal" and Kannada "naale" mean tomorrow here. time is 24-hour HH:MM: a bare "8" or "8 o'clock" for dinner means 20:00, for lunch 13:00, for breakfast 08:00. people is the party size.
- go: they want a screen of the app. screen is one of: my_deals (their deals, codes, orders or bookings as a customer), saved, notifications, profile, help, order_history, vehicle, home, search; or for a business owner: merchant_dashboard, merchant_bookings, merchant_redeem, merchant_new_deal, merchant_deals, merchant_insights.
- open_business: they name a place and want to look at it, not book it ("show me Rangoli Kitchen").

Jobs the app answers from the customer's own orders (prefer these over search when they fit):
- recommend: they want suggestions picked for them: "what's the best deal for me today", "what should I eat tonight", "surprise me", "suggest a good lunch under 200". query is the English topic and limits if any ("lunch under 200", "dinner tonight"), else null.
- reorder: they want their usual or a past order again: "order my usual", "same biryani as last time", "repeat my last order". query is the thing if they named one ("biryani", "coffee"), else null.
- savings: how much they saved or spent with the app.
- my_codes: their codes, QR or upcoming bookings ("what's my code", "when is my table booking"). business if they named a place.
- cancel: cancel one of their orders or bookings. business and query (what it was) when said. The app asks them to confirm.
- business_info: a question about one place: is it open, timings, cost for two, rating ("is Rangoli Kitchen open now"). business is the name.
- not_interested: they do not want something suggested again ("not for me", "show less of this", "I don't eat here", "stop suggesting this", "stop suggesting this place", "don't recommend biryani"). query is "business" when it is about the place, "category" for that kind of thing, else "deal".
- privacy: about their data. query is "summary" (what do you know about me), "clear" (clear or forget my activity), "off" (turn off personalised suggestions or tracking altogether, naming no particular deal, place or thing) or "on" (turn them on). "Stop suggesting this" is not_interested, never off.

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

const SCHEMAS = { customer: CustomerSchema, merchant: MerchantSchema, deal: DealSchema };

/**
 * The same schemas as JSON Schema for Groq's strict mode, which wants every
 * field required and no extra keywords; number bounds are left to zod,
 * which checks every answer again before it is used.
 */
function strictSchema(schema: z.ZodType): unknown {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(
      Object.entries(node)
        .filter(([k]) => !['$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'].includes(k))
        .map(([k, v]) => [k, strip(v)]),
    );
  };
  return strip(z.toJSONSchema(schema, { io: 'output' }));
}

const GROQ_SCHEMAS = {
  customer: strictSchema(CustomerSchema),
  merchant: strictSchema(MerchantSchema),
  deal: strictSchema(DealSchema),
};

// Quick for spoken commands; more thought for a whole business description.
const EFFORT = { customer: 'low', merchant: 'medium', deal: 'low' } as const;

const LANG_NAME: Record<string, string> = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'kn-IN': 'Kannada' };

type Task = keyof typeof MAX_CHARS;

async function askClaude(task: Task, said: string, signal: AbortSignal): Promise<Response> {
  const client = new Anthropic({ timeout: TIMEOUT_MS[task], maxRetries: 0 });
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS[task],
      // If this model declines, the API retries on a suitable fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT[task], format: FORMATS[task] },
      system: SYSTEM[task],
      messages: [{ role: 'user', content: said }],
    },
    // If the app gives up first, stop the call then too.
    { signal });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return Response.json({ error: 'not_understood' }, { status: 422 });
    }
    return Response.json({ result: response.parsed_output });
  } catch (error) {
    // The app stopped waiting: nothing to log, nobody to answer.
    if (error instanceof Anthropic.APIUserAbortError) return new Response(null, { status: 499 });
    if (error instanceof Anthropic.APIConnectionTimeoutError) return Response.json({ error: 'slow' }, { status: 504 });
    // Shows in the host's logs; the person just gets the built-in rules.
    console.error('assist failed', task, error instanceof Error ? error.message : error);
    if (error instanceof Anthropic.AuthenticationError) return Response.json({ error: 'bad_key' }, { status: 503 });
    if (error instanceof Anthropic.RateLimitError) return Response.json({ error: 'busy' }, { status: 429 });
    if (error instanceof Anthropic.APIError) return Response.json({ error: 'upstream' }, { status: 502 });
    return Response.json({ error: 'failed' }, { status: 500 });
  }
}

async function askGroq(task: Task, said: string, signal: AbortSignal): Promise<Response> {
  // Stop at our own deadline, or when the app stops waiting, whichever is first.
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS[task]);
  const onLeave = () => stop.abort();
  signal.addEventListener('abort', onLeave);
  const ask = () =>
    fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM[task] },
          { role: 'user', content: said },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: task, strict: true, schema: GROQ_SCHEMAS[task] },
        },
        // Little thinking: it is quick, and the free tier counts its tokens.
        reasoning_effort: 'low',
        reasoning_format: 'hidden',
        max_completion_tokens: GROQ_MAX_TOKENS[task],
      }),
      signal: stop.signal,
    });
  try {
    let res = await ask();
    // The free tier allows a few requests a minute; when the wait is short, wait once.
    const wait = Number(res.headers.get('retry-after'));
    if (res.status === 429 && wait > 0 && wait <= 6) {
      await res.body?.cancel().catch(() => {});
      await new Promise((done) => setTimeout(done, wait * 1000));
      res = await ask();
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      console.error('assist failed', task, 'groq', res.status, detail);
      if (res.status === 401 || res.status === 403) return Response.json({ error: 'bad_key' }, { status: 503 });
      if (res.status === 429 || res.status === 413) return Response.json({ error: 'busy' }, { status: 429 });
      // 400 is usually an answer that did not fit the schema: the rules take over.
      if (res.status === 400) return Response.json({ error: 'not_understood' }, { status: 422 });
      return Response.json({ error: 'upstream' }, { status: 502 });
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string | null }; finish_reason?: string }[] };
    const choice = data.choices?.[0];
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(choice?.message?.content ?? '');
    } catch {
      parsed = null;
    }
    // Checked again here: nothing reaches the app that the schema does not allow.
    const checked = SCHEMAS[task].safeParse(parsed);
    if (choice?.finish_reason !== 'stop' || !checked.success) {
      return Response.json({ error: 'not_understood' }, { status: 422 });
    }
    return Response.json({ result: checked.data });
  } catch (error) {
    if (signal.aborted) return new Response(null, { status: 499 });
    if (stop.signal.aborted) return Response.json({ error: 'slow' }, { status: 504 });
    console.error('assist failed', task, 'groq', error instanceof Error ? error.message : error);
    return Response.json({ error: 'failed' }, { status: 500 });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onLeave);
  }
}

export async function POST(request: Request) {
  const provider = process.env.ANTHROPIC_API_KEY ? 'claude' : process.env.GROQ_API_KEY ? 'groq' : null;
  if (!provider) {
    return Response.json({ error: 'no_key' }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  // Anyone can post here: check every field's type before using it.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const fields = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const body = {
    task: str(fields.task),
    text: str(fields.text),
    lang: str(fields.lang),
    today: str(fields.today),
    now: str(fields.now),
    areas: fields.areas,
    mode: str(fields.mode),
    business: fields.business,
  };
  const task = body.task;
  const text = (body.text ?? '').trim();
  if ((task !== 'customer' && task !== 'merchant' && task !== 'deal') || !text || text.length > MAX_CHARS[task]) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const refused = await refusal(request, task);
  if (refused) return refused;

  // Everything that reaches the prompt is bounded, not only the words said.
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today ?? '') ? body.today : '';
  const now = /^\d{2}:\d{2}$/.test(body.now ?? '') ? body.now : '';
  const areas = (Array.isArray(body.areas) ? body.areas : [])
    .filter((a): a is string => typeof a === 'string')
    .slice(0, 60)
    .map((a) => a.slice(0, 40));
  const business = typeof body.business === 'string' ? body.business.slice(0, 80) : '';
  const context = [
    'Today in Bengaluru: ' + today + ', ' + now + '.',
    'The speaker chose ' + (LANG_NAME[body.lang ?? ''] ?? 'English') + ' for speech recognition.',
    'Areas the app covers: ' + areas.join(', ') + '.',
    body.mode === 'merchant'
      ? 'They are the owner of ' + (business || 'a business') + ', on their merchant screens.'
      : 'They are a customer.',
  ].join('\n');

  const said = context + '\n\nWhat they said:\n"""\n' + text + '\n"""';
  return provider === 'claude' ? askClaude(task, said, request.signal) : askGroq(task, said, request.signal);
}
