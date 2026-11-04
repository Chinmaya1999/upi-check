import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, space, radius } from '../theme';
import { Button, Tap } from '../components/ui';
import { useStore } from '../data/store';

const ACCOUNT = 'manual-cash';

export function AddTransactionModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { addManual } = useStore();
  const [dir, setDir] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState('');
  const [who, setWho] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const shake = useSharedValue(0);
  const shakeS = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const save = async () => {
    const now = new Date().toISOString();
    const r = await addManual({
      accountId: ACCOUNT, direction: dir, amount, date: now,
      narration: dir === 'debit' ? `Paid to ${who.trim() || 'Unknown'}` : `Received from ${who.trim() || 'Unknown'}`,
    });
    setStatus({ ok: r.ok, msg: r.message });
    if (r.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => { setAmount(''); setWho(''); setStatus(null); onClose(); }, 700);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      shake.value = withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 70 }), withTiming(-6, { duration: 70 }), withTiming(0, { duration: 50 }));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Animated.View style={[{ backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space.xl, gap: space.lg }, shakeS]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Add transaction</Text>
            <Tap onPress={onClose} label="Close"><Ionicons name="close" size={26} color={colors.textMuted} /></Tap>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 4 }}>
            {(['debit', 'credit'] as const).map((d) => (
              <Tap key={d} onPress={() => setDir(d)} label={d === 'debit' ? 'Money spent' : 'Money received'} style={{ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: dir === d ? colors.card : 'transparent' }}>
                <Text style={{ fontWeight: '700', color: dir === d ? (d === 'debit' ? colors.expense : colors.income) : colors.textMuted }}>{d === 'debit' ? 'Spent' : 'Received'}</Text>
              </Tap>
            ))}
          </View>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="₹ 0" placeholderTextColor={colors.textMuted} accessibilityLabel="Amount in rupees"
            style={{ color: colors.text, fontSize: 40, fontWeight: '800', paddingVertical: 4 }} />
          <TextInput value={who} onChangeText={setWho} placeholder={dir === 'debit' ? 'Paid to (e.g. Chai Point)' : 'Received from'} placeholderTextColor={colors.textMuted} accessibilityLabel="Merchant or person"
            style={{ backgroundColor: colors.card, color: colors.text, height: 52, borderRadius: radius.md, paddingHorizontal: 16, fontSize: 16 }} />
          {status && <Text style={{ color: status.ok ? colors.income : colors.expense, fontWeight: '600' }}>{status.msg}</Text>}
          <Button title="Save" onPress={save} />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
