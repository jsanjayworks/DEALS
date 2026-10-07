/**
 * Opening hours by the clock in Bengaluru, whatever the device's time zone.
 * Shared by the shop page and the assistant's "is it open?".
 */

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Minutes since midnight and the weekday (0 = Sunday), in IST. */
export function istClock(at: number = Date.now()): { minutes: number; dow: number; date: string } {
  const ist = new Date(at + 330 * 60_000);
  return {
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    dow: ist.getUTCDay(),
    date: ist.toISOString().slice(0, 10),
  };
}

/** Open now; overnight hours wrap past midnight. Null when the hours are not known. */
export function openNow(open: string | null | undefined, close: string | null | undefined, at?: number): boolean | null {
  if (!open || !close) return null;
  const now = istClock(at).minutes;
  const a = toMin(open);
  const b = toMin(close);
  return a <= b ? now >= a && now < b : now >= a || now < b;
}

/** Where now sits in a daily window: before it, inside it, or after it. */
export function windowState(start: string, end: string, at?: number): 'before' | 'open' | 'after' {
  const now = istClock(at).minutes;
  const a = toMin(start);
  const b = toMin(end);
  if (a > b) return now >= a || now < b ? 'open' : 'before';
  return now < a ? 'before' : now < b ? 'open' : 'after';
}
