/**
 * Business details: what customers see on every deal — name, phone, email,
 * street address and area. Changing the area moves the business's pin and
 * its deals to that area. The YOLO Verified status and the registered name
 * are not edited here; they change only through a verification request.
 */

import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, RuleViolation } from '../../data';
import type { Business, Category, Locality } from '../../data/types';
import { hapticSuccess } from '../../lib/device';
import { useQuery } from '../../lib/useQuery';
import { useBusiness } from '../../merchant/useBusiness';
import { color, radius, space, status, type } from '../../theme/tokens';
import { Button, Chip, EmptyState, Field, Header, Label, VerifiedBadge } from '../../components';
import { PinLocation } from '../../merchant/PinLocation';
import { ShopEditor, type ShopDraft } from '../../merchant/ShopEditor';
import { CATEGORIES } from '../../data/seed-reference';
import { toast } from '../../ui/Toast';

export default function BusinessDetailsScreen() {
  const { business, loading, reload } = useBusiness();
  const fetchLocalities = useCallback(() => db.getLocalities(), []);
  const { data: localities } = useQuery(fetchLocalities);
  // The backend's categories: on Supabase their ids are uuids, not the seed's.
  const fetchCategories = useCallback(() => db.getCategories(), []);
  const { data: categories } = useQuery(fetchCategories);

  return (
    <View style={styles.screen}>
      <Header title="Business details" dark onBack={() => (router.canGoBack() ? router.back() : router.replace('/merchant'))} />
      {business ? (
        // Keyed by business, so the form starts from that business's details.
        <DetailsForm
          key={business.id}
          business={business}
          localities={localities ?? []}
          categories={categories ?? CATEGORIES}
          onSaved={reload}
        />
      ) : loading ? null : (
        <EmptyState icon="store" title="No business yet" body="List your business first." />
      )}
    </View>
  );
}

function DetailsForm({
  business,
  localities,
  categories,
  onSaved,
}: {
  business: Business;
  localities: Locality[];
  categories: Category[];
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(business.name);
  const [phone, setPhone] = useState(business.phone ?? '');
  const [email, setEmail] = useState(business.email ?? '');
  const [address, setAddress] = useState(business.address_line ?? '');
  const [localityId, setLocalityId] = useState<string | null>(business.locality_id || null);
  /** The shop's exact position, when pinned with the device; with its area's name. */
  const [pin, setPin] = useState<{ point: { lat: number; lng: number }; area: string } | null>(null);
  // The shop page: about, hours, cost for two, amenities, menu and photos.
  const [shop, setShop] = useState<ShopDraft>({
    description: business.description ?? '',
    open_time: business.open_time ?? '',
    close_time: business.close_time ?? '',
    cost_for_two: business.cost_for_two != null ? String(business.cost_for_two) : '',
    amenities: business.amenities ?? [],
    menu: business.menu ?? [],
    photos: business.photos ?? [],
  });
  const category = categories.find((c) => c.id === business.primary_category_id) ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setError(null);
    setSaved(false);
  };

  const save = async () => {
    if (name.trim().length < 2) return setError('Enter the business name');
    if (!localityId) return setError('Choose the area your business is in');
    if (address.trim().length < 5) return setError('Enter the street address');
    setBusy(true);
    setError(null);
    try {
      await db.updateBusiness(business.id, {
        name: name.trim(),
        locality_id: localityId,
        address_line: address.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        location: pin?.point,
        description: shop.description.trim(),
        open_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(shop.open_time) ? shop.open_time : null,
        close_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(shop.close_time) ? shop.close_time : null,
        cost_for_two: shop.cost_for_two ? Number(shop.cost_for_two) : null,
        amenities: shop.amenities,
        menu: shop.menu.filter((m) => m.name.trim()),
        photos: shop.photos,
      });
      hapticSuccess();
      toast('Business details saved');
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const moving = !!localityId && !!business.locality_id && localityId !== business.locality_id;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
      >
        <Text style={styles.lead}>Customers see these on every deal you post.</Text>
        {business.verification_status === 'verified' ? (
          <View style={styles.verified}>
            <VerifiedBadge />
            <Text style={styles.note}>Your verified registration stays as it is.</Text>
          </View>
        ) : null}

        <Field label="Business name" value={name} onChangeText={edit(setName)} autoCapitalize="words" />
        <Field
          label="Phone for customers"
          value={phone}
          onChangeText={edit(setPhone)}
          placeholder="+91 98450 12345"
          keyboardType="phone-pad"
        />
        <Field
          label="Email (optional)"
          value={email}
          onChangeText={edit(setEmail)}
          placeholder="hello@yourbusiness.in"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Street address"
          value={address}
          onChangeText={edit(setAddress)}
          placeholder="12, 5th Block, near Forum Mall"
        />

        <Label>Area</Label>
        <PinLocation
          pinned={pin?.area ?? null}
          onFound={(point, area) => {
            setPin({ point, area });
            const id = localities.find((l) => l.name === area)?.id;
            if (id) setLocalityId(id);
            setError(null);
            setSaved(false);
          }}
        />
        <View style={styles.chips}>
          {localities.map((l) => (
            <Chip
              key={l.id}
              selected={l.id === localityId}
              onPress={() => {
                if (pin && l.name !== pin.area) setPin(null);
                edit(setLocalityId)(l.id);
              }}
            >
              {l.name}
            </Chip>
          ))}
        </View>
        {moving ? (
          <Text style={styles.note}>Your live deals move to the new area too, so distances stay right.</Text>
        ) : null}

        <ShopEditor
          draft={shop}
          onChange={(next) => {
            setShop(next);
            setSaved(false);
          }}
          businessId={business.id}
          businessName={name}
          vertical={category?.vertical ?? null}
          categorySlug={category?.slug ?? null}
        />

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {saved ? (
          <Text style={styles.saved} accessibilityLiveRegion="polite">
            Saved. Customers see the new details now.
          </Text>
        ) : null}
        <Button variant="cta" full loading={busy} onPress={() => void save()}>
          Save changes
        </Button>
        <Button
          variant="text"
          full
          onPress={() => router.push({ pathname: '/shop/[id]', params: { id: business.id } })}
        >
          See your shop page
        </Button>
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
  lead: {
    ...type.body,
    color: color.textSecondary,
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  note: {
    ...type.caption,
    color: color.textSecondary,
    flexShrink: 1,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
  saved: {
    ...type.captionMedium,
    color: status.active.fg,
  },
});
