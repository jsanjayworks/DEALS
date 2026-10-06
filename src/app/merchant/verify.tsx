/**
 * "Get YOLO Verified": the owner's registration details.
 *
 * What is asked for is what an Indian business can actually show: the
 * registered name and type, a GSTIN — or, under the GST threshold, a PAN plus
 * a Udyam, Shop and Establishment or trade licence number — an FSSAI number
 * for food, the registered address, and who is applying.
 *
 * Numbers are checked as they are typed with the same rules the database
 * applies (src/lib/india-ids.ts), so a typo in a GSTIN shows up here, not as
 * a rejection a day later. A declined request comes back pre-filled, with the
 * admin's reason on top.
 */

import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, RuleViolation, type BusinessVerification, type VerificationInput } from '../../data';
import type { Business } from '../../data/types';
import { hapticSuccess } from '../../lib/device';
import {
  CONSTITUTION_LABEL,
  LICENCE_LABEL,
  fssaiProblem,
  gstinProblem,
  normaliseId,
  panConstitutionProblem,
  panOfGstin,
  panProblem,
  stateOfGstin,
  udyamProblem,
  type Constitution,
  type LicenceType,
} from '../../lib/india-ids';
import { useQuery } from '../../lib/useQuery';
import { useBusiness } from '../../merchant/useBusiness';
import { color, radius, space, type } from '../../theme/tokens';
import { Button, Chip, EmptyState, Field, Header, Icon, Label } from '../../components';

const ROLES: { key: VerificationInput['owner_role']; label: string }[] = [
  { key: 'owner', label: 'Owner' },
  { key: 'partner', label: 'Partner' },
  { key: 'director', label: 'Director' },
  { key: 'manager', label: 'Manager' },
];

export default function VerifyBusinessScreen() {
  const { business } = useBusiness();
  const fetchContext = useCallback(async () => {
    if (!business) return null;
    const [last, categories] = await Promise.all([
      db.getBusinessVerification(business.id),
      db.getCategories(),
    ]);
    const isFood = categories.find((c) => c.id === business.primary_category_id)?.vertical === 'food';
    return { last, isFood };
  }, [business]);
  const { data } = useQuery(fetchContext);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/merchant'));

  return (
    <View style={styles.screen}>
      <Header title="Get YOLO Verified" dark onBack={close} />
      {/* Already verified, or a request is waiting: say so instead of an empty form. */}
      {business && business.verification_status === 'verified' ? (
        <EmptyState
          icon="shield"
          title="You are YOLO Verified"
          body={business.name + ' shows the badge on every deal. Nothing more to do here.'}
          action={<Button onPress={close}>Back to the dashboard</Button>}
        />
      ) : business && data?.last?.status === 'submitted' ? (
        <EmptyState
          icon="clock"
          title="Your request is in review"
          body="We check the registration details within two working days and notify you either way."
          action={<Button onPress={close}>Back to the dashboard</Button>}
        />
      ) : business && data ? (
        // Mounted once the last request is known, so a declined one comes back pre-filled.
        <VerifyForm business={business} last={data.last} isFood={data.isFood} onDone={close} />
      ) : null}
    </View>
  );
}

