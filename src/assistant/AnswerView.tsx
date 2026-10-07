/**
 * An answer in the voice sheet: a heading, a few numbers, plain lines, the
 * deals picked (each with why), codes they hold, and buttons that act. A
 * button can swap in the next answer (confirm → done) or take them away.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { RuleViolation } from '../data/api';
import { color, distanceLabel, inr, radius, space, type } from '../theme/tokens';
import { Button, Icon } from '../components';
import type { Answer, AnswerAction, AnswerCode } from './jobs';
import type { Pick } from './recommend';

export function AnswerView({
  answer,
  onClose,
  onReplace,
}: {
  answer: Answer;
  onClose: () => void;
  onReplace: (next: Answer) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (i: number, action: AnswerAction) => {
    setBusy(i);
    setError(null);
    try {
      const out = await action.run();
      if (out === 'close') onClose();
      else onReplace(out);
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const openPick = (p: Pick) => {
    router.push({
      pathname: '/deal/[id]',
      params: {
        id: p.deal.id,
        ...(p.take ? { take: '1' } : {}),
        ...(p.take && p.take.quantity > 1 ? { qty: String(p.take.quantity) } : {}),
      },
    });
    onClose();
  };

  const lines = (answer.lines ?? []).filter((l): l is string => !!l);
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={styles.titleRow}>
        <View style={[styles.badge, answer.done && styles.badgeDone]}>
          <Icon name={answer.done ? 'check' : 'sparkles'} size={16} color={answer.done ? color.white : color.brand} strokeWidth={2.2} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {answer.title}
        </Text>
      </View>

      {answer.stats ? (
        <View style={styles.stats}>
          {answer.stats.map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text style={[styles.statValue, s.highlight && styles.statGold]} numberOfLines={1} adjustsFontSizeToFit>
                {s.value}
              </Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {lines.map((l) => (
        <Text key={l} style={styles.line}>
          {l}
        </Text>
      ))}

      {answer.picks?.length ? (
        <View style={styles.list}>
          {answer.picks.map((p) => (
            <PickRow key={p.deal.id} pick={p} onPress={() => openPick(p)} />
          ))}
        </View>
      ) : null}

      {answer.codes?.length ? (
        <View style={styles.list}>
          {answer.codes.map((c) => (
            <CodeRow key={c.deal.id + (c.code ?? '')} code={c} />
          ))}
        </View>
      ) : null}

      {answer.note ? <Text style={styles.note}>{answer.note}</Text> : null}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {answer.actions?.length ? (
        <View style={styles.actions}>
          {answer.actions.map((a, i) => (
            <Button
              key={a.label}
              variant={a.tone === 'cta' ? 'cta' : a.tone === 'danger' ? 'primary' : 'secondary'}
              full
              icon={a.icon}
              loading={busy === i}
              disabled={busy !== null && busy !== i}
              onPress={() => void run(i, a)}
            >
              {a.label}
            </Button>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PickRow({ pick, onPress }: { pick: Pick; onPress: () => void }) {
  const d = pick.deal;
  const free = !d.deal_price;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={d.title + ' at ' + d.business.name + (pick.take ? ', order' : ', open')}
      style={({ pressed }) => [styles.pick, pressed && { opacity: 0.8 }]}
    >
      <Image source={{ uri: d.image }} style={styles.pickImage} contentFit="cover" transition={120} />
      <View style={styles.pickText}>
        <Text style={styles.pickTitle} numberOfLines={2}>
          {d.title}
        </Text>
        <Text style={styles.pickMeta} numberOfLines={1}>
          {d.business.name} · {distanceLabel(d.distance_km)}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{free ? 'Free' : inr(d.deal_price!) + (d.price_unit ?? '')}</Text>
          {!free && d.original_price && d.original_price > d.deal_price! ? (
            <Text style={styles.was}>{inr(d.original_price)}</Text>
          ) : null}
        </View>
        {pick.why.map((w) => (
          <View key={w} style={styles.whyRow}>
            <Icon name="check" size={12} color={color.textSecondary} strokeWidth={2.4} />
            <Text style={styles.why} numberOfLines={2}>
              {w}
            </Text>
          </View>
        ))}
      </View>
      <Icon name="chev" size={16} color={color.textMuted} />
    </Pressable>
  );
}

function CodeRow({ code }: { code: AnswerCode }) {
  return (
    <View style={styles.code}>
      <View style={styles.pickText}>
        <Text style={styles.pickTitle} numberOfLines={1}>
          {code.deal.title}
        </Text>
        <Text style={styles.pickMeta} numberOfLines={1}>
          {code.deal.business.name} · {code.when}
        </Text>
      </View>
      {code.code ? (
        <Text style={styles.codeText} selectable accessibilityLabel={'Code ' + code.code.split('').join(' ')}>
          {code.code.replace(/^YOLO-/, '')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceSoftAlt,
  },
  badgeDone: {
    backgroundColor: '#047857',
  },
  title: {
    ...type.h3,
    color: color.text,
    flex: 1,
  },
  stats: {
    flexDirection: 'row',
    gap: space.sm,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
    alignItems: 'center',
  },
  statValue: {
    ...type.h2,
    color: color.text,
  },
  statGold: {
    color: color.accentText,
  },
  statLabel: {
    ...type.small,
    color: color.textSecondary,
    marginTop: 2,
  },
  line: {
    ...type.body,
    color: color.text,
  },
  list: {
    gap: space.sm,
  },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  pickImage: {
    width: 76,
    height: 76,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
    alignSelf: 'flex-start',
  },
  pickText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pickTitle: {
    ...type.bodySemibold,
    color: color.text,
  },
  pickMeta: {
    ...type.caption,
    color: color.textSecondary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  price: {
    ...type.bodySemibold,
    color: color.accentText,
  },
  was: {
    ...type.caption,
    color: color.textMuted,
    textDecorationLine: 'line-through',
  },
  whyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 2,
  },
  why: {
    ...type.small,
    color: color.textSecondary,
    flex: 1,
  },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.border,
    backgroundColor: color.surfaceSoftAlt,
  },
  codeText: {
    ...type.h3,
    color: color.text,
    letterSpacing: 2,
  },
  note: {
    ...type.caption,
    color: color.textSecondary,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
  actions: {
    gap: space.sm,
    marginTop: space.xs,
  },
});
