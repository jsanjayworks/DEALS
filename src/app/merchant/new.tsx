/**
 * Create or edit a deal, in seven steps.
 *
 * Every Next saves the draft, so closing the app mid-way loses at most the
 * step being typed. ?id= reopens a draft or a rejected deal; anything already
 * in review or live is not editable, matching save_deal_draft.
 *
 * Submitting a rejected deal goes REJECTED → DRAFT → SUBMITTED, because the
 * lifecycle has no direct edge from REJECTED to SUBMITTED.
 */

import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { backend, db, RuleViolation } from '../../data';
import { CATEGORIES } from '../../data/seed-reference';
import type { AudienceKind, CtaType, DealCardModel, DealTypeCode } from '../../data/types';
import { ctaLabel } from '../../data/mapping';
import { partyLabel } from '../../data/party';
import { VEHICLES, VEHICLE_TYPES, VEHICLE_TYPE_LABEL, brandKey, vehicleFitLabel } from '../../data/vehicles';
import { isEditable } from '../../domain/lifecycle';
import { DEAL_TYPE_LABEL, availabilityLabel, dateLabel } from '../../lib/format';
import { hapticSuccess } from '../../lib/device';
import { useBusinessId } from '../../merchant/useBusiness';
import { DealPhotoPicker } from '../../merchant/DealPhotoPicker';
import {
  PARTY_CHOICES,
  STEPS,
  VEHICLE_VERTICALS,
  type FieldErrors,
  type WizardForm,
  addDays,
  defaultsFor,
  emptyForm,
  firstInvalidStep,
  fromDeal,
  istDayStart,
  titleFromOffering,
  toDraftInput,
  validateStep,
} from '../../merchant/wizard';
import { AutoCategory } from '../../merchant/AutoCategory';
import { classifyOffering } from '../../merchant/classify';
import { color, discountPct, font, inr, radius, space, status as statusColor, type } from '../../theme/tokens';
import {
  Button,
  Chip,
  DealCard,
  EmptyState,
  Field,
  Header,
  Label,
  Sheet,
} from '../../components';

const DEAL_TYPES: DealTypeCode[] = [
  'discount', 'bxgy', 'bundle', 'flash', 'free', 'booking', 'experience', 'service_package', 'time_based',
];

const PRIMARY_CTAS: { cta: CtaType; hint: string }[] = [
  { cta: 'claim', hint: 'Customer gets a code to show at the counter' },
  { cta: 'book', hint: 'Customer picks a day and time' },
  { cta: 'reserve', hint: 'Hold a table or a slot' },
  { cta: 'register', hint: 'Sign up for an event or class' },
  { cta: 'enquire', hint: 'Customer sends you a message' },
  { cta: 'buy', hint: 'You contact them to complete the sale' },
];

const SECONDARY_CTAS: CtaType[] = ['call', 'directions', 'chat'];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HOURS_PRESETS = [
  { label: 'All day', start: '10:00', end: '21:00' },
  { label: 'Breakfast', start: '07:00', end: '11:00' },
  { label: 'Lunch', start: '12:00', end: '15:30' },
  { label: 'Evening', start: '17:00', end: '22:00' },
];

const START_OPTIONS = [
  { label: 'Today', offset: 0 },
  { label: 'Tomorrow', offset: 1 },
  { label: 'Next week', offset: 7 },
];

const DURATIONS = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
];

const PRICE_UNITS: { label: string; unit: string | null }[] = [
  { label: 'One-off', unit: null },
  { label: 'Per person', unit: '/person' },
  { label: 'Per night', unit: '/night' },
  { label: 'Per month', unit: '/mo' },
];

/** Kinds first, then every brand in the catalogue. */
const VEHICLE_CHOICES: { tag: string; label: string; kind?: boolean }[] = [
  ...VEHICLE_TYPES.map((t) => ({ tag: t, label: VEHICLE_TYPE_LABEL[t] + 's', kind: true })),
  ...[...new Set(VEHICLES.map((v) => v.brand))].map((b) => ({ tag: brandKey(b), label: b })),
];

