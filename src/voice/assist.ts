/**
 * Asks the server (Claude) what was meant, and falls back to the built-in
 * rules when it cannot answer: no API key, offline, slow or unsure. The
 * caller gets the same shape either way, and which one answered.
 */

import { LOCALITIES } from '../data/seed-reference';
import { ruleCustomerIntent, ruleDealDraft, ruleMerchantProfile } from './rules';
import type { AssistMode, AssistTask, CustomerIntent, DealVoiceDraft, MerchantProfile, VoiceLang } from './types';

type ResultOf<T extends AssistTask> = T extends 'customer'
  ? CustomerIntent
  : T extends 'merchant'
    ? MerchantProfile
    : DealVoiceDraft;

const TIMEOUT_MS = 20_000;

/** Today and the time in Bengaluru, whatever the device's clock zone. */
export function bengaluruNow(at: Date = new Date()): { today: string; now: string } {
  const ist = new Date(at.getTime() + 330 * 60_000).toISOString();
  return { today: ist.slice(0, 10), now: ist.slice(11, 16) };
}

function rules<T extends AssistTask>(task: T, text: string, today: string, mode: AssistMode): ResultOf<T> {
  if (task === 'customer') return ruleCustomerIntent(text, today, mode) as ResultOf<T>;
  if (task === 'merchant') return ruleMerchantProfile(text) as ResultOf<T>;
  return ruleDealDraft(text) as ResultOf<T>;
}

export async function understand<T extends AssistTask>(
  task: T,
  text: string,
  lang: VoiceLang,
  who: { mode?: AssistMode; business?: string | null } = {},
): Promise<{ result: ResultOf<T>; source: 'ai' | 'rules' }> {
  const mode = who.mode ?? 'customer';
  const { today, now } = bengaluruNow();
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('/api/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task,
        text,
        lang,
        today,
        now,
        areas: LOCALITIES.map((l) => l.name),
        mode,
        business: who.business ?? null,
      }),
      signal: controller?.signal,
    });
    if (res.ok) {
      const body = (await res.json()) as { result?: ResultOf<T> };
      if (body.result) return { result: body.result, source: 'ai' };
    }
  } catch {
    // Offline, timed out, or no server: the rules answer instead.
  } finally {
    clearTimeout(timer);
  }
  return { result: rules(task, text, today, mode), source: 'rules' };
}
