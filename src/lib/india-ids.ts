/**
 * Indian business identifiers: GSTIN, PAN, Udyam and FSSAI numbers.
 *
 * These mirror the checks in submit_business_verification() (0006) so the
 * form can say what is wrong while someone types, instead of after a round
 * trip. The database still checks everything; this is only for feedback.
 *
 * A GSTIN is 15 characters: a 2-digit state code, the holder's 10-character
 * PAN, an entity number, the letter Z, and a check digit computed from the
 * first 14. The check digit catches almost every single-character typo.
 */

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GST state codes, for showing which state a GSTIN was issued in. */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

export type Constitution =
  | 'proprietorship'
  | 'partnership'
  | 'llp'
  | 'private_limited'
  | 'public_limited'
  | 'other';

export const CONSTITUTION_LABEL: Record<Constitution, string> = {
  proprietorship: 'Proprietorship',
  partnership: 'Partnership',
  llp: 'LLP',
  private_limited: 'Private Limited',
  public_limited: 'Public Limited',
  other: 'Other',
};

export type LicenceType = 'udyam' | 'shop_establishment' | 'trade_licence';

export const LICENCE_LABEL: Record<LicenceType, string> = {
  udyam: 'Udyam',
  shop_establishment: 'Shop & Establishment',
  trade_licence: 'Trade licence',
};

/** Upper-case, spaces removed: how numbers are stored and compared. */
export function normaliseId(raw: string): string {
  return raw.replace(/\s/g, '').toUpperCase();
}

function checkDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** Null when the GSTIN is valid; otherwise what is wrong, in words. */
export function gstinProblem(raw: string): string | null {
  const g = normaliseId(raw);
  if (g.length !== 15) return 'A GSTIN has 15 characters';
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) {
    return 'That does not look like a GSTIN. Copy it from your GST certificate';
  }
  if (!GST_STATES[g.slice(0, 2)]) return 'The first two digits are not a GST state code';
  if (checkDigit(g.slice(0, 14)) !== g[14]) return 'That GSTIN has a typo: the last character does not match';
  return null;
}

/** The PAN inside a GSTIN (characters 3 to 12). */
export function panOfGstin(gstin: string): string {
  return normaliseId(gstin).slice(2, 12);
}

export function stateOfGstin(gstin: string): string | null {
  return GST_STATES[normaliseId(gstin).slice(0, 2)] ?? null;
}

export function panProblem(raw: string): string | null {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normaliseId(raw)) ? null : 'A PAN looks like ABCDE1234F';
}

/**
 * Whether the PAN's holder type fits the business type. Mirrors
 * pan_matches_constitution(): P a person (proprietorship), F a firm or LLP,
 * C a company, anything else 'other'.
 */
export function panConstitutionProblem(pan: string, constitution: Constitution): string | null {
  const kind = normaliseId(pan)[3];
  if (kind === 'P') {
    return constitution === 'proprietorship'
      ? null
      : 'This PAN belongs to a person, which means a proprietorship. Check the business type or the number';
  }
  if (kind === 'F') {
    return constitution === 'partnership' || constitution === 'llp'
      ? null
      : 'This PAN belongs to a firm, which means a partnership or LLP. Check the business type or the number';
  }
  if (kind === 'C') {
    return constitution === 'private_limited' || constitution === 'public_limited'
      ? null
      : 'This PAN belongs to a company. Check the business type or the number';
  }
  return constitution === 'other' ? null : 'This PAN is not a person, firm or company. Choose Other, or check the number';
}

export function udyamProblem(raw: string): string | null {
  return /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/.test(raw.trim().toUpperCase())
    ? null
    : 'Udyam numbers look like UDYAM-KR-03-0012345';
}

export function fssaiProblem(raw: string): string | null {
  return /^[0-9]{14}$/.test(raw.replace(/\s/g, '')) ? null : 'FSSAI numbers have 14 digits';
}

/**
 * The GST portal, for an admin checking a GSTIN by hand: its "Search Taxpayer"
 * menu shows the legal name, address and status without logging in. The
 * official manual documents only this path, not a deep link to the search.
 */
export const GST_PORTAL_URL = 'https://www.gst.gov.in/';
