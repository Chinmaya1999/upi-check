import React from 'react';
import { Text, View } from 'react-native';
import type { Bank } from '../data/banks';

/** Brand-coloured bank mark. (Monogram on the bank's brand colour — official logo files are trademarked, so they aren't bundled.) */
export function BankBadge({ bank, size = 44 }: { bank: Bank; size?: number }) {
  const long = bank.short.length > 2;
  return (
    <View accessibilityLabel={bank.name} style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bank.bg, alignItems: 'center', justifyContent: 'center',
      shadowColor: bank.bg, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
      <Text style={{ color: bank.fg, fontWeight: '900', fontSize: size * (long ? 0.28 : bank.short.length === 2 ? 0.36 : 0.5), letterSpacing: long ? -0.5 : 0, fontStyle: bank.id.startsWith('airtel') ? 'italic' : 'normal' }}>{bank.short}</Text>
    </View>
  );
}
