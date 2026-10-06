/**
 * Profile: who you are, and everything about your account in one place.
 *
 *   Activity   my deals, order history, saved deals, notifications
 *   For you    my vehicle, and the interests learned from what they do
 *   Help       help and support (FAQs, contact, your requests), payments and refunds
 *   Account    edit profile (picture, name, email, date of birth), delete account
 *
 * Merchant and admin entries appear only for accounts that have them, from
 * the same data the database checks. Location and radius are not repeated
 * here; they live on Home, where they are changed while looking at deals.
 */

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { auth, backend, db, demoAccounts, resetDemoData } from '../data';
import { useQuery } from '../lib/useQuery';
import { type AccountKind, useSession, useViewer } from '../state/session';
import { choiceLabel } from '../data/vehicles';
import { color, radius, size, space, type } from '../theme/tokens';
import { Avatar, Button, Chip, EmptyState, Header, Icon, type IconName, VerifiedBadge } from '../components';

const ACCOUNT_LABEL: Record<AccountKind, string> = {
  customer: 'Customer',
  merchant: 'Merchant',
  admin: 'Admin',
};

export default function ProfileScreen() {
  const setAccount = useSession((s) => s.setAccount);
  const viewer = useViewer();
  const vehicle = choiceLabel(useSession((s) => s.vehicleId));

  const fetchCounts = useCallback(async () => {
    void viewer;
    const [saved, notifications, actions, taste] = await Promise.all([
      db.listSavedDeals(),
      db.listNotifications(),
      db.listMyActions(),
      db.getMyTaste().catch(() => []),
    ]);
    // What is waiting for an admin, so the work shows before they open each tool.
    const waiting = viewer?.is_admin
      ? await Promise.all([
          db.listReviewQueue().then((q) => q.length),
          db.listVerificationQueue().then((q) => q.length),
          db.listReportsQueue().then((q) => q.length),
          db.listSupportQueue('active').then((q) => q.filter((t) => t.status === 'open').length),
        ]).catch(() => null)
      : null;
    return {
      waiting,
      saved: saved.length,
      unread: notifications.filter((n) => n.read_at === null).length,
      active: actions.filter((a) => a.status === 'pending' || a.status === 'confirmed').length,
      // The few strongest, categories and tags together, without repeats.
      interests: [...new Set(taste.map((t) => t.label.toLowerCase()))].slice(0, 6),
    };
  }, [viewer]);
  const { data } = useQuery(fetchCounts);

  // Signed out: nothing personal to show yet.
  if (!viewer) {
    return (
      <View style={styles.screen}>
        <Header title="Profile" onBack={() => router.back()} />
        <EmptyState
          icon="user"
          title="Sign in to YOLO Deals"
          body="Claim deals, keep your codes and save favourites with a one-time code."
          action={
            <View style={styles.signedOutActions}>
              <Button onPress={() => router.push('/sign-in')}>Sign in</Button>
              <Button variant="secondary" onPress={() => router.push('/business')}>
                Merchant login
              </Button>
            </View>
          }
        />
      </View>
    );
  }

  const name = viewer.full_name || 'Your profile';
  const contact = [viewer.phone, viewer.email].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      <Header title="Profile" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Avatar uri={viewer.avatar_url} name={name} size={64} />
          <View style={styles.cardText}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {contact ? (
              <Text style={styles.phone} numberOfLines={1}>
                {contact}
              </Text>
            ) : null}
            <View style={styles.cardBadges}>
              {viewer.is_yolo_verified ? <VerifiedBadge /> : null}
            </View>
          </View>
          <Button small variant="secondary" onPress={() => router.push('/account/edit')}>
            Edit
          </Button>
        </View>

        {viewer.business_ids.length > 0 ? (
          <ModeCard
            icon="store"
            title="Merchant dashboard"
            body="Create deals, redeem codes and see how they are doing."
            onPress={() => router.push('/merchant')}
          />
        ) : viewer.is_admin ? null : (
          <ModeCard
            icon="store"
            title="List your business"
            body="Free. Post deals for customers nearby and redeem them at the counter."
            onPress={() => router.push('/list-business')}
          />
        )}
        {viewer.is_admin ? (
          <ModeCard
            icon="list"
            title="Review queue"
            body="Approve or send back deals waiting for verification."
            count={data?.waiting?.[0]}
            onPress={() => router.push('/admin')}
          />
        ) : null}
        {viewer.is_admin ? (
          <ModeCard
            icon="shield"
            title="Business verification"
            body="Grant or decline the YOLO Verified badge."
            count={data?.waiting?.[1]}
            onPress={() => router.push('/admin/businesses')}
          />
        ) : null}
        {viewer.is_admin ? (
          <ModeCard
            icon="flag"
            title="Reports"
            body="Deals customers flagged. Dismiss, or pause with a note to the merchant."
            count={data?.waiting?.[2]}
            onPress={() => router.push('/admin/reports')}
          />
        ) : null}
        {viewer.is_admin ? (
          <ModeCard
            icon="chat"
            title="Support inbox"
            body="Answer customer requests about claims, payments and accounts."
            count={data?.waiting?.[3]}
            onPress={() => router.push('/admin/support')}
          />
        ) : null}

        <View style={styles.stats}>
          <Stat label="Active" value={data?.active} onPress={() => router.navigate('/my-deals')} />
          <Stat
            label="Saved"
            value={data?.saved}
            onPress={() => router.navigate({ pathname: '/my-deals', params: { tab: 'saved' } })}
          />
          <Stat label="Unread" value={data?.unread} onPress={() => router.push('/notifications')} />
        </View>

        <Text style={styles.sectionTitle}>Activity</Text>
        <View style={styles.group}>
          <Row
            icon="ticket"
            title="My deals"
            value={data ? String(data.active) : undefined}
            onPress={() => router.navigate('/my-deals')}
          />
          <Row icon="list" title="Order history" onPress={() => router.push('/account/history')} />
          <Row
            icon="heart"
            title="Saved deals"
            value={data ? String(data.saved) : undefined}
            onPress={() => router.navigate({ pathname: '/my-deals', params: { tab: 'saved' } })}
          />
          <Row
            icon="bell"
            title="Notifications"
            value={data?.unread ? data.unread + ' new' : undefined}
            onPress={() => router.push('/notifications')}
            last
          />
        </View>

        <Text style={styles.sectionTitle}>For you</Text>
        <View style={styles.group}>
          <Row
            icon="bike"
            title="My vehicle"
            value={vehicle ? (vehicle.startsWith('your ') ? vehicle.slice(5) : vehicle) : 'Add'}
            onPress={() => router.push('/vehicle')}
          />
          <View style={styles.interests}>
            <Text style={styles.rowTitle}>Your interests</Text>
            <Text style={styles.interestsNote}>
              {data && data.interests.length > 0
                ? 'Learned from what you open, save and claim. Picked for you on Home uses them.'
                : 'Open, save and claim a few deals and Home starts picking ones you will like.'}
            </Text>
            {data && data.interests.length > 0 ? (
              <View style={styles.chips}>
                {data.interests.map((t) => (
                  <View key={t} style={styles.interest}>
                    <Text style={styles.interestText}>{t}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Help</Text>
        <View style={styles.group}>
          <Row icon="chat" title="Help and support" onPress={() => router.push('/account/help')} />
          <Row
            icon="shield"
            title="Payments and refunds"
            onPress={() => router.push({ pathname: '/account/help', params: { topic: 'refunds' } })}
          />
          <Row icon="list" title="Terms of use" onPress={() => router.push('/legal/terms')} />
          <Row icon="shield" title="Privacy policy" onPress={() => router.push('/legal/privacy')} last />
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.group}>
          <Row icon="user" title="Edit profile" onPress={() => router.push('/account/edit')} />
          <Row icon="x" title="Delete account" tone="alert" onPress={() => router.push('/account/delete')} last />
        </View>

        {backend === 'local' ? (
          <>
            <Text style={styles.sectionTitle}>Demo account</Text>
            <View style={styles.group}>
              <Text style={styles.demoNote}>
                Running on offline demo data. Switch accounts here without signing out.
              </Text>
              <View style={styles.chips}>
                {(Object.keys(ACCOUNT_LABEL) as AccountKind[]).map((k) => (
                  <Chip key={k} selected={viewer.id === demoAccounts[k].id} onPress={() => setAccount(k)}>
                    {ACCOUNT_LABEL[k]}
                  </Chip>
                ))}
              </View>
              <ResetDemo />
            </View>
          </>
        ) : null}
        <View style={styles.signOut}>
          <Button variant="secondary" full icon="logout" onPress={() => void auth.signOut()}>
            Sign out
          </Button>
        </View>

        <Text style={styles.version}>
          YOLO Deals {Constants.expoConfig?.version ?? ''} · {db.kind === 'local' ? 'offline demo data' : 'live'}
        </Text>
      </ScrollView>
    </View>
  );
}

/** Start the demo afresh. Asks first: it clears every account, deal and order made here. */
function ResetDemo() {
  const [asking, setAsking] = useState(false);
  return asking ? (
    <View style={styles.reset}>
      <Text style={styles.demoNote}>
        This clears every account, business, deal and order made in this browser, and signs you out.
      </Text>
      <View style={styles.chips}>
        <Button small variant="secondary" onPress={() => setAsking(false)}>
          Keep it
        </Button>
        <Button small onPress={resetDemoData}>
          Yes, reset
        </Button>
      </View>
    </View>
  ) : (
    <View style={styles.reset}>
      <Button small variant="text" icon="x" onPress={() => setAsking(true)}>
        Reset demo data
      </Button>
    </View>
  );
}

function Stat({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number | undefined;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={(value ?? 0) + ' ' + label}
      style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
    >
      <Text style={styles.statValue}>{value ?? '–'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

/** The brand-coloured card that switches into merchant or admin mode. */
function ModeCard({
  icon,
  title,
  body,
  count,
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  /** Items waiting, for the admin tools. */
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count ? title + ', ' + count + ' waiting' : title}
      style={({ pressed }) => [styles.mode, pressed && styles.pressed]}
    >
      <View style={styles.modeIcon}>
        <Icon name={icon} size={22} color={color.text} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.modeTitle}>{title}</Text>
        <Text style={styles.modeBody}>{body}</Text>
      </View>
      {count ? (
        <View style={styles.modeCount}>
          <Text style={styles.modeCountText}>{count}</Text>
        </View>
      ) : null}
      <Icon name="chev" size={18} color={color.white} />
    </Pressable>
  );
}

function Row({
  icon,
  title,
  value,
  onPress,
  last,
  tone,
}: {
  icon: IconName;
  title: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
  tone?: 'alert';
}) {
  const tint = tone === 'alert' ? color.alert : color.brand;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? title + ', ' + value : title}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.pressed]}
    >
      <Icon name={icon} size={20} color={tint} />
      <Text style={[styles.rowTitle, tone === 'alert' && { color: color.alert }]}>{title}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Icon name="chev" size={16} color={color.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  signedOutActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: space.lg,
    paddingBottom: space.xxxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    ...type.h2,
    color: color.text,
  },
  phone: {
    ...type.caption,
    color: color.textSecondary,
  },
  cardBadges: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: 4,
  },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.brand,
  },
  modeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeCount: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: color.cta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeCountText: {
    ...type.captionMedium,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  modeTitle: {
    ...type.bodySemibold,
    color: color.white,
  },
  modeBody: {
    ...type.caption,
    color: color.surfaceSoft,
  },
  stats: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  stat: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
  },
  statValue: {
    ...type.h2,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    ...type.small,
    color: color.textSecondary,
  },
  sectionTitle: {
    ...type.overline,
    color: color.textSecondary,
    marginTop: space.xxl,
    marginBottom: space.sm,
    marginLeft: space.xs,
  },
  group: {
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: size.input + 4,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  rowTitle: {
    ...type.bodyMedium,
    color: color.text,
    flex: 1,
  },
  rowValue: {
    ...type.caption,
    color: color.textSecondary,
  },
  pressed: {
    opacity: 0.6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingBottom: space.sm,
  },
  interests: {
    paddingVertical: space.md,
    gap: space.xs,
  },
  interestsNote: {
    ...type.caption,
    color: color.textSecondary,
  },
  interest: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoftAlt,
  },
  interestText: {
    ...type.captionMedium,
    color: color.brandStrong,
  },
  demoNote: {
    ...type.caption,
    color: color.textSecondary,
    marginVertical: space.md,
  },
  reset: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.sm,
    alignItems: 'flex-start',
  },
  signOut: {
    marginTop: space.xxl,
  },
  version: {
    ...type.small,
    color: color.textMuted,
    textAlign: 'center',
    marginTop: space.xxl,
  },
});
