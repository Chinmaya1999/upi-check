import React from 'react';
import { Text, View } from 'react-native';
import { formatINR } from '@upi/core';
import { useTheme } from '../theme';
import { useStore } from '../data/store';
import { PERIOD_LABEL, statuses } from '../data/budgets';
import { Card, Eyebrow } from './ui';
import { ShareBar } from './Viz';

/** Day / week / month budgets at a glance. Hidden until at least one budget is set. */
export function BudgetStrip() {
  const { colors } = useTheme();
  const { txns, limits, now } = useStore();
  const st = statuses(txns, limits, now).filter((s) => s.limit);
  if (!st.length) return null;
  return (
    <Card style={{ gap: 14 }}>
      <Eyebrow>Your budgets</Eyebrow>
      {st.map((s, i) => {
        const over = (s.pct ?? 0) > 100, warn = (s.pct ?? 0) >= 80;
        const color = over ? colors.expense : warn ? colors.warning : colors.income;
        return (
          <View key={s.period} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{PERIOD_LABEL[s.period]}</Text>
              <Text style={{ color: over ? colors.expense : colors.textMuted, fontSize: 12.5, fontWeight: '600' }}>
                {formatINR(s.spent)} / {formatINR(s.limit!)}{over ? ' · over!' : ''}
              </Text>
            </View>
            <ShareBar pct={Math.min(s.pct ?? 0, 100)} color={color} delay={i * 120} />
          </View>
        );
      })}
    </Card>
  );
}
