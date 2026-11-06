import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buildInsights, type InsightTone } from '@upi/core';
import { radius, space, useTheme } from '../theme';
import { useStore } from '../data/store';

/** "Smart insights": plain-language highlights worked out from the user's own transactions (spending changes, unusual payments). */
export function Insights() {
  const { colors } = useTheme();
  const { txns, now } = useStore();
  const items = useMemo(() => buildInsights(txns, now), [txns, now]);
  if (!items.length) return null;
  const tone: Record<InsightTone, string> = { alert: colors.expense, warn: colors.warning, good: colors.income, info: colors.brand };
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="sparkles" size={16} color={colors.brand} />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>Smart insights</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>from your own spending</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={272} decelerationRate="fast"
        style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
        {items.map((i) => {
          const c = tone[i.tone];
          return (
            <View key={i.id} accessible accessibilityLabel={`${i.title}. ${i.detail}`}
              style={{ width: 260, borderRadius: Math.max(radius.lg - 4, 6), padding: space.md + 2, gap: 8, backgroundColor: c + '1A', borderWidth: 1, borderColor: c + '44' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={i.icon as never} size={18} color="#fff" />
                </View>
                <Text numberOfLines={2} style={{ flex: 1, color: colors.text, fontSize: 14, fontWeight: '800', lineHeight: 18 }}>{i.title}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12.5, lineHeight: 17 }}>{i.detail}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