/** Example wording per kind of business, so a garage is not shown a thali. */
const EXAMPLES: Record<string, { title: string; summary: string; description: string }> = {
  food: {
    title: 'e.g. South Indian Thali Lunch',
    summary: 'e.g. Unlimited thali, weekdays at lunch',
    description: 'What is included, portion sizes, anything to know before coming in',
  },
  services: {
    title: 'e.g. Haircut and Beard Trim',
    summary: 'e.g. 45 minutes, wash and styling included',
    description: 'What is included, how long it takes, anything to bring or know',
  },
  retail: {
    title: 'e.g. Running Shoes: Flat 40% Off',
    summary: 'e.g. Selected models, all sizes',
    description: 'Which products, brands or sizes, and any limits',
  },
  events: {
    title: 'e.g. Friday Night Comedy Show',
    summary: 'e.g. Four comics, 90 minutes',
    description: 'What happens, how long it runs, what is included, any age limit',
  },
  mobility: {
    title: 'e.g. Airport Cab, Flat Fare',
    summary: 'e.g. Sedan, tolls included',
    description: 'Route or area, vehicle, what is included, how to book',
  },
  property: {
    title: 'e.g. 2BHK in HSR Layout',
    summary: 'e.g. Semi-furnished, no brokerage',
    description: 'Size, furnishing, deposit, who it suits and when it is free',
  },
  business: {
    title: 'e.g. Hot Desk Monthly Pass',
    summary: 'e.g. Any desk, open 24x7',
    description: 'What is included, terms, and who it is for',
  },
};

const AUDIENCES: { label: string; value: AudienceKind }[] = [
  { label: 'Everyone', value: 'everyone' },
  { label: 'Verified users', value: 'verified' },
  { label: 'New customers', value: 'new_customers' },
  { label: 'Members', value: 'members' },
];

