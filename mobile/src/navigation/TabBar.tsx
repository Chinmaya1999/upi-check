import React from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme';
import { Tap } from '../components/ui';

const ICONS: Record<string, [string, string]> = {
  Home: ['home', 'home-outline'], Transactions: ['swap-vertical', 'swap-vertical-outline'],
  Analytics: ['stats-chart', 'stats-chart-outline'], Budgets: ['wallet', 'wallet-outline'], Profile: ['person', 'person-outline'],
};

function Item({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const s = useSharedValue(focused ? 1 : 0);
  s.value = withSpring(focused ? 1 : 0, { damping: 14, stiffness: 220 });
  const pill = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: 0.6 + 0.4 * s.value }] }));
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * s.value }] }));
  return (
    <Tap onPress={onPress} label={name} style={{ alignItems: 'center', width: 64, paddingVertical: 6 }}>
      <View style={{ width: 52, height: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: 52, height: 32, borderRadius: 16, backgroundColor: colors.brand + '2A' }, pill]} />
        <Animated.View style={icon}>
          <Ionicons name={(ICONS[name]?.[focused ? 0 : 1] ?? 'ellipse') as never} size={22} color={focused ? colors.brand : colors.textMuted} />
        </Animated.View>
      </View>
      <Text style={{ fontSize: 11, fontWeight: focused ? '800' : '600', color: focused ? colors.text : colors.textMuted, marginTop: 2 }}>{name}</Text>
    </Tap>
  );
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 10), flexDirection: 'row', justifyContent: 'space-around',
      backgroundColor: colors.card, borderRadius: 28, paddingVertical: 6, borderWidth: isDark ? 1 : 0, borderColor: colors.border,
      shadowColor: '#000', shadowOpacity: isDark ? 0.4 : 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12,
    }}>
      {state.routes.map((r, i) => (
        <Item key={r.key} name={r.name} focused={state.index === i} onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
          if (state.index !== i && !e.defaultPrevented) navigation.navigate(r.name);
        }} />
      ))}
    </View>
  );
}
