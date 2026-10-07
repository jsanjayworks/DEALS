/**
 * Ratings and reviews, the way going-out apps show them: a big average with
 * stars and a count, a bar per star level, then the reviews themselves. And
 * the sheet a customer rates a visit in, once their code has been used.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { db, RuleViolation } from '../data';
import type { Review } from '../data/types';
import { shortAgo } from '../lib/format';
import { hapticSuccess, hapticTap } from '../lib/device';
import { color, radius, space, type } from '../theme/tokens';
import { Button, Icon, Sheet } from '../components';

export function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={styles.stars} accessibilityLabel={rating.toFixed(1) + ' out of 5 stars'}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={size} color={i <= Math.round(rating) ? STAR : color.border} filled />
      ))}
    </View>
  );
}

/** The business's average and count, with a bar per star level from the reviews shown. */
export function RatingSummary({ avg, count, reviews }: { avg: number; count: number; reviews: Review[] }) {
  const per = [5, 4, 3, 2, 1].map((s) => reviews.filter((r) => r.rating === s).length);
  const most = Math.max(1, ...per);
  return (
    <View style={styles.summary}>
      <View style={styles.big}>
        <Text style={styles.avg}>{avg > 0 ? avg.toFixed(1) : 'New'}</Text>
        {avg > 0 ? <StarRow rating={avg} size={16} /> : null}
        <Text style={styles.count}>
          {count > 0 ? count.toLocaleString('en-IN') + (count === 1 ? ' rating' : ' ratings') : 'No ratings yet'}
        </Text>
      </View>
      <View style={styles.bars}>
        {[5, 4, 3, 2, 1].map((s, i) => (
          <View key={s} style={styles.barRow}>
            <Text style={styles.barLabel}>{s}</Text>
            <Icon name="star" size={10} color={color.textMuted} filled />
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.round((per[i] / most) * 100)}%` }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ReviewCard({ review, showDeal = true }: { review: Review; showDeal?: boolean }) {
  const name = review.customer_name ?? 'Verified customer';
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.name}>{name}</Text>
          <View style={styles.metaRow}>
            <StarRow rating={review.rating} size={12} />
            <Text style={styles.when}>{shortAgo(review.created_at)} ago</Text>
          </View>
        </View>
        {review.action_id ? (
          <View style={styles.verified}>
            <Icon name="check" size={11} color={color.brand} strokeWidth={2.4} />
            <Text style={styles.verifiedText}>Visited</Text>
          </View>
        ) : null}
      </View>
      {review.body ? <Text style={styles.body}>{review.body}</Text> : null}
      {showDeal && review.deal_title ? <Text style={styles.deal}>On {review.deal_title}</Text> : null}
    </View>
  );
}

/** Gold, as rating stars read everywhere else. */
const STAR = color.cta;

const PROMPTS = ['', 'What went wrong?', 'What could be better?', 'It was okay. Anything to add?', 'What did you like?', 'What made it great?'];

/** Rates one redeemed visit: stars, then a few words if they like. */
export function RateSheet({
  visible,
  actionId,
  title,
  onClose,
  onDone,
}: {
  visible: boolean;
  actionId: string | null;
  title: string;
  onClose: () => void;
  onDone: (review: Review) => void;
}) {
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setStars(0);
    setBody('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!actionId || stars === 0) return;
    setBusy(true);
    setError(null);
    try {
      const review = await db.createReview({ action_id: actionId, rating: stars, body });
      hapticSuccess();
      setStars(0);
      setBody('');
      onDone(review);
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not go through. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Rate your visit"
      footer={
        <Button variant="cta" full loading={busy} disabled={stars === 0} onPress={() => void submit()}>
          {stars === 0 ? 'Tap the stars' : 'Post review'}
        </Button>
      }
    >
      <Text style={styles.rateTitle}>{title}</Text>
      <View style={styles.pickRow} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((i) => (
          <Pressable
            key={i}
            onPress={() => {
              hapticTap();
              setStars(i);
            }}
            accessibilityRole="radio"
            aria-checked={stars === i}
            accessibilityLabel={i + (i === 1 ? ' star' : ' stars')}
            hitSlop={4}
            style={styles.pick}
          >
            <Icon name="star" size={40} color={i <= stars ? STAR : color.border} filled />
          </Pressable>
        ))}
      </View>
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder={stars ? PROMPTS[stars] : 'A few words for others (optional)'}
        placeholderTextColor={color.textMuted}
        multiline
        maxLength={600}
        accessibilityLabel="Your review"
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  summary: {
    flexDirection: 'row',
    gap: space.xl,
    alignItems: 'center',
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  big: {
    alignItems: 'center',
    gap: 4,
    minWidth: 96,
  },
  avg: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '700',
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  count: {
    ...type.small,
    color: color.textSecondary,
  },
  bars: {
    flex: 1,
    gap: 4,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  barLabel: {
    ...type.small,
    color: color.textSecondary,
    width: 10,
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.surfaceSoftAlt,
    overflow: 'hidden',
    marginLeft: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: STAR,
  },
  card: {
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceSoftAlt,
  },
  avatarText: {
    ...type.bodySemibold,
    color: color.brand,
  },
  name: {
    ...type.captionMedium,
    color: color.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  when: {
    ...type.small,
    color: color.textMuted,
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoftAlt,
  },
  verifiedText: {
    ...type.small,
    color: color.brand,
  },
  body: {
    ...type.body,
    color: color.text,
  },
  deal: {
    ...type.small,
    color: color.textMuted,
  },
  rateTitle: {
    ...type.bodySemibold,
    color: color.text,
  },
  pickRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
  },
  pick: {
    padding: 2,
  },
  input: {
    ...type.body,
    color: color.text,
    minHeight: 96,
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    textAlignVertical: 'top',
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
    marginTop: space.sm,
  },
});
