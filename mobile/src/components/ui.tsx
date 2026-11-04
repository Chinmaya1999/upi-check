import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { radius, space, useTheme } from '../theme';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, isDark } = useTheme();
  return (
    <View style={[{
      backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0, borderColor: colors.border,
      shadowColor: colors.shadow, shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: isDark ? 0 : 3,
    }, style]}>{children}</View>
  );
}

/** Pressable with spring scale feedback and haptic tick. */
export function Tap({ children, onPress, style, label, disabled }: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; label?: string; disabled?: boolean;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      onPressIn={() => { s.value = withSpring(0.97, { damping: 18, stiffness: 300 }); }}
      onPressOut={() => { s.value = withSpring(1, { damping: 14, stiffness: 260 }); }}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onPress?.(); }}
    >
      <Animated.View style={[a, style, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Button({ title, onPress, variant = 'primary', disabled }: {
  title: string; onPress: () => void; variant?: 'primary' | 'ghost'; disabled?: boolean;
}) {
  const { colors } = useTheme();
  const primary = variant === 'primary';
  return (
    <Tap onPress={onPress} label={title} disabled={disabled} style={{
      height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
      backgroundColor: primary ? colors.brand : 'transparent', borderWidth: primary ? 0 : 1, borderColor: colors.border,
    }}>
      <Text style={{ color: primary ? colors.onBrand : colors.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 }}>{title}</Text>
    </Tap>
  );
}

/** Pulsing placeholder. Pulse is skipped when the OS asks for reduced motion. */
export function Skeleton({ w, h, r = 8, style }: { w?: number | `${number}%`; h: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => { if (!reduce) o.value = withRepeat(withSequence(withTiming(0.45, { duration: 800 }), withTiming(1, { duration: 800 })), -1); }, [reduce, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: w ?? '100%', height: h, borderRadius: r, backgroundColor: colors.skeleton }, a, style]} />;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>{children}</Text>;
}

export function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}
