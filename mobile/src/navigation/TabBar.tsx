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
  const { colors, motion, design } = useTheme();
  const s = useSharedValue(focused ? 1 : 0);
  s.value = withSpring(focused ? 1 : 0, { damping: motion.damping, stiffness: motion.stiffness });
  const r = Math.min(16, design.shape.control);
  const kind = design.tabBar;
  const iconsOnly = kind === 'icons';
  const underline = kind === 'underline';
  const pill = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: 0.6 + 0.4 * s.value }] }));
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * s.value }] }));
  return (
    <Tap onPress={onPress} label={name} style={{ alignItems: 'center', width: iconsOnly ? 56 : 64, paddingVertical: 6 }}>
      {underline ? <Animated.View style={[{ position: 'absolute', top: -6, width: 28, height: 3, borderRadius: 2, backgroundColor: colors.brand }, pill]} /> : null}
      <View style={{ width: iconsOnly ? 48 : 52, height: iconsOnly ? 40 : 32, alignItems: 'center', justifyContent: 'center' }}>
        {!underline ? <Animated.View style={[{ position: 'absolute', width: iconsOnly ? 48 : 52, height: iconsOnly ? 40 : 32, borderRadius: iconsOnly ? 20 : r, backgroundColor: iconsOnly ? colors.brand : colors.brand + '2A' }, pill]} /> : null}
        <Animated.View style={icon}>
          <Ionicons name={(ICONS[name]?.[focused ? 0 : 1] ?? 'ellipse') as never} size={iconsOnly ? 24 : 22} color={iconsOnly && focused ? colors.onBrand : focused ? colors.brand : colors.textMuted} />
        </Animated.View>
      </View>
      {iconsOnly ? null : <Text style={{ fontSize: 11, fontWeight: focused ? '800' : '600', color: focused ? colors.text : colors.textMuted, marginTop: 2 }}>{name}</Text>}
    </Tap>
  );
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, isDark, design } = useTheme();
  const insets = useSafeAreaInsets();
  // Three bar styles, chosen by the active design: a floating card, a full-width docked bar, or a compact floating pill.
  const kind = design.tabBar;
  const common = { position: 'absolute' as const, flexDirection: 'row' as const, justifyContent: 'space-around' as const, backgroundColor: colors.card, paddingVertical: 6 };
  const style =
    kind === 'docked' || kind === 'underline'
      ? { ...common, left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 8), borderTopWidth: 1, borderColor: colors.border, borderTopLeftRadius: design.shape.tab, borderTopRightRadius: design.shape.tab }
      : kind === 'pill' || kind === 'icons'
      ? { ...common, left: 16, right: 16, bottom: Math.max(insets.bottom, 12), borderRadius: 999, borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: isDark ? 0.4 : 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 }
      : { ...common, left: 12, right: 12, bottom: Math.max(insets.bottom, 10), borderRadius: design.shape.tab, borderWidth: isDark ? 1 : 0, borderColor: colors.border, shadowColor: '#000', shadowOpacity: isDark ? 0.4 : 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 };
  return (
    <View style={style}>
      {state.routes.map((r, i) => (
        <Item key={r.key} name={r.name} focused={state.index === i} onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
          if (state.index !== i && !e.defaultPrevented) navigation.navigate(r.name);
        }} />
      ))}
    </View>
  );
}
