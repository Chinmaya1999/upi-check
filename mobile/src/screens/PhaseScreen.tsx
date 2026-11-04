import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, space } from '../theme';
import { Card } from '../components/ui';

/** Honest placeholder for screens whose phase hasn't shipped. Not wired to fake data. */
export function PhaseScreen({ title, phase, icon, needs }: { title: string; phase: number; icon: string; needs: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.md, paddingHorizontal: space.lg, gap: space.lg }}>
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 }}>{title}</Text>
      <Card style={{ alignItems: 'center', gap: 10, paddingVertical: space.xxl }}>
        <Ionicons name={icon as never} size={42} color={colors.brand} />
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Planned for Phase {phase}</Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 21 }}>{needs}</Text>
      </Card>
    </View>
  );
}
