/**
 * The products a merchant mentioned by voice, as cards they can check before
 * going live: a matched photo, a title and price they can change, and
 * whether to post it as a deal. publishProducts() turns the ticked ones into
 * live deals through the same draft rules as the deal form.
 */

import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { backend, db } from '../data';
import { matchPhoto } from '../data/photo-library';
import type { MenuItem } from '../data/types';
import { classifyOffering, keywordsFrom } from './classify';
import { addDays, defaultsFor, emptyForm, toDraftInput, type WizardForm } from './wizard';
import type { MerchantProduct } from '../voice/types';
import { color, radius, space, type } from '../theme/tokens';
import { Icon } from '../components';

export interface DraftProduct extends MerchantProduct {
  key: string;
  /** Post it as a deal when the business is created. */
  post: boolean;
  priceText: string;
  wasText: string;
}

export function draftProducts(products: MerchantProduct[]): DraftProduct[] {
  return products.map((p, i) => ({
    ...p,
    key: 'p' + i,
    post: p.price != null && p.price > 0,
    priceText: p.price != null ? String(p.price) : '',
    wasText: p.original_price != null ? String(p.original_price) : '',
  }));
}

const num = (s: string) => {
  const n = Number(s.replace(/[^\d.]/g, ''));
  return s.trim() && Number.isFinite(n) ? n : null;
};

/** A photo that fits the product, from the library. */
export function productPhoto(p: Pick<MerchantProduct, 'title' | 'description'>, businessType: string | null): string {
  const found = classifyOffering(p.title) ?? classifyOffering(businessType ?? '');
  return matchPhoto({
    title: p.title,
    description: p.description + ' ' + (businessType ?? ''),
    categorySlug: found?.category_slug ?? null,
    vertical: found?.vertical ?? null,
  });
}