function VerifyForm({
  business,
  last,
  isFood,
  onDone,
}: {
  business: Business;
  last: BusinessVerification | null;
  isFood: boolean;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [legalName, setLegalName] = useState(last?.legal_name ?? '');
  const [constitution, setConstitution] = useState<Constitution | null>(last?.constitution ?? null);
  const [hasGst, setHasGst] = useState(last ? !!last.gstin : true);
  const [gstin, setGstin] = useState(last?.gstin ?? '');
  const [pan, setPan] = useState(last?.pan ?? '');
  const [licenceType, setLicenceType] = useState<LicenceType | null>(last?.licence_type ?? null);
  const [licence, setLicence] = useState(last?.licence_number ?? '');
  const [fssai, setFssai] = useState(last?.fssai ?? '');
  const [address, setAddress] = useState(last?.registered_address ?? business.address_line);
  const [ownerName, setOwnerName] = useState(last?.owner_name ?? '');
  const [role, setRole] = useState<VerificationInput['owner_role'] | null>(last?.owner_role ?? null);
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Any edit clears the last error; it described the form as it was. */
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setError(null);
  };

  // Live feedback once a number is long enough to judge.
  const gstinNow = normaliseId(gstin);
  const gstinIssue = gstinNow.length >= 15 ? gstinProblem(gstinNow) : null;
  const gstinOk = gstinNow.length === 15 && !gstinIssue;
  const panNow = hasGst ? (gstinOk ? panOfGstin(gstinNow) : '') : normaliseId(pan);
  const panIssue = !hasGst && panNow.length >= 10 ? panProblem(panNow) : null;
  const typeIssue =
    constitution && panNow.length === 10 && !panProblem(panNow) ? panConstitutionProblem(panNow, constitution) : null;
  const fssaiNow = fssai.replace(/\s/g, '');
  const fssaiIssue = fssaiNow.length >= 14 ? fssaiProblem(fssaiNow) : null;

  /** The first thing stopping a submit, in the order the form reads. */
  const firstProblem = (): string | null => {
    if (legalName.trim().length < 2) return 'Enter the registered business name';
    if (!constitution) return 'Choose the type of business';
    if (hasGst) {
      if (!gstinNow) return 'Enter your GSTIN';
      const g = gstinProblem(gstinNow);
      if (g) return g;
    } else {
      const p = panProblem(panNow);
      if (p) return p;
      if (!licenceType) return 'Choose a registration: Udyam, Shop & Establishment or trade licence';
      if (licence.trim().length < 5) return 'Enter the registration number';
      if (licenceType === 'udyam') {
        const u = udyamProblem(licence);
        if (u) return u;
      }
    }
    if (typeIssue) return typeIssue;
    if (isFood && !fssaiNow) return 'Food businesses need their 14-digit FSSAI number';
    if (fssaiNow && fssaiProblem(fssaiNow)) return 'FSSAI numbers have 14 digits';
    if (address.trim().length < 10) return 'Enter the registered address';
    if (ownerName.trim().length < 2) return 'Enter your full name as on your PAN or ID';
    if (!role) return 'Choose your role in the business';
    if (!declared) return 'Tick the box to confirm the details are correct';
    return null;
  };

  const submit = async () => {
    const problem = firstProblem();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await db.submitBusinessVerification(business.id, {
        legal_name: legalName.trim(),
        constitution: constitution!,
        ...(hasGst
          ? { gstin: gstinNow }
          : { pan: panNow, licence_type: licenceType!, licence_number: licence.trim().toUpperCase() }),
        fssai: fssaiNow || undefined,
        registered_address: address.trim(),
        owner_name: ownerName.trim(),
        owner_role: role!,
        declared,
      });
      hapticSuccess();
      onDone();
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
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
      >
        <Text style={styles.lead}>
          The badge tells customers a real, registered business is behind your deals. An admin checks these details
          against the public GST record before granting it.
        </Text>

        {last?.status === 'rejected' && last.rejection_reason ? (
          <View style={styles.declined} accessibilityLiveRegion="polite">
            <Icon name="x" size={16} color={color.alert} strokeWidth={2.2} />
            <View style={styles.flex}>
              <Text style={styles.declinedTitle}>Last request was declined</Text>
              <Text style={styles.declinedBody}>{last.rejection_reason}</Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.section}>Business</Text>
        <Field
          label="Registered business name"
          value={legalName}
          onChangeText={edit(setLegalName)}
          placeholder="As on your GST certificate or PAN"
          autoCapitalize="words"
          accessibilityLabel="Registered business name"
        />

        <Label>Type of business</Label>
        <View style={styles.chips}>
          {(Object.keys(CONSTITUTION_LABEL) as Constitution[]).map((k) => (
            <Chip key={k} selected={constitution === k} onPress={() => edit(setConstitution)(k)}>
              {CONSTITUTION_LABEL[k]}
            </Chip>
          ))}
        </View>

        <Label>Registered under GST?</Label>
        <View style={styles.chips}>
          <Chip selected={hasGst} onPress={() => edit(setHasGst)(true)}>
            Yes, I have a GSTIN
          </Chip>
          <Chip selected={!hasGst} onPress={() => edit(setHasGst)(false)}>
            No
          </Chip>
        </View>

        {hasGst ? (
          <>
            <Field
              label="GSTIN"
              value={gstin}
              onChangeText={(t) => edit(setGstin)(t.toUpperCase())}
              placeholder="29ABCDE1234F1Z5"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={17}
              accessibilityLabel="GSTIN"
              error={gstinIssue}
            />
            {gstinOk ? (
              <View style={styles.okRow}>
                <Icon name="check" size={14} color={color.accentText} strokeWidth={2.4} />
                <Text style={styles.okText}>
                  {stateOfGstin(gstinNow)} · PAN {panOfGstin(gstinNow)}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Field
              label="PAN"
              value={pan}
              onChangeText={(t) => edit(setPan)(t.toUpperCase())}
              placeholder="ABCDE1234F"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              accessibilityLabel="PAN"
              error={panIssue}
            />
            <Label>Registration</Label>
            <View style={styles.chips}>
              {(Object.keys(LICENCE_LABEL) as LicenceType[]).map((k) => (
                <Chip key={k} selected={licenceType === k} onPress={() => edit(setLicenceType)(k)}>
                  {LICENCE_LABEL[k]}
                </Chip>
              ))}
            </View>
            <Field
              label={licenceType ? LICENCE_LABEL[licenceType] + ' number' : 'Registration number'}
              value={licence}
              onChangeText={edit(setLicence)}
              placeholder={licenceType === 'udyam' ? 'UDYAM-KR-03-0012345' : 'As on the certificate'}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Registration number"
            />
          </>
        )}
        {typeIssue ? <Text style={styles.error}>{typeIssue}</Text> : null}

        <Field
          label={isFood ? 'FSSAI licence or registration number' : 'FSSAI number (food businesses only)'}
          value={fssai}
          onChangeText={edit(setFssai)}
          placeholder="14 digits"
          keyboardType="number-pad"
          maxLength={16}
          accessibilityLabel="FSSAI number"
          error={fssaiIssue}
        />

        <Field
          label="Registered address"
          value={address}
          onChangeText={edit(setAddress)}
          placeholder="As on your GST certificate"
          multiline
          accessibilityLabel="Registered address"
          style={styles.multiline}
        />

        <Text style={styles.section}>You</Text>
        <Field
          label="Your full name"
          value={ownerName}
          onChangeText={edit(setOwnerName)}
          placeholder="As on your PAN or ID"
          autoCapitalize="words"
          accessibilityLabel="Your full name"
        />
        <Label>Your role</Label>
        <View style={styles.chips}>
          {ROLES.map((r) => (
            <Chip key={r.key} selected={role === r.key} onPress={() => edit(setRole)(r.key)}>
              {r.label}
            </Chip>
          ))}
        </View>

        <Pressable
          onPress={() => edit(setDeclared)(!declared)}
          accessibilityRole="checkbox"
          aria-checked={declared}
          style={styles.declare}
        >
          <View style={[styles.tick, declared && styles.tickOn]}>
            {declared ? <Icon name="check" size={12} color={color.white} strokeWidth={2.6} /> : null}
          </View>
          <Text style={styles.declareText}>
            I confirm these details are correct and that I am authorised to represent {business.name}.
          </Text>
        </Pressable>

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button variant="cta" full loading={busy} onPress={() => void submit()}>
          Send for review
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
  section: {
    ...type.h3,
    color: color.text,
    marginTop: space.lg,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.xs,
  },
  okRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -space.xs,
  },
  okText: {
    ...type.captionMedium,
    color: color.textSecondary,
  },
  multiline: {
    height: 88,
    paddingTop: space.md,
    textAlignVertical: 'top',
  },
  declined: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: '#FDECEF',
  },
  declinedTitle: {
    ...type.captionMedium,
    color: color.alert,
  },
  declinedBody: {
    ...type.caption,
    color: color.text,
  },
  declare: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    marginTop: space.md,
    minHeight: 44,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: color.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tickOn: {
    backgroundColor: color.brand,
    borderColor: color.brand,
  },
  declareText: {
    ...type.caption,
    color: color.textSecondary,
    flex: 1,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
});
