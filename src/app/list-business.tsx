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
 *
 * The owner describes the business in their own words; the category is worked
 * out from them (merchant/classify.ts) and shown, with a way to change it.
 * Or they say it all by voice: the form fills in, and the products they
 * mention become deals with matched photos, posted when the business is made.
 */

import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { backend, db, refreshViewer, RuleViolation } from '../data';
import { hapticSuccess } from '../lib/device';
import { useQuery } from '../lib/useQuery';
import { useLocality, useSession, useViewer, useViewerReady } from '../state/session';
import { color, space, type } from '../theme/tokens';
import { Button, Chip, Field, Header, Icon, Label } from '../components';
import { VoiceSheet } from '../voice/VoiceSheet';
import { understand } from '../voice/assist';
import type { MerchantProfile, VoiceLang } from '../voice/types';
import { draftProducts, menuFrom, productPhoto, publishProducts, VoiceProducts, type DraftProduct } from '../merchant/VoiceProducts';
import { amenityLabel } from '../data/amenities';
import { timeLabel } from '../lib/format';
import { AutoCategory } from '../merchant/AutoCategory';
import { PinLocation } from '../merchant/PinLocation';
import type { LatLng } from '../data/types';
import { classifyOffering, keywordsFrom } from '../merchant/classify';

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
        defaultName={viewer.full_name ?? ''}
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
  defaultName,
  bottomInset,
  onCreated,
}: {
  defaultLocalityName: string;
  defaultPhone: string;
  defaultName: string;
  bottomInset: number;
  onCreated: () => Promise<void>;
}) {
  // Real ids from the active backend: uuids on Supabase, seed ids locally.
  const fetchRefs = useCallback(async () => {
    const [categories, localities] = await Promise.all([db.getCategories(), db.getLocalities()]);
    return { categories, localities };
  }, []);
  const { data: refs } = useQuery(fetchRefs);

  const [owner, setOwner] = useState(defaultName);
  const [role, setRole] = useState('');
  const [name, setName] = useState('');
  const [does, setDoes] = useState('');
  const [sells, setSells] = useState('');
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  const detected = useMemo(() => classifyOffering(does + ' ' + sells)?.category_slug ?? null, [does, sells]);
  const slug = pickedSlug ?? detected;
  // Matched by slug: the seed and Supabase share slugs, not ids.
  const categoryId = refs?.categories.find((c) => c.slug === slug)?.id ?? null;
  const [pickedLocality, setPickedLocality] = useState<string | null>(null);
  /** The shop's exact position, when pinned with the device; with its area's name. */
  const [pin, setPin] = useState<{ point: LatLng; area: string } | null>(null);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState(defaultPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // By voice: the sheet, what it understood, and the products it heard.
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [heard, setHeard] = useState<MerchantProfile | null>(null);
  const [products, setProducts] = useState<DraftProduct[]>([]);

  const fromVoice = async (text: string, lang: VoiceLang) => {
    setVoiceBusy(true);
    try {
      const { result: p } = await understand('merchant', text, lang);
      if (p.owner_name) setOwner(p.owner_name);
      if (p.owner_role) setRole(p.owner_role);
      if (p.business_name) setName(p.business_name);
      if (p.business_type) setDoes(p.business_type);
      const sold = p.products.map((x) => x.title).join(', ');
      if (p.description || sold) setSells([p.description, sold].filter(Boolean).join(' '));
      const area = p.area ? refs?.localities.find((l) => l.name.toLowerCase() === p.area!.toLowerCase()) : null;
      if (area) setPickedLocality(area.id);
      if (p.address) setAddress(p.address);
      if (p.phone) setPhone(p.phone);
      setProducts(draftProducts(p.products));
      setHeard(p);
      setError(null);
      setVoiceOpen(false);
    } finally {
      setVoiceBusy(false);
    }
  };

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
    if (owner.trim().length < 2) return setError('Enter your name');
    if (name.trim().length < 2) return setError('Enter your business name');
    if (does.trim().length < 3) return setError('Say what your business does');
    if (!categoryId) return setError('Pick the closest category for your business');
    if (!localityId) return setError('Choose the area your business is in');
    if (address.trim().length < 5) return setError('Enter the street address');
    setBusy(true);
    try {
      if (owner.trim() !== defaultName.trim()) await db.updateMyProfile({ full_name: owner.trim() });
      const businessType = does.trim() || null;
      const businessId = await db.createBusiness({
        name: name.trim(),
        primary_category_id: categoryId,
        locality_id: localityId,
        address_line: address.trim(),
        phone: phone.trim() || undefined,
        location: pin?.point,
        description: [does.trim(), sells.trim()].filter(Boolean).join('. '),
        keywords: keywordsFrom(does, sells),
        owner_role: role.trim() || undefined,
        cost_for_two: heard?.cost_for_two ?? null,
        amenities: heard?.amenities ?? [],
        cuisines: heard?.cuisines ?? [],
        open_time: heard?.open_time ?? null,
        close_time: heard?.close_time ?? null,
        // The place's photos: what it sells, matched from the library.
        photos: products.slice(0, 6).map((p) => productPhoto(p, businessType)),
        menu: menuFrom(products, businessType),
      });
      // The products said by voice go live as deals with the business.
      if (products.some((p) => p.post)) {
        await publishProducts(businessId, products, {
          businessType,
          businessName: name.trim(),
          open: heard?.open_time ?? null,
          close: heard?.close_time ?? null,
          days: heard?.days ?? null,
        });
      }
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
          Takes a minute, in your own words. You can post your first deal straight after
          {backend === 'local' ? ' (demo: kept in this browser)' : ''}.
        </Text>

        <Pressable
          onPress={() => setVoiceOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Tell us about your business by voice"
          style={({ pressed }) => [styles.voiceCard, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.voiceMic}>
            <Icon name="mic" size={24} color={color.onCta} strokeWidth={2} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.voiceTitle}>{heard ? 'Say it again' : 'Tell us by voice'}</Text>
            <Text style={styles.voiceBody}>
              Say who you are, what your business does, where it is and what you sell with prices. We fill in
              everything below and set up your first deals with photos.
            </Text>
          </View>
        </Pressable>
        {heard ? (
          <View style={styles.heard}>
            <Icon name="check" size={16} color={color.brand} strokeWidth={2.2} />
            <Text style={styles.heardText}>
              Filled in from what you said
              {heard.open_time && heard.close_time
                ? ' · open ' + timeLabel(heard.open_time) + ' to ' + timeLabel(heard.close_time)
                : ''}
              {heard.cost_for_two ? ' · ₹' + heard.cost_for_two + ' for two' : ''}
              {heard.amenities.length ? ' · ' + heard.amenities.map(amenityLabel).join(', ') : ''}. Check it and
              change anything.
            </Text>
          </View>
        ) : null}

        <Field
          label="Your name"
          value={owner}
          onChangeText={edit(setOwner)}
          placeholder="Meera Rao"
          autoCapitalize="words"
        />
        <Field
          label="Your role (optional)"
          value={role}
          onChangeText={edit(setRole)}
          placeholder="Owner, manager, chef…"
          autoCapitalize="sentences"
        />
        <Field
          label="Business name"
          value={name}
          onChangeText={edit(setName)}
          placeholder="Rangoli Kitchen"
          autoCapitalize="words"
          accessibilityLabel="Business name"
        />
        <Field
          label="What does your business do?"
          value={does}
          onChangeText={edit(setDoes)}
          placeholder="South Indian restaurant, bike service garage, salon…"
          autoCapitalize="sentences"
        />
        <Field
          label="What do you want to sell here? (optional)"
          value={sells}
          onChangeText={edit(setSells)}
          placeholder="Dosa combos, thali for lunch, filter coffee"
          autoCapitalize="sentences"
          multiline
          style={styles.multi}
        />
        <AutoCategory
          slug={slug}
          typed={does.trim().length >= 3}
          onPick={(s) => {
            setPickedSlug(s);
            setError(null);
          }}
        />
        {products.length > 0 ? (
          <VoiceProducts products={products} businessType={does.trim() || null} onChange={setProducts} />
        ) : null}

        <Label>Area</Label>
        <PinLocation
          pinned={pin?.area ?? null}
          onFound={(point, area) => {
            setPin({ point, area });
            // Matched by name: the seed and Supabase share names, not ids.
            const id = refs?.localities.find((l) => l.name === area)?.id;
            if (id) setPickedLocality(id);
            setError(null);
          }}
        />
        <View style={styles.kinds}>
          {(refs?.localities ?? []).map((l) => (
            <Chip
              key={l.id}
              selected={l.id === localityId}
              onPress={() => {
                // Choosing an area by hand uses its centre, not the pin.
                if (pin && l.name !== pin.area) setPin(null);
                edit(setPickedLocality)(l.id);
              }}
            >
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
          {products.some((p) => p.post) ? 'Create my business and post deals' : 'Create my business'}
        </Button>
        <Text style={styles.note}>
          New businesses start unverified. Ask for the YOLO Verified badge from your dashboard. By
          creating a business you agree to the{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => router.push('/legal/terms')}>
            Terms of use
          </Text>
          , including the rules for businesses.
        </Text>
      </ScrollView>
      <VoiceSheet
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        title="Tell us about your business"
        continuous
        submitLabel="Fill in my business"
        busy={voiceBusy}
        busyText="Setting it up…"
        examples={[
          "I'm Ravi, the owner. I run a biryani restaurant called Ravi's Biryani House in HSR Layout. We sell chicken dum biryani for 249, mutton biryani for 349 and a family pack for 4 at 799 instead of 1100. Open 11 am to 11 pm, we have parking.",
          'My name is Anitha, I run Glow Unisex Salon in Indiranagar. Haircut 299, haircut and beard trim 399, facial 999 instead of 1500. Open 10 am to 9 pm.',
          'नमस्ते, मैं सुरेश हूँ। कोरमंगला में मेरी बाइक सर्विस गैराज है, नाम है सुरेश मोटर्स। जनरल सर्विस 999 रुपये, वॉश 199 रुपये।',
        ]}
        onSubmit={(t, l) => void fromVoice(t, l)}
      />
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
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: 20,
    backgroundColor: color.brand,
  },
  voiceMic: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.cta,
  },
  voiceTitle: {
    ...type.bodySemibold,
    color: color.white,
  },
  voiceBody: {
    ...type.caption,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  heard: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    padding: space.md,
    borderRadius: 12,
    backgroundColor: color.surfaceSoftAlt,
  },
  heardText: {
    ...type.caption,
    color: color.text,
    flex: 1,
  },
  multi: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: space.md,
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
  link: {
    color: color.brandStrong,
    textDecorationLine: 'underline',
  },
  note: {
    ...type.small,
    color: color.textMuted,
    textAlign: 'center',
    marginTop: space.xs,
  },
});
