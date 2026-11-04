import React from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES, formatINR, type Transaction } from '@upi/core';
import { useTheme } from '../theme';
import { Pill } from './ui';

const APP_LABEL = { gpay: 'Google Pay', phonepe: 'PhonePe', paytm: 'Paytm', bhim: 'BHIM', bank_app: 'Bank app', unknown: 'Unknown app' } as const;

export function describeTxn(t: Transaction) {
  if (t.kind === 'self_transfer') return 'Own-account transfer';
  if (t.kind === 'reversal') return t.direction === 'debit' ? 'Reversed payment' : 'Payment reversal';
  if (t.kind === 'refund') return 'Refund';
  return null;
}

export function timeLabel(iso: string) {
  const d = new Date(new Date(iso).getTime() + 330 * 60_000);
  const h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

export function TransactionRow({ t, index = 0, showDate }: { t: Transaction; index?: number; showDate?: boolean }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const cat = CATEGORIES.find((c) => c.id === t.categoryId) ?? CATEGORIES[CATEGORIES.length - 1]!;
  const excluded = t.kind === 'self_transfer' || t.kind === 'reversal' || t.status === 'failed';
  const credit = t.direction === 'credit';
  const amountColor = excluded || t.status === 'pending' ? colors.textMuted : credit ? colors.income : colors.text;
  const special = describeTxn(t);

  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.delay(Math.min(index, 10) * 45).duration(350)}
      accessible accessibilityLabel={`${t.merchant}, ${credit ? 'credit' : 'debit'} ${formatINR(t.amountPaise)}, ${t.status}${special ? ', ' + special : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, opacity: t.status === 'failed' ? 0.6 : 1 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: cat.color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={cat.icon as never} size={21} color={cat.color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{t.merchant}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {showDate ? `${t.dayKey.slice(8)}/${t.dayKey.slice(5, 7)} · ` : ''}{timeLabel(t.occurredAt)} · {t.paymentApp === 'unknown' && t.channel === 'upi' ? 'UPI' : APP_LABEL[t.paymentApp]}
          </Text>
          {t.status === 'pending' && <Pill label="Pending" color={colors.warning} bg={colors.warning + '22'} />}
          {t.status === 'failed' && <Pill label="Failed" color={colors.expense} bg={colors.expense + '22'} />}
          {special && <Pill label={special} color={colors.textMuted} bg={colors.cardAlt} />}
          {t.needsReview && t.status === 'confirmed' && !special && <Pill label="Review" color={colors.warning} bg={colors.warning + '22'} />}
        </View>
      </View>
      <Text style={{ color: amountColor, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'], textDecorationLine: t.status === 'failed' ? 'line-through' : 'none' }}>
        {credit ? '+' : '−'}{formatINR(t.amountPaise)}
      </Text>
    </Animated.View>
  );
}
