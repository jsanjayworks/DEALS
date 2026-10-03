/**
 * Profile: who you are, your activity, and the way into merchant mode.
 *
 * Location and radius are not repeated here; they live in the Home header
 * and radius row, where they are changed while looking at the deals.
 *
 * Until Supabase Auth is wired, "account" is one of the three seeded demo
 * accounts. Switching is the same decision the real app will make from the
 * session — merchant mode appears only for someone who belongs to a business.
 */

import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { auth, backend, db } from '../data';
import { useQuery } from '../lib/useQuery';
import { ACCOUNT_PROFILE, type AccountKind, useSession, useViewer } from '../state/session';
import { color, font, radius, size, space, type } from '../theme/tokens';
import { Button, Chip, EmptyState, Header, Icon, type IconName, VerifiedBadge } from '../components';

const ACCOUNT_LABEL: Record<AccountKind, string> = {
  customer: 'Customer',
  merchant: 'Merchant',
  admin: 'Admin',
};

export default function ProfileScreen() {
  const account = useSession((s) => s.account);
  const setAccount = useSession((s) => s.setAccount);
  const viewer = useViewer();

  const fetchCounts = useCallback(async () => {
    void account;
    void viewer;
    const [saved, notifications, actions] = await Promise.all([
      db.listSavedDeals(),
      db.listNotifications(),
      db.listMyActions(),
    ]);
    return {
      saved: saved.length,
      unread: notifications.filter((n) => n.read_at === null).length,
      active: actions.filter((a) => a.status === 'pending' || a.status === 'confirmed').length,
    };
  }, [account, viewer]);
  const { data } = useQuery(fetchCounts);

  // Signed out on Supabase: nothing personal to show yet.
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

  const profile =
    backend === 'local'
      ? ACCOUNT_PROFILE[account]
      : { name: viewer.full_name || 'Your profile', phone: viewer.phone || viewer.email || '' };

  return (
    <View style={styles.screen}>
      <Header title="Profile" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile.name.charAt(0)}</Text>
          </View>
          <View style={styles.cardText}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.phone}>{profile.phone}</Text>
            <View style={styles.cardBadges}>
              {viewer.is_yolo_verified ? <VerifiedBadge /> : null}
            </View>
          </View>
        </View>

        {viewer.business_ids.length > 0 ? (
          <ModeCard
            icon="store"
            title="Merchant dashboard"
            body="Create deals, redeem codes and see how they are doing."
            onPress={() => router.push('/merchant')}
          />
        ) : (
          <ModeCard
            icon="store"
            title="List your business"
            body="Free. Post deals for customers nearby and redeem them at the counter."
            onPress={() => router.push('/list-business')}
          />
        )}
        {viewer.is_admin ? (
          <ModeCard
            icon="shield"
            title="Review queue"
            body="Approve or send back deals waiting for verification."
            onPress={() => router.push('/admin')}
          />
        ) : null}
        {viewer.is_admin ? (
          <ModeCard
            icon="shield"
            title="Business verification"
            body="Grant or decline the YOLO Verified badge."
            onPress={() => router.push('/admin/businesses')}
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

        {backend === 'local' ? (
          <>
            <Text style={styles.sectionTitle}>Demo account</Text>
            <View style={styles.group}>
              <Text style={styles.demoNote}>
                Running on offline demo data. Switch between the seeded accounts to see each side of the app.
              </Text>
              <View style={styles.chips}>
                {(Object.keys(ACCOUNT_LABEL) as AccountKind[]).map((k) => (
                  <Chip key={k} selected={account === k} onPress={() => setAccount(k)}>
                    {ACCOUNT_LABEL[k]}
                  </Chip>
                ))}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.signOut}>
            <Button variant="secondary" full icon="logout" onPress={() => void auth?.signOut()}>
              Sign out
            </Button>
          </View>
        )}

        <Text style={styles.version}>
          YOLO Deals {Constants.expoConfig?.version ?? ''} · {db.kind === 'local' ? 'offline demo data' : 'live'}
        </Text>
      </ScrollView>
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
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.mode, pressed && styles.pressed]}
    >
      <View style={styles.modeIcon}>
        <Icon name={icon} size={22} color={color.text} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.modeTitle}>{title}</Text>
        <Text style={styles.modeBody}>{body}</Text>
      </View>
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
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: font.bold,
    fontSize: 26,
    color: color.white,
  },
  cardText: {
    flex: 1,
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
  demoNote: {
    ...type.caption,
    color: color.textSecondary,
    marginVertical: space.md,
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
