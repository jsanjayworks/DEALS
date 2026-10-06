/**
 * Business verification: businesses that asked for the YOLO Verified badge,
 * oldest first, with their registration details.
 *
 * The numbers have already passed format and check-digit validation; what is
 * left for a person is whether they are real and belong to this business. The
 * GSTIN links to the public GST taxpayer search to check the registered name
 * and address (GSTINs are selectable to paste in). A flag shows when the same GSTIN or PAN is on another business.
 *
 * Approving runs review_business(), which grants the badge and records the
 * registered name and number on the business; a decline needs a reason the
 * owner can act on, and they see it on their dashboard.
 */

import { useCallback, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { db, RuleViolation, type VerificationRequest } from '../../data';
import { dateLabel } from '../../lib/format';
import { CONSTITUTION_LABEL, GST_PORTAL_URL, LICENCE_LABEL, stateOfGstin } from '../../lib/india-ids';
import { hapticSuccess } from '../../lib/device';
import { useQuery } from '../../lib/useQuery';
import { color, radius, space, status as statusColor, type } from '../../theme/tokens';
import { Button, EmptyState, Field, Header, Icon } from '../../components';

export default function BusinessVerificationScreen() {
  const fetchQueue = useCallback(() => db.listVerificationQueue(), []);
  const { data, loading, reload } = useQuery(fetchQueue);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ text: string; approved: boolean } | null>(null);
  /** Errors belong to one business's card: the one acted on. */
  const [errorFor, setErrorFor] = useState<string | null>(null);

  const decide = async (req: VerificationRequest, approve: boolean) => {
    setErrorFor(req.business_id);
    // The server wants a reason the owner can act on: at least a few words.
    if (!approve && reason.trim().length < 5) {
      setError('Say what is missing, in a few words. The owner sees this.');
      return;
    }
    setBusy(req.business_id);
    setError(null);
    try {
      await db.reviewBusiness(req.business_id, approve, approve ? undefined : reason.trim());
      if (approve) hapticSuccess();
      setLast({ text: req.name + (approve ? ' is now YOLO Verified.' : ' was declined.'), approved: approve });
      setDeclining(null);
      setReason('');
      reload();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const queue = data ?? [];

  return (
    <View style={styles.screen}>
      <Header title="Business verification" dark onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
      <FlatList
        data={queue}
        keyExtractor={(r) => r.business_id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {last ? (
              <Text style={[styles.banner, !last.approved && styles.bannerDeclined]} accessibilityLiveRegion="polite">
                {last.text}
              </Text>
            ) : null}
            {queue.length > 0 ? <Text style={styles.count}>{queue.length} waiting</Text> : null}
          </>
        }
        renderItem={({ item }) => {
          const isDeclining = declining === item.business_id;
          return (
            <View style={styles.card}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {[item.category_name, item.locality_name].filter(Boolean).join(' · ')}
              </Text>
              {item.same_id_elsewhere > 0 ? (
                <View style={styles.flag}>
                  <Icon name="shield" size={14} color={color.alert} />
                  <Text style={styles.flagText}>
                    This {item.gstin ? 'GSTIN or PAN' : 'PAN'} is also on {item.same_id_elsewhere} other{' '}
                    {item.same_id_elsewhere === 1 ? 'business' : 'businesses'}. Check they share an owner.
                  </Text>
                </View>
              ) : null}
              <View style={styles.rows}>
                <Row label="Registered" value={item.legal_name} />
                <Row label="Type" value={CONSTITUTION_LABEL[item.constitution] ?? item.constitution} />
                {item.gstin ? (
                  <>
                    <Row label="GSTIN" value={item.gstin + ' · ' + (stateOfGstin(item.gstin) ?? '')} mono />
                    <Pressable
                      onPress={() => void Linking.openURL(GST_PORTAL_URL)}
                      accessibilityRole="link"
                      hitSlop={6}
                      style={styles.portal}
                    >
                      <Text style={styles.portalText}>Check on the GST portal (Search Taxpayer)</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Row label="PAN" value={item.pan} mono />
                    <Row
                      label={item.licence_type ? LICENCE_LABEL[item.licence_type] : 'Licence'}
                      value={item.licence_number ?? '—'}
                      mono
                    />
                  </>
                )}
                {item.fssai ? <Row label="FSSAI" value={item.fssai} mono /> : null}
                <Row label="Reg. address" value={item.registered_address} />
                <Row label="Shop" value={item.address_line} />
                <Row
                  label="Applicant"
                  value={item.owner_name + ' · ' + item.owner_role.charAt(0).toUpperCase() + item.owner_role.slice(1)}
                />
                <Row label="Phone" value={item.phone || '—'} />
                <Row label="Asked" value={dateLabel(item.submitted_at)} />
              </View>

              {isDeclining ? (
                <Field
                  label="Reason"
                  value={reason}
                  onChangeText={(t) => {
                    setReason(t);
                    setError(null);
                  }}
                  placeholder="e.g. name differs from GST record"
                  error={errorFor === item.business_id ? error : null}
                  accessibilityLabel="Reason for declining"
                />
              ) : null}

              {/* A failed Verify says why; the decline field shows its own error. */}
              {!isDeclining && error && errorFor === item.business_id ? (
                <Text style={styles.error}>{error}</Text>
              ) : null}
              <View style={styles.actions}>
                {isDeclining ? (
                  <>
                    <View style={styles.flex}>
                      <Button full variant="secondary" onPress={() => setDeclining(null)}>
                        Cancel
                      </Button>
                    </View>
                    <View style={styles.flex}>
                      <Button full loading={busy === item.business_id} onPress={() => void decide(item, false)}>
                        Decline
                      </Button>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.flex}>
                      <Button
                        full
                        variant="secondary"
                        onPress={() => {
                          setDeclining(item.business_id);
                          setReason('');
                          setError(null);
                        }}
                      >
                        Decline
                      </Button>
                    </View>
                    <View style={styles.flex}>
                      <Button
                        full
                        variant="cta"
                        loading={busy === item.business_id}
                        onPress={() => void decide(item, true)}
                      >
                        Verify
                      </Button>
                    </View>
                  </>
                )}
              </View>
            </View>
          );
        }}
        ItemSeparatorComponent={Gap}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState icon="shield" title="Nobody waiting" body="Verification requests will appear here." />
          )
        }
      />
    </View>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} selectable>
        {value}
      </Text>
    </View>
  );
}

