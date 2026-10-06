/**
 * My vehicle: pick the bike, scooter or car you own, once, and every deal
 * for it is one tap away: servicing, washes, tyres, accessories and riding
 * gear, from any category. Remembered on this device.
 *
 * A model you do not see can be saved as "another bike", which still finds
 * everything for bikes in general.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  VEHICLES,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABEL,
  choiceLabel,
  vehicleById,
  type VehicleType,
} from '../data/vehicles';
import { useSession } from '../state/session';
import { color, radius, size, space, type } from '../theme/tokens';
import { Button, Chip, Header, Icon, type IconName } from '../components';

const TYPE_ICON: Record<VehicleType, IconName> = { bike: 'bike', scooter: 'bike', car: 'car' };

export default function VehicleScreen() {
  const insets = useSafeAreaInsets();
  const vehicleId = useSession((s) => s.vehicleId);
  const setVehicle = useSession((s) => s.setVehicle);
  const [kind, setKind] = useState<VehicleType>(() => {
    if (vehicleId?.startsWith('type:')) return vehicleId.slice(5) as VehicleType;
    return vehicleById(vehicleId)?.type ?? 'bike';
  });

  const models = VEHICLES.filter((v) => v.type === kind);
  const brands = [...new Set(models.map((v) => v.brand))];
  const label = choiceLabel(vehicleId);

  // People travel further for a garage than for lunch, so look 10 km out.
  const showDeals = () =>
    router.push({ pathname: '/results', params: { vehicle: vehicleId ?? '', radius: '10000' } });

  return (
    <View style={styles.screen}>
      <Header title="My vehicle" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Pick yours and see every deal for it in one place: servicing, washes, tyres, accessories
          and gear.
        </Text>

        <View style={styles.kinds} accessibilityRole="tablist">
          {VEHICLE_TYPES.map((t) => (
            <Chip key={t} selected={kind === t} onPress={() => setKind(t)}>
              {VEHICLE_TYPE_LABEL[t]}
            </Chip>
          ))}
        </View>

        {brands.map((brand) => (
          <View key={brand}>
            <Text style={styles.brand}>{brand}</Text>
            <View style={styles.group}>
              {models
                .filter((v) => v.brand === brand)
                .map((v, i, list) => (
                  <Choice
                    key={v.id}
                    icon={TYPE_ICON[v.type]}
                    title={v.model}
                    selected={vehicleId === v.id}
                    last={i === list.length - 1}
                    onPress={() => setVehicle(v.id)}
                  />
                ))}
            </View>
          </View>
        ))}

        <Text style={styles.brand}>Not listed</Text>
        <View style={styles.group}>
          <Choice
            icon={TYPE_ICON[kind]}
            title={'Another ' + VEHICLE_TYPE_LABEL[kind].toLowerCase()}
            selected={vehicleId === 'type:' + kind}
            last
            onPress={() => setVehicle('type:' + kind)}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        {vehicleId ? (
          <>
            <Button variant="secondary" onPress={() => setVehicle(null)}>
              Remove
            </Button>
            <View style={styles.footerMain}>
              <Button full onPress={showDeals} accessibilityLabel={'Show deals for ' + (label ?? 'it')}>
                Show deals
              </Button>
            </View>
          </>
        ) : (
          <Text style={styles.hint}>Choose one to see its deals.</Text>
        )}
      </View>
    </View>
  );
}

function Choice({
  icon,
  title,
  selected,
  last,
  onPress,
}: {
  icon: IconName;
  title: string;
  selected: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      aria-checked={selected}
      accessibilityLabel={title}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.pressed]}
    >
      <Icon name={icon} size={20} color={color.brand} />
      <Text style={[styles.rowTitle, selected && styles.rowTitleOn]}>{title}</Text>
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <Icon name="check" size={14} color={color.white} strokeWidth={2.4} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  intro: {
    ...type.body,
    color: color.textSecondary,
  },
  kinds: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
  },
  brand: {
    ...type.overline,
    color: color.textSecondary,
    marginTop: space.xl,
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
  rowTitleOn: {
    ...type.bodySemibold,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    backgroundColor: color.brand,
    borderColor: color.brand,
  },
  pressed: {
    opacity: 0.6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.surface,
  },
  footerMain: {
    flex: 1,
  },
  hint: {
    ...type.caption,
    color: color.textSecondary,
    flex: 1,
    textAlign: 'center',
  },
});
