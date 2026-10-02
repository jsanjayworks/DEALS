import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { DealCard, EmptyState, Header } from '../../components';
import { db } from '../../data';
import type { DealCardModel } from '../../data/types';
import { color, space } from '../../theme/tokens';

export default function DealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [deal, setDeal] = useState<DealCardModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void db.getDeal(String(id)).then((d) => {
      if (active) {
        setDeal(d);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: color.background }}>
      <Header title={deal ? deal.business.name : 'Deal'} onBack={() => router.back()} />
      {!loading && !deal ? (
        <EmptyState icon="x" title="Deal not found" body="It may have ended or been paused." tone="alert" />
      ) : null}
      {deal ? (
        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          <DealCard deal={deal} variant="large" />
        </ScrollView>
      ) : null}
    </View>
  );
}
