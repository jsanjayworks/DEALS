/**
 * Who runs YOLO Deals, for the privacy policy and terms.
 *
 * Fill every field before the site goes live: Indian law expects a named
 * operator and a grievance officer with contact details. The web deploy
 * script (scripts/deploy-web.mjs) refuses to publish while any is empty, and
 * the pages show a warning in development.
 */

export const LEGAL = {
  /** Registered name of the business or company that runs the service. */
  operator: '',
  /** Registered address. */
  address: '',
  /** Where customers and merchants write to. */
  supportEmail: '',
  /** The grievance officer named under the IT Rules, 2021, and the DPDP Act, 2023. */
  grievanceOfficer: '',
  grievanceEmail: '',
  /** Courts for disputes. */
  jurisdiction: 'Bengaluru, Karnataka',
  /** When this version of the policy and terms took effect. */
  effectiveDate: '8 October 2026',
} as const;

/** Fields still empty; the deploy script and the pages read this. */
export function legalGaps(): string[] {
  return Object.entries(LEGAL)
    .filter(([, v]) => typeof v === 'string' && v.trim() === '')
    .map(([k]) => k);
}

/** A field, or a marker that is impossible to miss while it is empty. */
export function legalField(key: keyof typeof LEGAL): string {
  const v = LEGAL[key];
  return v.trim() ? v : '[' + key + ' not set]';
}
