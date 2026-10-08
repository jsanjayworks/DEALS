/**
 * Reads the welcome answers out of one spoken sentence: "I'm Aarav, I'm over
 * 18, and yes to suggestions". Only what was clearly said is filled in; the
 * person sees every field before anything is saved.
 */

export interface WelcomeAnswers {
  name: string | null;
  adult: boolean | null;
  personalise: boolean | null;
}

const NOT_NAMES = new Set(['Over', 'Above', 'Not', 'Under', 'Below', 'Okay', 'Ok', 'Fine', 'Good', 'Yes', 'No']);

const OVER_18 = /\b(over|above|more than|older than)\s*(18|eighteen)\b|\b(18|eighteen)\s*(plus|\+|or older|or over|or above|and above)|\badult\b|(१८|18) से (ज़्यादा|अधिक)/gi;
const UNDER_18 = /\b(under|below|less than|younger than)\s*(18|eighteen)\b|\bnot (yet )?(18|eighteen)\b|\b(minor|underage)\b|(१८|18) से कम/gi;
const AGE = /\b(\d{2})\s*(?:years?|yrs?)\s*old\b/gi;

/** A no anywhere in a stretch of words: "no", "not", "never", "isn't", "nahi". */
const NEGATION = /\b(no|not|never|nope|nah|nahi)\b|n['’]t\b|नहीं/i;
/** A "not" right before what was said: "I'm not an adult", "not over 18". */
const NOT_JUST_BEFORE = /(\b(not|never)|n['’]t)\s+([\w'’]+\s+){0,2}$/i;

const CLAUSE = /[.,;!?]|\b(?:and|but)\b/i;

interface Claim {
  said: string;
  /** The words before it and after it, in the same clause. */
  before: string;
  after: string;
}

/** Each place the pattern is said. */
function claims(t: string, re: RegExp): Claim[] {
  return [...t.matchAll(re)].map((m) => {
    const at = m.index ?? 0;
    return {
      said: m[0],
      before: t.slice(0, at).split(CLAUSE).pop() ?? '',
      after: t.slice(at + m[0].length).split(CLAUSE)[0] ?? '',
    };
  });
}

/** Turned around by a "not" just before it, or by Hindi's नहीं after it. */
const flipped = (c: Claim) => NOT_JUST_BEFORE.test(c.before) || /नहीं/.test(c.after);

/**
 * True or false only when what they said reads one way; a no never makes
 * them an adult. "I'm not over 18" is a no. "I'm not under 18" and "no I'm
 * over 18" are too unclear to act on, so they stay unanswered.
 */
function adultFrom(t: string): boolean | null {
  const over = claims(t, OVER_18);
  const under = claims(t, UNDER_18);
  const ages = claims(t, AGE);
  if (under.some(flipped) || ages.some((c) => NEGATION.test(c.before) || flipped(c))) return null;
  if (over.some((c) => NEGATION.test(c.before) && !flipped(c))) return null;
  const years = ages.map((c) => Number(c.said.match(/\d{2}/)?.[0]));
  const yes = over.some((c) => !flipped(c)) || years.some((y) => y >= 18);
  const no = over.some(flipped) || under.length > 0 || years.some((y) => y < 18);
  return yes && !no ? true : no && !yes ? false : null;
}

export function parseWelcome(said: string): WelcomeAnswers {
  const t = said.replace(/\s+/g, ' ').trim();

  const named = t.match(/(?:\b[Mm]y name is|\b[Cc]all me|\bI['’]m|\bI am|\b[Tt]his is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  const name = named && !NOT_NAMES.has(named[1].split(' ')[0]) ? named[1] : null;

  const adult = adultFrom(t);

  // About suggestions only when they mention them; a stray "yes" decides nothing.
  // A no in that part wins over any yes in it: "not ok", "please don't".
  const about = t.match(/[^.,;]*(suggest\w*|personali[sz]\w*|recommend\w*|सुझाव)[^.,;]*/i);
  let personalise: boolean | null = null;
  if (about) {
    const part = about[0];
    if (NEGATION.test(part) || /\b(off|without)\b/i.test(part)) personalise = false;
    else if (/\b(yes|yeah|yep|sure|ok(ay)?|please|on|go ahead|haan|ha)\b|हाँ|हां/i.test(part)) personalise = true;
  }
  return { name, adult, personalise };
}
