/**
 * The four facts that decide a deal, as a 2 × 2 bento grid on the deal page:
 *
 *   Price   what it costs and what you save (the hero tile, in the theme's hero colours)
 *   Left    how many are left, with a ring for how fast it is going
 *   When    the daily window, and when the deal ends
 *   Where   how far, roughly how long to get there; tap for directions
 *
 * When a deal has no capacity limit, the second tile shows its rating instead.
 *
 * Only the price tile is highlighted, and the saving is the gold chip inside
 * it: one thing on the grid should stand out, and it is what the deal is worth.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import type { DealCardModel } from '../data/types';
import { availabilityLabel } from '../lib/format';
import { Icon } from '../components';
import { color, distanceLabel, font, inr, radius, space, theme, type } from '../theme/tokens';

const GAP = 10;

/** "5h left", "13d left": short enough to share a line with the days. */
function leftLabel(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return Math.max(1, Math.round(ms / 60_000)) + ' min left';
  if (hours < 24) return hours + 'h left';
  return Math.round(hours / 24) + 'd left';
}

/** Walking time under 2 km, road time beyond: what a person would actually do. */
function travelLabel(km: number): string {
  if (km < 2) return Math.max(1, Math.round((km * 1000) / 80)) + ' min walk';
  return Math.max(5, Math.round((km / 22) * 60)) + ' min by road';
}

export function DealTiles({
  deal,
  saving,
  lowStock,
  onDirections,
}: {
  deal: DealCardModel;
  saving: number;
  lowStock: boolean;
  onDirections: () => void;
}) {
  const [days, window] = availabilityLabel(deal.availability).split(' · ');
  const hasCap = deal.capacity_total != null && deal.capacity_remaining != null;
  const taken = hasCap ? deal.capacity_total! - deal.capacity_remaining! : 0;
  const free = deal.deal_price === 0;

  return (
    <View style={styles.grid}>
      <View style={[styles.tile, styles.hero]}>
        <LinearGradient
          colors={theme.hero.colors}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Text style={[styles.kicker, styles.kickerOnHero]}>Deal price</Text>
        <Text style={[styles.big, styles.bigOnHero]} adjustsFontSizeToFit numberOfLines={1}>
          {free ? 'Free' : inr(deal.deal_price ?? 0)}
          {deal.price_unit ? <Text style={styles.unit}>{deal.price_unit}</Text> : null}
        </Text>
        {deal.original_price != null && saving > 0 ? (
          <View style={styles.saveRow}>
            <Text style={[styles.subOnHero, styles.was]}>{inr(deal.original_price)}</Text>
            <View style={styles.saveChip}>
              <Text style={styles.saveText} numberOfLines={1}>
                Save {inr(saving)}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.subOnHero} numberOfLines={1}>
            {deal.taxes_note ?? 'No payment in the app'}
          </Text>
        )}
      </View>

      {hasCap ? (
        <View style={styles.tile}>
          <Text style={styles.kicker}>{deal.capacity_remaining === 0 ? 'Sold out' : 'Left'}</Text>
          <Text style={[styles.big, lowStock && { color: color.alert }]}>{deal.capacity_remaining}</Text>
          <Text style={styles.sub}>of {deal.capacity_total} · {taken} taken</Text>
          <View style={styles.ring} pointerEvents="none">
            <Ring fraction={deal.capacity_total ? taken / deal.capacity_total : 0} alert={lowStock} />
          </View>
        </View>
      ) : (
        <View style={styles.tile}>
          <Text style={styles.kicker}>Rating</Text>
          <Text style={styles.big}>{deal.business.rating_avg > 0 ? deal.business.rating_avg.toFixed(1) : 'New'}</Text>
          <Text style={styles.sub}>
            {deal.business.rating_count > 0 ? deal.business.rating_count + ' reviews' : 'No reviews yet'}
          </Text>
        </View>
      )}

      <View style={styles.tile}>
        <Text style={styles.kicker}>When</Text>
        {/* Shrinks for a long window ("12 PM–3:30 PM"): the web build cannot fit text to its box. */}
        <Text
          style={[styles.big, styles.mid, (window ?? days).length > 10 && styles.long]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {window ?? days}
        </Text>
        <Text style={[styles.sub, deal.ending_soon && { color: color.alert }]} numberOfLines={1}>
          {(window ? days + ' · ' : '') + leftLabel(deal.ends_at)}
        </Text>
      </View>

      <Pressable
        onPress={onDirections}
        accessibilityRole="button"
        accessibilityLabel={'Directions, ' + distanceLabel(deal.distance_km) + ' away'}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      >
        <Text style={styles.kicker}>Where</Text>
        <Text style={[styles.big, styles.mid]}>{distanceLabel(deal.distance_km)}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {travelLabel(deal.distance_km)}
        </Text>
        {/* The whole tile opens directions; the badge says so without a word that gets cut off. */}
        <View style={styles.go} pointerEvents="none">
          <Icon name="map" size={16} color={color.brand} />
        </View>
      </Pressable>
    </View>
  );
}

/** Share taken, as an arc that fills clockwise from the top. */
function Ring({ fraction, alert }: { fraction: number; alert: boolean }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      <Circle cx={22} cy={22} r={r} fill="none" stroke={color.surfaceSoftAlt} strokeWidth={6} />
      <Circle
        cx={22}
        cy={22}
        r={r}
        fill="none"
        stroke={alert ? color.alert : color.brand}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, fraction)))}
        transform="rotate(-90 22 22)"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    marginTop: space.lg,
  },
  tile: {
    width: '48.5%',
    flexGrow: 1,
    height: 108,
    borderRadius: radius.xxl - 2,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md + 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hero: {
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.8,
  },
  kicker: {
    ...type.overline,
    fontSize: 10.5,
    color: color.textMuted,
  },
  kickerOnHero: {
    color: theme.hero.muted,
  },
  big: {
    fontFamily: font.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: color.text,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  bigOnHero: {
    color: theme.onSelected ?? theme.hero.text,
  },
  mid: {
    fontSize: 21,
    lineHeight: 28,
  },
  long: {
    fontSize: 16,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  unit: {
    fontFamily: font.medium,
    fontSize: 13,
    color: theme.hero.muted,
  },
  sub: {
    ...type.small,
    color: color.textSecondary,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  was: {
    textDecorationLine: 'line-through',
  },
  saveChip: {
    flexShrink: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: theme.onSelected ?? color.cta,
  },
  saveText: {
    fontFamily: font.bold,
    fontSize: 11.5,
    lineHeight: 16,
    color: theme.hero.colors[1] ?? color.text,
  },
  subOnHero: {
    ...type.small,
    color: theme.hero.muted,
  },
  go: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.surfaceSoftAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});
