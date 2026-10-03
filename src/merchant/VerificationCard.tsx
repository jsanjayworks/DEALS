/**
 * The YOLO Verified prompt on the merchant dashboard, shown until the badge
 * is granted. Three states, from businesses.verification_status:
 *
 *   unverified  ask for it
 *   pending     waiting on an admin
 *   rejected    the admin's reason, and ask again (the form comes back filled in)
 *
 * The details themselves are collected on /merchant/verify.
 */

import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { db } from '../data';
import type { Business } from '../data/types';
import { useQuery } from '../lib/useQuery';
import { color, radius, space, type } from '../theme/tokens';
import { Button, Icon } from '../components';

export function VerificationCard({ business }: { business: Business }) {
  const pending = business.verification_status === 'pending';
  const rejected = business.verification_status === 'rejected';

  const fetchLast = useCallback(
    () => (rejected ? db.getBusinessVerification(business.id) : Promise.resolve(null)),
    [business.id, rejected],
  );
  const { data: last } = useQuery(fetchLast);

  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Icon name={pending ? 'clock' : rejected ? 'x' : 'shield'} size={20} color={rejected ? color.alert : color.cta} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>
          {pending ? 'Verification in review' : rejected ? 'Verification was declined' : 'Get YOLO Verified'}
        </Text>
        <Text style={styles.body}>
          {pending
            ? 'An admin is checking your GST and registration details. Your deals still go live once approved.'
            : rejected
              ? last?.rejection_reason ?? 'Check your details and ask again.'
              : 'Add your GSTIN or registration details to get the badge customers trust.'}
        </Text>
        {!pending ? (
          <View style={styles.action}>
            <Button small variant="secondary" onPress={() => router.push('/merchant/verify')}>
              {rejected ? 'Fix and ask again' : 'Add business details'}
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    marginHorizontal: space.lg,
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.deal,
    borderWidth: 1,
    borderColor: color.border,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...type.bodySemibold,
    color: color.text,
  },
  body: {
    ...type.caption,
    color: color.textSecondary,
  },
  action: {
    marginTop: space.sm,
  },
});