export default function DealWizardScreen() {
  const params = useLocalSearchParams<{ id?: string; copy?: string }>();
  const businessId = useBusinessId();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<WizardForm>(() => emptyForm());
  const [draftId, setDraftId] = useState<string | null>(params.id ?? null);
  const [loading, setLoading] = useState(Boolean(params.id));
  const [locked, setLocked] = useState(false);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DealCardModel | null>(null);
  /** Anything typed since opening or the last save; leaving then asks first. */
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  /** Why YOLO sent this deal back, shown while the merchant fixes it. */
  const [sentBack, setSentBack] = useState<string | null>(null);

  // Reopening a draft: rehydrate once.
  useEffect(() => {
    if (!params.id) return;
    let active = true;
    db.getRawDeal(params.id).then((d) => {
      if (!active) return;
      if (!d || !isEditable(d.status)) {
        setLocked(true);
      } else {
        setForm(fromDeal(d));
        if (d.status === 'REJECTED' && d.rejection_reason) setSentBack(d.rejection_reason);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [params.id]);

  const current = STEPS[step];
  const isReview = current.key === 'review';

  // The review step shows the deal exactly as customers will see it.
  useEffect(() => {
    if (!isReview || !draftId) return;
    let active = true;
    db.getDeal(draftId).then((d) => {
      if (active) setPreview(d);
    });
    return () => {
      active = false;
    };
  }, [isReview, draftId]);

  const patch = (p: Partial<WizardForm>) => {
    setForm((f) => ({ ...f, ...p }));
    setDirty(true);
    // Clear the error on a field as soon as it is touched.
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(p)) delete next[k as keyof WizardForm];
      return next;
    });
  };

  const save = async (): Promise<string | null> => {
    if (!businessId) return null;
    setSaving(true);
    setSaveError(null);
    try {
      const id = await db.saveDealDraft(toDraftInput(form, businessId, draftId ?? undefined));
      setDraftId(id);
      setDirty(false);
      return id;
    } catch (e) {
      setSaveError(e instanceof RuleViolation ? e.message : 'Could not save. Check your connection.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    const e = validateStep(current.key, form);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    // Nothing is saved before there is a title: a draft called "Untitled
    // deal" is clutter in the merchant's list, not a draft.
    if (hasTitle || draftId) {
      const id = await save();
      if (!id) return;
    }
    setPreview(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    const bad = firstInvalidStep(form);
    if (bad >= 0 && STEPS[bad].key !== 'review') {
      setStep(bad);
      setErrors(validateStep(STEPS[bad].key, form));
      return;
    }
    const id = await save();
    if (!id) return;
    setSaving(true);
    try {
      const raw = await db.getRawDeal(id);
      if (raw?.status === 'REJECTED') await db.transitionDeal(id, 'DRAFT');
      await db.submitDeal(id);
      hapticSuccess();
      router.replace({ pathname: '/merchant/deal/[id]', params: { id, submitted: '1' } });
    } catch (e) {
      setSaveError(e instanceof RuleViolation ? e.message : 'Could not submit. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const hasTitle = form.title.trim().length >= 4;

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/merchant'));

  const saveAndExit = async () => {
    if (!hasTitle && !draftId) {
      if (!dirty) return leave();
      setStep(Math.min(step, 1));
      setSaveError('Give the deal a title to save it as a draft.');
      return;
    }
    const id = await save();
    if (id) leave();
  };

  // Leaving with unsaved changes asks first, instead of losing them.
  const close = () => (dirty ? setLeaveOpen(true) : leave());

  if (loading) {
    return (
      <View style={styles.screen}>
        <Header title="Edit deal" dark onBack={close} />
      </View>
    );
  }

  if (locked) {
    return (
      <View style={styles.screen}>
        <Header title="Edit deal" dark onBack={close} />
        <EmptyState
          icon="shield"
          title="This deal can’t be edited"
          body="Deals in review or already live are locked. Pause it, or duplicate it to start a new version."
          action={<Button onPress={close}>Go back</Button>}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title={params.copy ? 'New deal (copy)' : params.id ? 'Edit deal' : 'New deal'}
        dark
        onBack={close}
        right={
          <Pressable
            onPress={() => void saveAndExit()}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.saveExit}
          >
            <Text style={styles.saveExitText}>Save & exit</Text>
          </Pressable>
        }
      />

      <View style={styles.progressWrap}>
        <Text style={styles.stepCount}>
          Step {step + 1} of {STEPS.length}
        </Text>
        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }}>
          <View style={[styles.fill, { width: `${((step + 1) / STEPS.length) * 100}%` as const }]} />
        </View>
        <Text style={styles.stepTitle} accessibilityRole="header">
          {current.title}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {sentBack ? (
            <View style={styles.sentBack}>
              <Text style={styles.sentBackTitle}>Sent back by YOLO</Text>
              <Text style={styles.sentBackText}>{sentBack}</Text>
              <Text style={styles.hint}>Fix this, then submit again from the last step.</Text>
            </View>
          ) : null}
          {current.key === 'category' ? <CategoryStep form={form} patch={patch} errors={errors} /> : null}
          {current.key === 'details' ? <DetailsStep form={form} patch={patch} errors={errors} /> : null}
          {current.key === 'pricing' ? <PricingStep form={form} patch={patch} errors={errors} /> : null}
          {current.key === 'schedule' ? <ScheduleStep form={form} patch={patch} errors={errors} /> : null}
          {current.key === 'rules' ? <RulesStep form={form} patch={patch} errors={errors} /> : null}
          {current.key === 'actions' ? <ActionsStep form={form} patch={patch} errors={errors} /> : null}
          {isReview ? <ReviewStep form={form} preview={preview} onEdit={setStep} /> : null}

          {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={styles.footerInner}>
          {step > 0 ? (
            <Button variant="secondary" onPress={() => setStep((s) => s - 1)} disabled={saving}>
              Back
            </Button>
          ) : null}
          <View style={styles.flex}>
            {isReview ? (
              <Button variant="cta" full loading={saving} onPress={() => void submit()}>
                {backend === 'local' ? 'Publish deal' : 'Submit for verification'}
              </Button>
            ) : (
              <Button full loading={saving} onPress={() => void next()}>
                Next
              </Button>
            )}
          </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={leaveOpen} onClose={() => setLeaveOpen(false)} title="Leave this deal?">
        <Text style={styles.leaveText}>
          {hasTitle || draftId
            ? 'Save what you have as a draft to finish later, or discard the changes.'
            : 'Nothing is saved yet. Leave and discard what you typed?'}
        </Text>
        <View style={styles.leaveActions}>
          {hasTitle || draftId ? (
            <Button
              variant="cta"
              full
              loading={saving}
              onPress={() => {
                setLeaveOpen(false);
                void saveAndExit();
              }}
            >
              Save draft and leave
            </Button>
          ) : null}
          <Button
            variant="secondary"
            full
            onPress={() => {
              setLeaveOpen(false);
              leave();
            }}
          >
            Discard changes
          </Button>
          <Button variant="text" full onPress={() => setLeaveOpen(false)}>
            Keep editing
          </Button>
        </View>
      </Sheet>
    </View>
  );
}

interface StepProps {
  form: WizardForm;
  patch: (p: Partial<WizardForm>) => void;
  errors: FieldErrors;
}

function Group({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Label>{label}</Label>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.chips}>{children}</View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/**
 * "What are you offering?" in the merchant's own words. The category and the
 * kind of deal are read from them (merchant/classify.ts) and shown, with
 * Change for when the guess is wrong; the words become search keywords.
 */
function CategoryStep({ form, patch, errors }: StepProps) {
  /** The category's fields, with the vertical's defaults when the vertical changes. */
  const categoryPatch = (slug: string): Partial<WizardForm> => {
    const cat = CATEGORIES.find((c) => c.slug === slug);
    if (!cat) return {};
    if (cat.vertical === form.vertical) return { category_slug: slug };
    const d = defaultsFor(cat.vertical);
    return {
      vertical: cat.vertical,
      category_slug: slug,
      offering_kind: d.kind,
      primary_cta: d.cta,
      secondary_ctas: d.secondary,
      booking_required: d.cta === 'book' || d.cta === 'reserve',
    };
  };
  const typePatch = (t: DealTypeCode): Partial<WizardForm> =>
    t === 'free' ? { deal_type_code: t, deal_price: '0' } : { deal_type_code: t };

  const onOffering = (text: string) => {
    const found = classifyOffering(text);
    // The title follows what is typed here until the merchant writes their own.
    const titleFollows = !form.title.trim() || form.title === titleFromOffering(form.offering);
    patch({
      offering: text,
      ...(titleFollows ? { title: titleFromOffering(text) } : {}),
      ...(found ? { ...categoryPatch(found.category_slug), ...typePatch(found.deal_type_code) } : {}),
      // A group size in the words ("for 4") sets the deal's, unless one was chosen.
      ...(found?.party && !form.party ? { party: found.party } : {}),
    });
  };

  return (
    <>
      <Field
        label="What are you offering?"
        value={form.offering}
        onChangeText={onOffering}
        placeholder={'e.g. Chicken biryani family pack for 4'}
        autoCapitalize="sentences"
        maxLength={120}
        error={form.vertical ? undefined : errors.vertical}
      />
      <AutoCategory
        slug={form.category_slug}
        typed={form.offering.trim().length >= 3}
        extra={'as ' + DEAL_TYPE_LABEL[form.deal_type_code]}
        onPick={(slug) => patch(categoryPatch(slug))}
        more={
          <Group label="Kind of deal">
            {DEAL_TYPES.map((t) => (
              <Chip key={t} selected={form.deal_type_code === t} onPress={() => patch(typePatch(t))}>
                {DEAL_TYPE_LABEL[t]}
              </Chip>
            ))}
          </Group>
        }
      />
      <Field
        label="Keywords (optional)"
        value={form.keywords}
        onChangeText={(t) => patch({ keywords: t })}
        placeholder="biryani, family meal, dum"
        autoCapitalize="none"
      />
      <Text style={styles.hint}>Words customers might search for. Separate them with commas.</Text>
    </>
  );
}

function DetailsStep({ form, patch, errors }: StepProps) {
  const businessId = useBusinessId();
  return (
    <View style={styles.fields}>
      <Field
        label={'Title · ' + form.title.trim().length + '/90'}
        value={form.title}
        onChangeText={(title) => patch({ title })}
        placeholder={(EXAMPLES[form.vertical ?? 'food'] ?? EXAMPLES.food).title}
        maxLength={90}
        error={errors.title}
      />
      <Field
        label={'One-line summary · ' + form.short_description.trim().length + '/120'}
        value={form.short_description}
        onChangeText={(short_description) => patch({ short_description })}
        placeholder={(EXAMPLES[form.vertical ?? 'food'] ?? EXAMPLES.food).summary}
        maxLength={120}
        error={errors.short_description}
      />
      <Field
        label="Description"
        value={form.description}
        onChangeText={(description) => patch({ description })}
        placeholder={(EXAMPLES[form.vertical ?? 'food'] ?? EXAMPLES.food).description}
        multiline
        style={styles.multiline}
        error={errors.description}
      />
      <DealPhotoPicker
        businessId={businessId}
        title={form.title}
        summary={form.short_description}
        vertical={form.vertical}
        categorySlug={form.category_slug}
        photo={form.photo}
        onChange={(photo) => patch({ photo })}
      />
    </View>
  );
}

function PricingStep({ form, patch, errors }: StepProps) {
  const now = Number(form.deal_price.replace(/[,₹\s]/g, ''));
  const was = Number(form.original_price.replace(/[,₹\s]/g, ''));
  const showSaving = form.original_price.trim() !== '' && was > 0 && Number.isFinite(now) && was > now;
  return (
    <View style={styles.fields}>
      <Field
        label="Deal price (₹)"
        value={form.deal_price}
        onChangeText={(deal_price) => patch({ deal_price })}
        placeholder="199"
        keyboardType="decimal-pad"
        editable={form.deal_type_code !== 'free'}
        error={errors.deal_price}
      />
      <Field
        label="Usual price (₹, optional)"
        value={form.original_price}
        onChangeText={(original_price) => patch({ original_price })}
        placeholder="320"
        keyboardType="decimal-pad"
        error={errors.original_price}
      />
      {showSaving ? (
        <View style={styles.savingBox}>
          <Text style={styles.savingText}>
            {discountPct(was, now)}% off · customers save {inr(was - now)}
          </Text>
        </View>
      ) : null}
      <Group label="Charged">
        {PRICE_UNITS.map((u) => (
          <Chip key={u.label} selected={form.price_unit === u.unit} onPress={() => patch({ price_unit: u.unit })}>
            {u.label}
          </Chip>
        ))}
      </Group>
      <Field
        label="Taxes note (optional)"
        value={form.taxes_note}
        onChangeText={(taxes_note) => patch({ taxes_note })}
        placeholder="e.g. Inclusive of GST"
      />
    </View>
  );
}

function ScheduleStep({ form, patch, errors }: StepProps) {
  const durationDays = Math.round(
    (new Date(form.ends_at).getTime() - new Date(form.starts_at).getTime()) / 86_400_000,
  );
  const allDays = form.days.length === 0;
  const toggleDay = (d: number) => {
    // With "Every day" on, tapping a day means "just this day", not "all but this one".
    const set = new Set(allDays ? [] : form.days);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    const days = [...set].sort((a, b) => a - b);
    patch({ days: days.length === 7 || days.length === 0 ? [] : days });
  };

  return (
    <>
      <Group label="Starts">
        {START_OPTIONS.map((o) => {
          const iso = istDayStart(o.offset);
          return (
            <Chip
              key={o.label}
              selected={form.starts_at.slice(0, 10) === iso.slice(0, 10)}
              onPress={() => patch({ starts_at: iso, ends_at: addDays(iso, Math.max(durationDays, 1)) })}
            >
              {o.label}
            </Chip>
          );
        })}
      </Group>
      <Group label="Runs for" error={errors.ends_at}>
        {DURATIONS.map((o) => (
          <Chip
            key={o.label}
            selected={durationDays === o.days}
            onPress={() => patch({ ends_at: addDays(form.starts_at, o.days) })}
          >
            {o.label}
          </Chip>
        ))}
      </Group>
      <Text style={styles.summary}>
        {dateLabel(form.starts_at)} to {dateLabel(form.ends_at)}
      </Text>

      <Group label="Days">
        <Chip selected={allDays} onPress={() => patch({ days: [] })}>
          Every day
        </Chip>
        {DAYS.map((name, d) => (
          <Chip key={name} selected={!allDays && form.days.includes(d)} onPress={() => toggleDay(d)}>
            {name}
          </Chip>
        ))}
      </Group>

      <Group label="Hours">
        {HOURS_PRESETS.map((p) => (
          <Chip
            key={p.label}
            selected={form.start_time === p.start && form.end_time === p.end}
            onPress={() => patch({ start_time: p.start, end_time: p.end })}
          >
            {p.label}
          </Chip>
        ))}
      </Group>
      <View style={styles.row2}>
        <View style={styles.flex}>
          <Field
            label="Opens"
            value={form.start_time}
            onChangeText={(start_time) => patch({ start_time })}
            placeholder="10:00"
            maxLength={5}
            error={errors.start_time}
          />
        </View>
        <View style={styles.flex}>
          <Field
            label="Closes"
            value={form.end_time}
            onChangeText={(end_time) => patch({ end_time })}
            placeholder="21:00"
            maxLength={5}
            error={errors.end_time}
          />
        </View>
      </View>
      {!errors.start_time && !errors.end_time ? (
        <Text style={styles.summary}>
          Customers see: {availabilityLabel({ days: form.days, start_time: form.start_time, end_time: form.end_time })}
        </Text>
      ) : null}
    </>
  );
}

function RulesStep({ form, patch, errors }: StepProps) {
  return (
    <>
      <View style={styles.fields}>
        <Field
          label="How many in total (optional)"
          value={form.capacity_total}
          onChangeText={(capacity_total) => patch({ capacity_total })}
          placeholder="Leave empty for no limit"
          keyboardType="number-pad"
          error={errors.capacity_total}
        />
      </View>

      <Group label="Per customer" error={errors.max_qty_per_customer}>
        {['1', '2', '4', '6', '10'].map((n) => (
          <Chip
            key={n}
            selected={form.max_qty_per_customer === n}
            onPress={() => patch({ max_qty_per_customer: n })}
          >
            {'Up to ' + n}
          </Chip>
        ))}
      </Group>

      <Pressable
        onPress={() => patch({ booking_required: !form.booking_required })}
        accessibilityRole="switch"
        aria-checked={form.booking_required}
        style={styles.toggle}
      >
        <View style={styles.flex}>
          <Text style={styles.toggleLabel}>Needs a booking</Text>
          <Text style={styles.hint}>Customers pick a day and time before they come.</Text>
        </View>
        <Switch
          value={form.booking_required}
          onValueChange={(booking_required) => patch({ booking_required })}
          trackColor={{ true: color.brand, false: color.border }}
          thumbColor={color.white}
          // React Native Web's own default is teal; keep it in the theme.
          {...({ activeThumbColor: color.white } as object)}
        />
      </Pressable>

      {form.booking_required ? (
        <Group label="Book ahead by" error={errors.advance_booking_hours}>
          {[
            { label: 'Any time', v: '' },
            { label: '2 hours', v: '2' },
            { label: '1 day', v: '24' },
            { label: '2 days', v: '48' },
          ].map((o) => (
            <Chip
              key={o.label}
              selected={form.advance_booking_hours === o.v}
              onPress={() => patch({ advance_booking_hours: o.v })}
            >
              {o.label}
            </Chip>
          ))}
        </Group>
      ) : null}

      {form.booking_required ? (
        <>
          <Field
            label="Bookings per time slot (optional)"
            value={form.slot_capacity}
            onChangeText={(t) => patch({ slot_capacity: t.replace(/[^0-9]/g, '') })}
            placeholder="e.g. 6 tables at 8 PM"
            keyboardType="number-pad"
            maxLength={3}
            error={errors.slot_capacity}
          />
          <Text style={styles.hint}>
            How many bookings one time can take: tables, chairs or bays. When a time fills up, customers see it as Full.
          </Text>
        </>
      ) : null}

      <Group label="Who can use it">
        {AUDIENCES.map((a) => (
          <Chip key={a.value} selected={form.audience === a.value} onPress={() => patch({ audience: a.value })}>
            {a.label}
          </Chip>
        ))}
      </Group>

      <Group
        label="Group size"
        hint="For a set number of people, like a dinner for four. Customers searching for that group size find it."
      >
        {PARTY_CHOICES.map((o) => (
          <Chip
            key={o.label}
            selected={(form.party?.join('-') ?? null) === (o.value?.join('-') ?? null)}
            onPress={() => patch({ party: o.value })}
          >
            {o.label}
          </Chip>
        ))}
      </Group>

      {form.vertical && VEHICLE_VERTICALS.includes(form.vertical) ? (
        <Group
          label="For which vehicles (optional)"
          hint="A customer who saves their bike or car sees every deal for it. Pick the kinds, or the brands you specialise in."
        >
          {VEHICLE_CHOICES.filter((o) => {
            // With kinds picked, offer only the brands that make them ("Cars" → car brands).
            const kinds = form.vehicles.filter((t) => (VEHICLE_TYPES as string[]).includes(t));
            if (o.kind || kinds.length === 0 || form.vehicles.includes(o.tag)) return true;
            return VEHICLES.some((v) => brandKey(v.brand) === o.tag && kinds.includes(v.type));
          }).map((o) => {
            const on = form.vehicles.includes(o.tag);
            return (
              <Chip
                key={o.tag}
                selected={on}
                onPress={() =>
                  patch({ vehicles: on ? form.vehicles.filter((t) => t !== o.tag) : [...form.vehicles, o.tag] })
                }
              >
                {o.label}
              </Chip>
            );
          })}
        </Group>
      ) : null}

      <Group label="Age limit" hint="Age-restricted deals are hidden from anyone younger.">
        {[
          { label: 'None', v: null },
          { label: '18+', v: 18 },
          { label: '21+', v: 21 },
        ].map((o) => (
          <Chip key={o.label} selected={form.min_age === o.v} onPress={() => patch({ min_age: o.v })}>
            {o.label}
          </Chip>
        ))}
      </Group>

      <View style={styles.fields}>
        <Field
          label="Minimum spend (₹, optional)"
          value={form.min_spend}
          onChangeText={(min_spend) => patch({ min_spend })}
          keyboardType="decimal-pad"
          error={errors.min_spend}
        />
        <Field
          label="Any other condition (optional)"
          value={form.custom_rule}
          onChangeText={(custom_rule) => patch({ custom_rule })}
          placeholder="e.g. Not valid with other offers"
        />
        <Field
          label="Cancellation policy (optional)"
          value={form.cancellation_policy}
          onChangeText={(cancellation_policy) => patch({ cancellation_policy })}
          placeholder="e.g. Free cancellation up to 2 hours before"
          multiline
          style={styles.multilineSmall}
        />
        <Field
          label="Terms (optional)"
          value={form.terms}
          onChangeText={(terms) => patch({ terms })}
          multiline
          style={styles.multilineSmall}
        />
      </View>
    </>
  );
}

function ActionsStep({ form, patch, errors }: StepProps) {
  const toggle = (c: CtaType) =>
    patch({
      secondary_ctas: form.secondary_ctas.includes(c)
        ? form.secondary_ctas.filter((x) => x !== c)
        : [...form.secondary_ctas, c],
    });
  return (
    <>
      <View style={styles.group}>
        <Label>Main button</Label>
        {PRIMARY_CTAS.map((o) => {
          const selected = form.primary_cta === o.cta;
          return (
            <Pressable
              key={o.cta}
              onPress={() => patch({ primary_cta: o.cta })}
              accessibilityRole="radio"
              aria-checked={selected}
              style={[styles.option, selected && styles.optionOn]}
            >
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.flex}>
                <Text style={styles.optionTitle}>{ctaLabel(o.cta)}</Text>
                <Text style={styles.hint}>{o.hint}</Text>
              </View>
            </Pressable>
          );
        })}
        {errors.primary_cta ? <Text style={styles.error}>{errors.primary_cta}</Text> : null}
      </View>

      <Group label="Also show" hint="Quick links on the deal page.">
        {SECONDARY_CTAS.map((c) => (
          <Chip key={c} selected={form.secondary_ctas.includes(c)} onPress={() => toggle(c)}>
            {ctaLabel(c)}
          </Chip>
        ))}
      </Group>
    </>
  );
}

function ReviewStep({
  form,
  preview,
  onEdit,
}: {
  form: WizardForm;
  preview: DealCardModel | null;
  onEdit: (step: number) => void;
}) {
  const rows: { step: number; label: string; value: string }[] = [
    {
      step: 0,
      label: 'Category',
      value:
        (CATEGORIES.find((c) => c.slug === form.category_slug)?.name ?? '—') +
        ' · ' +
        DEAL_TYPE_LABEL[form.deal_type_code],
    },
    { step: 1, label: 'Title', value: form.title },
    {
      step: 2,
      label: 'Price',
      value:
        (form.deal_price === '0' ? 'Free' : '₹' + form.deal_price) +
        (form.price_unit ?? '') +
        (form.original_price ? ' (usually ₹' + form.original_price + ')' : ''),
    },
    {
      step: 3,
      label: 'When',
      value:
        dateLabel(form.starts_at) +
        ' to ' +
        dateLabel(form.ends_at) +
        ' · ' +
        availabilityLabel({ days: form.days, start_time: form.start_time, end_time: form.end_time }),
    },
    {
      step: 4,
      label: 'Limits',
      value:
        (form.capacity_total ? form.capacity_total + ' in total' : 'No total limit') +
        ' · up to ' +
        form.max_qty_per_customer +
        ' each' +
        (form.min_age ? ' · ' + form.min_age + '+' : '') +
        (form.booking_required
          ? ' · booking needed' + (form.slot_capacity ? ', ' + form.slot_capacity + ' per time slot' : '')
          : '') +
        (form.party ? ' · ' + partyLabel(form.party).toLowerCase() : '') +
        (form.vehicles.length ? ' · for ' + (vehicleFitLabel(form.vehicles) ?? 'vehicles') : ''),
    },
    {
      step: 5,
      label: 'Button',
      value:
        ctaLabel(form.primary_cta) +
        (form.secondary_ctas.length ? ' + ' + form.secondary_ctas.map(ctaLabel).join(', ') : ''),
    },
  ];

  return (
    <>
      <Label>How customers will see it</Label>
      <View style={styles.preview}>
        {preview ? (
          <>
            <DealCard deal={preview} variant="large" badge={null} showDistance={false} />
            <DealCard deal={preview} variant="list" badge={null} showDistance={false} />
          </>
        ) : (
          <Text style={styles.hint}>Loading preview…</Text>
        )}
      </View>

      <View style={styles.reviewList}>
        {rows.map((r) => (
          <Pressable
            key={r.label}
            onPress={() => onEdit(r.step)}
            accessibilityRole="button"
            accessibilityLabel={'Edit ' + r.label}
            style={styles.reviewRow}
          >
            <View style={styles.flex}>
              <Text style={styles.reviewLabel}>{r.label}</Text>
              <Text style={styles.reviewValue}>{r.value}</Text>
            </View>
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.hint}>
        The YOLO team checks every deal before it goes live, usually within a few hours. You will get a
        notification either way.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.surface,
  },
  flex: {
    flex: 1,
  },
  saveExit: {
    paddingHorizontal: space.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  saveExitText: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.white,
  },
  progressWrap: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  stepCount: {
    ...type.overline,
    color: color.textSecondary,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    marginTop: space.sm,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: color.brand,
  },
  stepTitle: {
    ...type.h1,
    color: color.text,
    marginTop: space.md,
  },
  body: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    padding: space.xl,
    paddingBottom: space.xxxl,
  },
  sentBack: {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: statusColor.danger.bg,
    gap: 2,
    marginBottom: space.lg,
  },
  sentBackTitle: {
    ...type.captionMedium,
    color: statusColor.danger.fg,
  },
  sentBackText: {
    ...type.body,
    color: color.text,
  },
  leaveText: {
    ...type.body,
    color: color.textSecondary,
  },
  leaveActions: {
    gap: space.sm,
    marginTop: space.lg,
  },
  fields: {
    gap: space.lg,
    marginBottom: space.xl,
  },
  multiline: {
    height: 120,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  multilineSmall: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  group: {
    marginBottom: space.xl,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  hint: {
    ...type.caption,
    color: color.textSecondary,
    marginBottom: space.sm,
  },
  error: {
    ...type.caption,
    color: color.alert,
    marginTop: space.sm,
  },
  summary: {
    ...type.captionMedium,
    color: color.brand,
    marginTop: -space.sm,
    marginBottom: space.xl,
  },
  savingBox: {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.deal,
  },
  savingText: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.text,
  },
  row2: {
    flexDirection: 'row',
    gap: space.md,
    marginBottom: space.lg,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    marginBottom: space.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  toggleLabel: {
    ...type.bodySemibold,
    color: color.text,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.sm,
  },
  optionOn: {
    borderColor: color.brand,
    backgroundColor: color.surfaceSoftAlt,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: color.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: color.brand,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.brand,
  },
  optionTitle: {
    ...type.bodySemibold,
    color: color.text,
  },
  preview: {
    gap: space.md,
    marginBottom: space.xl,
  },
  reviewList: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.lg,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  reviewLabel: {
    ...type.overline,
    color: color.textSecondary,
  },
  reviewValue: {
    ...type.body,
    color: color.text,
  },
  editLink: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.brand,
  },
  saveError: {
    ...type.captionMedium,
    color: color.alert,
    marginTop: space.lg,
  },
  footer: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xl,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.surface,
  },
  footerInner: {
    flexDirection: 'row',
    gap: space.md,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
});