/** The menu the shop page shows: every product, posted as a deal or not. */
export function menuFrom(products: DraftProduct[], businessType: string | null): MenuItem[] {
  return products
    .filter((p) => p.title.trim())
    .map((p) => ({
      name: p.title.trim(),
      price: num(p.priceText),
      description: p.description || null,
      veg: null,
      photo: productPhoto(p, businessType),
    }));
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Creates and publishes a deal for each ticked product with a price; returns how many. */
export async function publishProducts(
  businessId: string,
  products: DraftProduct[],
  ctx: {
    businessType: string | null;
    businessName: string;
    open: string | null;
    close: string | null;
    days: number[] | null;
    /** Products already posted by an earlier try, by index: a retry never posts them twice. */
    done?: ReadonlySet<number>;
    onPosted?: (index: number) => void;
  },
): Promise<number> {
  let posted = 0;
  for (const [i, p] of products.entries()) {
    const price = num(p.priceText);
    if (!p.post || price == null || !p.title.trim() || ctx.done?.has(i)) continue;
    const was = num(p.wasText);
    const found = classifyOffering(p.title + ' ' + p.description) ?? classifyOffering(ctx.businessType ?? '');
    const vertical = found?.vertical ?? 'food';
    const d = defaultsFor(vertical);
    const open = ctx.open && TIME.test(ctx.open) ? ctx.open : '10:00';
    let close = ctx.close && TIME.test(ctx.close) ? ctx.close : '21:00';
    // Open past midnight: the deal window ends at midnight.
    if (close <= open) close = '23:59';
    // A deal title needs 4 letters or more: "Tea" becomes "Tea at Chai Adda".
    const said = p.title.trim();
    const title = (said.length >= 4 ? said : said + ' at ' + ctx.businessName).slice(0, 90);
    const base = emptyForm();
    const form: WizardForm = {
      ...base,
      // What a shop sells stays up like a menu does: three months, not the wizard's two weeks.
      ends_at: addDays(base.starts_at, 90),
      offering: title,
      title,
      vertical,
      category_slug: found?.category_slug ?? vertical,
      deal_type_code: found?.deal_type_code ?? 'discount',
      offering_kind: d.kind,
      primary_cta: d.cta,
      secondary_ctas: d.secondary,
      booking_required: d.cta === 'book' || d.cta === 'reserve',
      short_description: (p.description || title + ' at ' + ctx.businessName).slice(0, 110),
      description:
        p.description && p.description.length >= 20
          ? p.description
          : title + ' at ' + ctx.businessName + (ctx.businessType ? ', ' + ctx.businessType : '') + '.',
      deal_price: String(price),
      original_price: was != null && was > price ? String(was) : '',
      price_unit: p.per_month ? '/mo' : null,
      start_time: open,
      end_time: close,
      days: ctx.days ?? [],
      party: p.party_min != null ? [p.party_min, p.party_max ?? p.party_min] : null,
      keywords: keywordsFrom(title, p.description).join(', '),
      photo: productPhoto(p, ctx.businessType),
    };
    const id = await db.saveDealDraft(toDraftInput(form, businessId));
    await db.submitDeal(id);
    ctx.onPosted?.(i);
    posted += 1;
  }
  return posted;
}

export function VoiceProducts({
  products,
  businessType,
  onChange,
}: {
  products: DraftProduct[];
  businessType: string | null;
  onChange: (next: DraftProduct[]) => void;
}) {
  const set = (key: string, patch: Partial<DraftProduct>) =>
    onChange(products.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const ticked = products.filter((p) => p.post && num(p.priceText) != null).length;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Your first deals</Text>
      <Text style={styles.lead}>
        {backend === 'local'
          ? 'From what you said. Ticked ones go live with these photos when you create your business; change anything first.'
          : 'From what you said. Ticked ones are posted with these photos when you create your business, and go live as soon as YOLO verifies it. Change anything first.'}
      </Text>
      {products.map((p) => {
        const noPrice = num(p.priceText) == null;
        return (
          <View key={p.key} style={[styles.card, !p.post && styles.cardOff]}>
            <Image source={{ uri: productPhoto(p, businessType) }} style={styles.photo} contentFit="cover" />
            <View style={styles.body}>
              <TextInput
                value={p.title}
                onChangeText={(title) => set(p.key, { title })}
                style={styles.name}
                accessibilityLabel="Product name"
              />
              <View style={styles.prices}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  value={p.priceText}
                  onChangeText={(priceText) => set(p.key, { priceText, post: p.post || num(priceText) != null })}
                  placeholder="Price"
                  placeholderTextColor={color.textMuted}
                  keyboardType="number-pad"
                  style={styles.price}
                  accessibilityLabel={'Price of ' + p.title}
                />
                <Text style={styles.was}>was ₹</Text>
                <TextInput
                  value={p.wasText}
                  onChangeText={(wasText) => set(p.key, { wasText })}
                  placeholder="—"
                  placeholderTextColor={color.textMuted}
                  keyboardType="number-pad"
                  style={styles.price}
                  accessibilityLabel={'Usual price of ' + p.title}
                />
                {p.per_month ? <Text style={styles.was}>a month</Text> : null}
              </View>
              {noPrice ? <Text style={styles.hint}>Add a price to post it as a deal.</Text> : null}
            </View>
            <Pressable
              onPress={() => set(p.key, { post: !p.post })}
              disabled={noPrice}
              accessibilityRole="checkbox"
              aria-checked={p.post && !noPrice}
              accessibilityLabel={'Post ' + p.title + ' as a deal'}
              style={[styles.tick, p.post && !noPrice && styles.tickOn]}
            >
              {p.post && !noPrice ? <Icon name="check" size={16} color={color.white} strokeWidth={2.4} /> : null}
            </Pressable>
          </View>
        );
      })}
      <Text style={styles.count}>
        {ticked === 0
          ? 'No deals will be posted yet.'
          : ticked + (ticked === 1 ? ' deal' : ' deals') + (backend === 'local' ? ' will go live.' : ' will be posted.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
    marginTop: space.sm,
  },
  title: {
    ...type.bodySemibold,
    color: color.text,
  },
  lead: {
    ...type.caption,
    color: color.textSecondary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  cardOff: {
    opacity: 0.6,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSoftAlt,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    ...type.bodySemibold,
    color: color.text,
    paddingVertical: 2,
  },
  prices: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rupee: {
    ...type.captionMedium,
    color: color.text,
  },
  price: {
    ...type.captionMedium,
    color: color.text,
    width: 64,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    backgroundColor: color.surfaceSoftAlt,
  },
  was: {
    ...type.small,
    color: color.textMuted,
  },
  hint: {
    ...type.small,
    color: color.alert,
  },
  tick: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: {
    backgroundColor: color.brand,
    borderColor: color.brand,
  },
  count: {
    ...type.small,
    color: color.textSecondary,
  },
});
