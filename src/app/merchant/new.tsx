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

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { db, RuleViolation } from '../../data';
import { CATEGORIES, TOP_CATEGORIES } from '../../data/seed-reference';
import type { AudienceKind, CtaType, DealCardModel, DealTypeCode } from '../../data/types';
import { ctaLabel } from '../../data/mapping';
import { isEditable } from '../../domain/lifecycle';
import { DEAL_TYPE_LABEL, availabilityLabel, dateLabel } from '../../lib/format';
import { hapticSuccess } from '../../lib/device';
import { useBusinessId } from '../../merchant/useBusiness';
import {
  STEPS,
  type FieldErrors,
  type WizardForm,
  addDays,
  defaultsFor,
  emptyForm,
  firstInvalidStep,
  fromDeal,
  istDayStart,
  toDraftInput,
  validateStep,
} from '../../merchant/wizard';
import { color, discountPct, font, inr, radius, space, type } from '../../theme/tokens';
import {
  Button,
  Chip,
  DealCard,
  EmptyState,
  Field,
  Header,
  Label,
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

const AUDIENCES: { label: string; value: AudienceKind }[] = [
  { label: 'Everyone', value: 'everyone' },
  { label: 'Verified users', value: 'verified' },
  { label: 'New customers', value: 'new_customers' },
  { label: 'Members', value: 'members' },
];

export default function DealWizardScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
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
    const id = await save();
    if (!id) return;
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

  const saveAndExit = async () => {
    const id = await save();
    if (id) router.back();
  };

  const close = () => router.back();

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
        title={params.id ? 'Edit deal' : 'New deal'}
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
          {step > 0 ? (
            <Button variant="secondary" onPress={() => setStep((s) => s - 1)} disabled={saving}>
              Back
            </Button>
          ) : null}
          <View style={styles.flex}>
            {isReview ? (
              <Button variant="cta" full loading={saving} onPress={() => void submit()}>
                Submit for verification
              </Button>
            ) : (
              <Button full loading={saving} onPress={() => void next()}>
                Next
              </Button>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
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

function CategoryStep({ form, patch, errors }: StepProps) {
  const subs = useMemo(
    () => CATEGORIES.filter((c) => c.parent_id !== null && c.vertical === form.vertical),
    [form.vertical],
  );
  return (
    <>
      <Group label="Category" error={errors.vertical}>
        {TOP_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            selected={form.vertical === c.vertical}
            onPress={() => {
              const d = defaultsFor(c.vertical);
              patch({
                vertical: c.vertical,
                category_slug: c.slug,
                offering_kind: d.kind,
                primary_cta: d.cta,
                secondary_ctas: d.secondary,
                booking_required: d.cta === 'book' || d.cta === 'reserve',
              });
            }}
          >
            {c.name}
          </Chip>
        ))}
      </Group>

      {subs.length > 0 ? (
        <Group label="More specifically" hint="Optional. Helps the right people find it.">
          {subs.map((c) => (
            <Chip
              key={c.id}
              selected={form.category_slug === c.slug}
              onPress={() =>
                patch({ category_slug: form.category_slug === c.slug ? form.vertical : c.slug })
              }
            >
              {c.name}
            </Chip>
          ))}
        </Group>
      ) : null}

      <Group label="Kind of deal">
        {DEAL_TYPES.map((t) => (
          <Chip
            key={t}
            selected={form.deal_type_code === t}
            onPress={() => patch(t === 'free' ? { deal_type_code: t, deal_price: '0' } : { deal_type_code: t })}
          >
            {DEAL_TYPE_LABEL[t]}
          </Chip>
        ))}
      </Group>
    </>
  );
}

function DetailsStep({ form, patch, errors }: StepProps) {
  return (
    <View style={styles.fields}>
      <Field
        label={'Title · ' + form.title.trim().length + '/90'}
        value={form.title}
        onChangeText={(title) => patch({ title })}
        placeholder="e.g. South Indian Thali Lunch"
        maxLength={90}
        error={errors.title}
      />
      <Field
        label={'One-line summary · ' + form.short_description.trim().length + '/120'}
        value={form.short_description}
        onChangeText={(short_description) => patch({ short_description })}
        placeholder="e.g. Unlimited thali, weekdays at lunch"
        maxLength={120}
        error={errors.short_description}
      />
      <Field
        label="Description"
        value={form.description}
        onChangeText={(description) => patch({ description })}
        placeholder="What is included, portion sizes, anything to know before coming in"
        multiline
        style={styles.multiline}
        error={errors.description}
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
    const set = new Set(allDays ? [0, 1, 2, 3, 4, 5, 6] : form.days);
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
        accessibilityState={{ checked: form.booking_required }}
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

      <Group label="Who can use it">
        {AUDIENCES.map((a) => (
          <Chip key={a.value} selected={form.audience === a.value} onPress={() => patch({ audience: a.value })}>
            {a.label}
          </Chip>
        ))}
      </Group>

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
              accessibilityState={{ checked: selected }}
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
        (form.booking_required ? ' · booking needed' : ''),
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
            <DealCard deal={preview} variant="large" badge={null} />
            <DealCard deal={preview} variant="list" badge={null} />
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
    padding: space.xl,
    paddingBottom: space.xxxl,
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
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xl,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.surface,
  },
});
