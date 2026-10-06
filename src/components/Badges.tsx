/**
 * Badges and status pills, from `Badge`, `Off`, `Verified` and `Status` in
 * docs/design/figma-make/ui.tsx.
 *
 * Two different vocabularies live here on purpose:
 *   Badge      marketing flags on a card — Trending, Ending Soon, Flash Deal
 *   StatusPill lifecycle state — Draft, Active, Rejected, and the rest
 */

import { StyleSheet, Text, View } from 'react-native';
import { color, font, radius, status as statusColor, theme, type } from '../theme/tokens';
import type { StatusTone } from '../theme/tokens';
import type { DealStatus } from '../data/types';
import { STATUS_LABEL } from '../domain/lifecycle';
import { Icon } from './Icon';

export type BadgeKind = 'Ending Soon' | 'Trending' | 'New' | 'Flash Deal' | 'Free';

/**
 * Marketing flags are ink pills: they sit on photos of every colour, and a
 * tinted flag on a tinted photo is noise. Words do the distinguishing.
 */
export function Badge({ kind }: { kind: BadgeKind }) {
  return (
    <View style={[styles.badge, styles.ink]}>
      <Text style={[styles.badgeText, { color: color.text }]}>{kind}</Text>
    </View>
  );
}

/** The discount flag: the theme's highlight pill (navy and gold on premium). */
export function DiscountBadge({ percent }: { percent: number }) {
  if (percent <= 0) return null;
  return (
    <View style={[styles.badge, styles.discount]}>
      <Text style={[styles.badgeText, styles.tabular, { color: theme.countPill.text }]}>
        {percent + '% off'}
      </Text>
    </View>
  );
}

export function VerifiedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.verified}>
      <View style={styles.verifiedTick}>
        <Icon name="check" size={9} color={color.white} strokeWidth={2.6} />
      </View>
      {!compact ? <Text style={styles.verifiedText}>YOLO Verified</Text> : null}
    </View>
  );
}

/**
 * Lifecycle and action states. The design reaches for Tailwind's emerald /
 * amber / sky / red scales rather than the brand palette, so the tones come
 * from theme/tokens `status` which pins those exact values.
 */
const TONE_BY_LABEL: Record<string, StatusTone> = {
  Active: 'active',
  Approved: 'active',
  Published: 'active',
  Claimed: 'active',
  Confirmed: 'active',
  Redeemed: 'active',
  Pending: 'pending',
  'In Verification': 'pending',
  Paused: 'pending',
  Submitted: 'info',
  Sent: 'info',
  Draft: 'neutral',
  Used: 'neutral',
  Completed: 'neutral',
  Archived: 'neutral',
  Rejected: 'danger',
  'Needs changes': 'danger',
  Expired: 'danger',
  Cancelled: 'danger',
};

export function StatusPill({ label, tone }: { label: string; tone?: StatusTone }) {
  const resolved = tone ?? TONE_BY_LABEL[label] ?? 'neutral';
  const { fg, bg } = statusColor[resolved];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** Convenience wrapper so screens pass a DealStatus without mapping it first. */
export function DealStatusPill({ status }: { status: DealStatus }) {
  return <StatusPill label={STATUS_LABEL[status]} />;
}

const styles = StyleSheet.create({
  discount: {
    backgroundColor: theme.countPill.bg,
    shadowColor: color.black,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  ink: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontFamily: font.semibold,
    fontSize: 11,
    lineHeight: 16,
  },
  tabular: {
    fontFamily: font.bold,
    fontVariant: ['tabular-nums'],
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedTick: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedText: {
    fontFamily: font.semibold,
    fontSize: 11,
    lineHeight: 16,
    color: color.brandStrong,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    ...type.tiny,
  },
});
