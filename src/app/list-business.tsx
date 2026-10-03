/**
 * "List your business": setting up a business, which is what makes an
 * account a merchant (business_members, the same rule the database enforces).
 *
 * Signed-out visitors are sent to the merchant login at /business first; an
 * account that already has a business goes straight to the dashboard.
 *
 * create_business() makes the business, its owner and its main location in
 * one step. It starts unverified; the owner asks for the YOLO Verified badge
 * from the dashboard once they are in.
 */

import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { backend, db, refreshViewer, RuleViolation } from '../data';
import { hapticSuccess } from '../lib/device';
import { useQuery } from '../lib/useQuery';
import { useLocality, useSession, useViewer, useViewerReady } from '../state/session';
import { color, space, type } from '../theme/tokens';
import { Button, Chip, Field, Header, Label } from '../components';

export default function ListBusinessScreen() {
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const ready = useViewerReady();
  const setMode = useSession((s) => s.setMode);
  const browsing = useLocality();

  const close = () => (router.canGoBack() ? router.back() : router.dismissTo('/'));

  if (!ready) return <View style={styles.screen} />;
  if (!viewer) return <Redirect href="/business" />;
  // Already a merchant, including right after creating one: the refreshed
  // viewer lands here and this is what moves them on.
  if (viewer.business_ids.length > 0) return <Redirect href="/merchant" />;

  return (
    <View style={styles.screen}>
      <Header title="List your business" onBack={close} />
      <SetupForm
        defaultLocalityName={browsing.name}
        defaultPhone={viewer.phone ?? ''}
        bottomInset={insets.bottom}
        onCreated={async () => {
          hapticSuccess();
          setMode('merchant');
          await refreshViewer();
        }}
      />
    </View>
  );
}

function SetupForm({
  defaultLocalityName,
  defaultPhone,
  bottomInset,
  onCreated,
}: {
  defaultLocalityName: string;
  defaultPhone: string;
  bottomInset: number;
  onCreated: () => Promise<void>;
}) {
  // Real ids from the active backend: uuids on Supabase, seed ids locally.
  const fetchRefs = useCallback(async () => {
    const [categories, localities] = await Promise.all([db.getCategories(), db.getLocalities()]);
    return { categories: categories.filter((c) => c.parent_id === null), localities };
  }, []);
  const { data: refs } = useQuery(fetchRefs);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [pickedLocality, setPickedLocality] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState(defaultPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Any edit clears the last error; it described the form as it was. */
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setError(null);
  };

  // Default to the area they are browsing. Matched by name: the session keeps
  // the seed id, while Supabase has its own uuids for the same places.
  const localityId =
    pickedLocality ??
    refs?.localities.find((l) => l.name === defaultLocalityName)?.id ??
    null;

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Enter your business name');
    if (!categoryId) return setError('Choose what kind of business this is');
    if (!localityId) return setError('Choose the area your business is in');
    if (address.trim().length < 5) return setError('Enter the street address');
    setBusy(true);
    try {
      await db.createBusiness({
        name: name.trim(),
        primary_category_id: categoryId,
        locality_id: localityId,
        address_line: address.trim(),
        phone: phone.trim() || undefined,
      });
      await onCreated();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not go through. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + space.xxl }]}
      >
        <Text style={styles.title} accessibilityRole="header">
          Tell us about your business
        </Text>
        <Text style={styles.lead}>
          Takes a minute. You can post your first deal straight after
          {backend === 'local' ? ' (demo: this lasts until you reload)' : ''}.
        </Text>

        <Field
          label="Business name"
          value={name}
          onChangeText={edit(setName)}
          placeholder="Rangoli Kitchen"
          autoCapitalize="words"
          accessibilityLabel="Business name"
        />

        <Label>What kind of business</Label>
        <View style={styles.kinds}>
          {(refs?.categories ?? []).map((c) => (
            <Chip key={c.id} selected={c.id === categoryId} onPress={() => edit(setCategoryId)(c.id)}>
              {c.name}
            </Chip>
          ))}
        </View>

        <Label>Area</Label>
        <View style={styles.kinds}>
          {(refs?.localities ?? []).map((l) => (
            <Chip key={l.id} selected={l.id === localityId} onPress={() => edit(setPickedLocality)(l.id)}>
              {l.name}
            </Chip>
          ))}
        </View>

        <Field
          label="Street address"
          value={address}
          onChangeText={edit(setAddress)}
          placeholder="12, 5th Block, near Forum Mall"
          accessibilityLabel="Street address"
        />
        <Field
          label="Phone for customers (optional)"
          value={phone}
          onChangeText={edit(setPhone)}
          placeholder="+91 98450 12345"
          keyboardType="phone-pad"
          accessibilityLabel="Business phone"
        />

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Button variant="cta" full loading={busy} onPress={() => void submit()}>
          Create my business
        </Button>
        <Text style={styles.note}>
          New businesses start unverified. Ask for the YOLO Verified badge from your dashboard.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
  body: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: space.xl,
    gap: space.md,
  },
  title: {
    ...type.display,
    fontSize: 28,
    lineHeight: 34,
    color: color.text,
  },
  lead: {
    ...type.body,
    color: color.textSecondary,
    marginBottom: space.sm,
  },
  kinds: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.sm,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
  note: {
    ...type.small,
    color: color.textMuted,
    textAlign: 'center',
    marginTop: space.xs,
  },
});
