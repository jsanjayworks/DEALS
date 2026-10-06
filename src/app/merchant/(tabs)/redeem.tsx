/**
 * Redeem: the counter screen. A customer shows a code, staff type it, and it
 * is marked used so the same code cannot be shown twice.
 *
 * Codes never contain O, 0, I or 1 (see domain/rules), so typing them from a
 * phone held up across a counter is unambiguous. Scanning the QR needs the
 * camera module and a development build; typing works everywhere today.
 */

import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { backend, db, RuleViolation } from '../../../data';
import { DEMO_REDEEM_CODE } from '../../../data/local';
import type { CustomerAction, DealCardModel } from '../../../data/types';
import { ACTION_LABEL, slotLabel } from '../../../lib/format';
import { hapticSuccess } from '../../../lib/device';
import { color, font, radius, size, space, status as statusColor, type } from '../../../theme/tokens';
import { Button, Header, Icon } from '../../../components';

const PREFIX = 'YOLO-';

interface Redeemed {
  action: CustomerAction;
  deal: DealCardModel | null;
  at: Date;
}

/** Accept "yolo-ab12cd", "AB12CD" or "YOLO AB12CD" and normalise to YOLO-AB12CD. */
function normalise(raw: string): string {
  const body = raw.toUpperCase().replace(/^YOLO[\s-]*/, '').replace(/[^A-Z0-9]/g, '');
  return PREFIX + body.slice(0, 6);
}

export default function RedeemScreen() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Redeemed[]>([]);
  /** The green confirmation belongs to the last attempt only. */
  const [justRedeemed, setJustRedeemed] = useState(false);
  const input = useRef<TextInput>(null);

  const body = normalise(code).slice(PREFIX.length);
  const ready = body.length === 6;

  const redeem = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    setJustRedeemed(false);
    try {
      const action = await db.redeemAction(PREFIX + body);
      const deal = await db.getDeal(action.deal_id);
      hapticSuccess();
      setRecent((r) => [{ action, deal, at: new Date() }, ...r].slice(0, 10));
      setJustRedeemed(true);
      setCode('');
      input.current?.focus();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'Could not check that code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const last = recent[0];

  return (
    <View style={styles.screen}>
      <Header title="Redeem a code" dark />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>Type the code the customer shows you.</Text>
        {backend === 'local' ? (
          <Text style={styles.demoHint}>Demo: the demo customer holds {DEMO_REDEEM_CODE} for the dosa deal.</Text>
        ) : null}

        <View style={[styles.codeBox, error && styles.codeBoxError]}>
          <Text style={styles.prefix}>{PREFIX}</Text>
          <TextInput
            ref={input}
            value={body}
            onChangeText={(t) => {
              setCode(t);
              setError(null);
            }}
            onSubmitEditing={() => void redeem()}
            placeholder="K7M2QX"
            placeholderTextColor={color.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="Redemption code"
            style={styles.codeInput}
          />
        </View>
        {error ? (
          <View style={styles.errorBox} accessibilityLiveRegion="assertive">
            <Icon name="x" size={16} color={statusColor.danger.fg} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.submit}>
          <Button variant="cta" full loading={busy} disabled={!ready} onPress={() => void redeem()}>
            Redeem
          </Button>
        </View>

        {last && justRedeemed ? (
          <View style={styles.success} accessibilityLiveRegion="polite">
            <View style={styles.tick}>
              <Icon name="check" size={22} color={color.onCta} strokeWidth={2.4} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.successTitle}>
                {last.action.redemption_code} redeemed
              </Text>
              <Text style={styles.successBody}>
                {(last.deal?.title ?? 'Deal') +
                  ' · ' +
                  ACTION_LABEL[last.action.action_type] +
                  (last.action.quantity > 1 ? ' for ' + last.action.quantity : '')}
              </Text>
              {last.action.slot_start ? (
                <Text style={styles.successBody}>{slotLabel(last.action.slot_start)}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {recent.length > 1 ? (
          <>
            <Text style={styles.sectionTitle}>Earlier this session</Text>
            {recent.slice(1).map((r) => (
              <View key={r.action.id} style={styles.row}>
                <Text style={styles.rowCode}>{r.action.redemption_code}</Text>
                <Text style={styles.rowDeal} numberOfLines={1}>
                  {r.deal?.title ?? ''}
                </Text>
                <Text style={styles.rowTime}>
                  {r.at.getHours() + ':' + String(r.at.getMinutes()).padStart(2, '0')}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: space.xl,
    paddingBottom: space.xxxl,
  },
  demoHint: {
    ...type.caption,
    color: color.textSecondary,
    marginTop: space.xs,
  },
  lead: {
    ...type.body,
    color: color.textSecondary,
    marginBottom: space.lg,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    paddingHorizontal: space.lg,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: color.brand,
    backgroundColor: color.surface,
  },
  codeBoxError: {
    borderColor: color.alert,
  },
  prefix: {
    fontFamily: font.bold,
    fontSize: 28,
    letterSpacing: 2,
    color: color.textMuted,
  },
  codeInput: {
    flex: 1,
    // Without this the web input keeps its 20-character default width and
    // pushes the whole column sideways on a phone.
    minWidth: 0,
    height: '100%',
    fontFamily: font.bold,
    fontSize: 28,
    letterSpacing: 4,
    color: color.text,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: statusColor.danger.bg,
  },
  errorText: {
    ...type.captionMedium,
    color: statusColor.danger.fg,
    flex: 1,
  },
  submit: {
    marginTop: space.lg,
  },
  success: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  tick: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.cta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    ...type.bodySemibold,
    color: color.text,
  },
  successBody: {
    ...type.caption,
    color: color.textSecondary,
  },
  sectionTitle: {
    ...type.overline,
    color: color.textSecondary,
    marginTop: space.xxl,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: size.touchTarget,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  rowCode: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.text,
    letterSpacing: 1,
  },
  rowDeal: {
    ...type.caption,
    color: color.textSecondary,
    flex: 1,
  },
  rowTime: {
    ...type.small,
    color: color.textMuted,
    fontVariant: ['tabular-nums'],
  },
});
