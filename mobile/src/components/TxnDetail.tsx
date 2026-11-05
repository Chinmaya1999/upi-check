import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES, formatINR, type Transaction } from '@upi/core';
import { space, useTheme } from '../theme';
import { bankOf } from '../data/banks';
import { BankBadge } from './BankBadge';
import { Button } from './ui';

const APP = { gpay: 'Google Pay', phonepe: 'PhonePe', paytm: 'Paytm', bhim: 'BHIM', bank_app: 'Bank app', unknown: '—' } as const;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

/** Bottom sheet with everything we know about one transaction, including the original bank SMS. */
export function TxnDetail({ t, onClose, onDelete }: { t: Transaction | null; onClose: () => void; onDelete?: () => void }) {
  const { colors } = useTheme();
  if (!t) return null;
  const bank = bankOf(t);
  const cat = CATEGORIES.find((c) => c.id === t.categoryId);
  const credit = t.direction === 'credit';
  const sms = t.originals.map((o) => o.payload as { body?: string; address?: string }).find((p) => p?.body);
  const row = (k: string, v: string) => !v || v === '—' ? null : (
    <View style={{ flexDirection: 'row', paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Text style={{ width: 112, color: colors.textMuted, fontSize: 13.5 }}>{k}</Text>
      <Text selectable style={{ flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' }}>{v}</Text>
    </View>
  );
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close details" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <Animated.View entering={SlideInDown.duration(320)} style={{ backgroundColor: colors.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '88%' }}>
          <Pressable>
            <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: 36 }}>
              <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.lg }} />
              <View style={{ alignItems: 'center', gap: 10 }}>
                <BankBadge bank={bank} size={64} />
                <Text style={{ color: colors.textMuted, fontSize: 13.5, fontWeight: '600' }}>{bank.name}{bank.last4 ? `  ••${bank.last4}` : ''}</Text>
                <Text style={{ color: credit ? colors.income : colors.expense, fontSize: 38, fontWeight: '800', letterSpacing: -1 }}>{credit ? '+' : '−'}{formatINR(t.amountPaise)}</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <View style={{ backgroundColor: (credit ? colors.income : colors.expense) + '22', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99 }}>
                    <Text style={{ color: credit ? colors.income : colors.expense, fontWeight: '800', fontSize: 12.5 }}>{credit ? 'CREDITED' : 'DEBITED'}</Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t.status}</Text>
                </View>
              </View>
              <View style={{ marginTop: space.xl }}>
                {row('To / From', t.merchant)}
                {row('Date & time', when(t.occurredAt))}
                {row('Bank', bank.name)}
                {row('Account', bank.last4 ? `••••${bank.last4}` : '')}
                {row('Paid via', t.paymentApp !== 'unknown' ? APP[t.paymentApp] : t.channel === 'upi' ? 'UPI' : '')}
                {row('Category', cat?.label ?? '')}
                {row('Reference', t.reference ?? '')}
                {row('Source', t.sources.map((s) => (s === 'sms' ? 'Bank SMS' : s === 'notification' ? 'App notification' : s)).join(' + '))}
              </View>
              {sms ? (
                <View style={{ marginTop: space.lg, backgroundColor: colors.cardAlt, borderRadius: 16, padding: 14, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="chatbubble-ellipses" size={14} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>ORIGINAL SMS · {sms.address}</Text></View>
                  <Text selectable style={{ color: colors.text, fontSize: 13.5, lineHeight: 20 }}>{sms.body}</Text>
                </View>
              ) : null}
              <View style={{ marginTop: space.xl, gap: 10 }}>
                <Button title="Done" onPress={onClose} />
                {onDelete ? <Button title="Delete this entry" variant="ghost" onPress={onDelete} /> : null}
              </View>
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