function Gap() {
  return <View style={{ height: space.md }} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  flex: {
    flex: 1,
  },
  list: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: space.lg,
  },
  banner: {
    ...type.captionMedium,
    color: statusColor.active.fg,
    backgroundColor: statusColor.active.bg,
    padding: space.md,
    borderRadius: radius.lg,
    marginBottom: space.md,
  },
  bannerDeclined: {
    color: statusColor.pending.fg,
    backgroundColor: statusColor.pending.bg,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
  count: {
    ...type.caption,
    color: color.textSecondary,
    marginBottom: space.md,
  },
  card: {
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.sm,
  },
  name: {
    ...type.h3,
    color: color.text,
  },
  meta: {
    ...type.caption,
    color: color.textSecondary,
  },
  rows: {
    gap: 4,
    paddingVertical: space.sm,
  },
  row: {
    flexDirection: 'row',
    gap: space.md,
  },
  rowLabel: {
    ...type.caption,
    color: color.textMuted,
    width: 92,
  },
  mono: {
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  portal: {
    marginLeft: 92 + space.md,
    marginBottom: 4,
  },
  portalText: {
    ...type.captionMedium,
    color: color.brand,
  },
  flag: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: '#FDECEF',
  },
  flagText: {
    ...type.caption,
    color: color.text,
    flex: 1,
  },
  rowValue: {
    ...type.caption,
    color: color.text,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
});
