/**
 * The frame for the privacy policy and the terms: a header, the effective
 * date, then numbered sections of plain paragraphs and bullet lists. Readable
 * on a phone and capped to a comfortable line length on desktop.
 */

import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Header } from '../components';
import { LEGAL, legalGaps } from '../lib/legal';
import { alpha, color, radius, space, type } from '../theme/tokens';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const gaps = legalGaps();
  return (
    <View style={styles.screen}>
      <Header title={title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <ScrollView contentContainerStyle={styles.content}>
        {gaps.length > 0 ? (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              Draft: fill {gaps.join(', ')} in src/lib/legal.ts before going live.
            </Text>
          </View>
        ) : null}
        <Text style={styles.updated}>Effective {LEGAL.effectiveDate}</Text>
        {children}
      </ScrollView>
    </View>
  );
}

export function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h} accessibilityRole="header">
        {n + '. ' + title}
      </Text>
      {children}
    </View>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <View style={styles.list}>
      {items.map((t) => (
        <View key={t} style={styles.item}>
          <Text style={styles.dot}>•</Text>
          <Text style={[styles.p, styles.itemText]}>{t}</Text>
        </View>
      ))}
    </View>
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
  warn: {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: alpha(color.alert, 0.08),
    marginBottom: space.md,
  },
  warnText: {
    ...type.captionMedium,
    color: color.alert,
  },
  updated: {
    ...type.caption,
    color: color.textSecondary,
  },
  section: {
    marginTop: space.xl,
    gap: space.sm,
  },
  h: {
    ...type.h3,
    color: color.text,
  },
  p: {
    ...type.body,
    color: color.text,
  },
  list: {
    gap: space.xs,
  },
  item: {
    flexDirection: 'row',
    gap: space.sm,
  },
  dot: {
    ...type.body,
    color: color.textSecondary,
  },
  itemText: {
    flex: 1,
  },
});
