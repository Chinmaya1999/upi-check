import React from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { contrastOn, formatINR, type Dashboard } from '@upi/core';
import { AnimatedAmount } from './AnimatedAmount';
import { radius, useTheme } from '../theme';

/** A soft glowing orb that drifts slowly — gives the hero a living, aurora feel. */
function Orb({ size, color, style, dx, dy, ms, animate }: { size: number; color: string; style: object; dx: number; dy: number; ms: number; animate: boolean }) {
  const reduce = useReducedMotion() || !animate;
  const t = useSharedValue(0);
  React.useEffect(() => { if (!reduce) t.value = withRepeat(withSequence(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: ms, easing: Easing.inOut(Easing.sin) })), -1); }, [reduce, ms, t]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: dx * t.value }, { translateY: dy * t.value }, { scale: 1 + 0.15 * t.value }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style, a]} />;
}

/** The hero banner: "You spent ₹X today." Drawn four ways depending on the active design (gradient card, flat colour card, bare poster type, payment card). */
export function ExpenseBanner({ d }: { d: Dashboard }) {
  const { design, motion, colors } = useTheme();
  const reduce = useReducedMotion() || motion.enterMs === 0;
  const kind = design.heroStyle;
  const spent = d.today.expensePaise;
  const pct = d.changeVsYesterdayPct;
  const up = (pct ?? 0) > 0;

  const compare =
    pct === null
      ? d.yesterday.expensePaise === 0 ? 'No spending yesterday to compare' : ''
      : pct === 0 ? 'Same as yesterday'
      : `${Math.abs(pct)}% ${up ? 'more' : 'less'} than yesterday`;

  // Text colours follow whatever the banner is drawn on.
  const solidBg = design.hero.colors[1];
  const fg = kind === 'poster' ? colors.text : kind === 'solid' ? contrastOn(solidBg) : '#FFFFFF';
  const light = fg === '#FFFFFF';
  const soft = kind === 'poster' ? colors.textMuted : light ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.62)';
  const chip = kind === 'poster' ? colors.cardAlt : light ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
  const big = kind === 'poster' ? 60 : 44;

  const content = (
    <>
      {kind === 'card' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <View style={{ width: 40, height: 30, borderRadius: 6, backgroundColor: '#E8C766', opacity: 0.95 }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 14, height: 1.5, backgroundColor: 'rgba(0,0,0,0.25)' }} />
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: 18, width: 1.5, backgroundColor: 'rgba(0,0,0,0.25)' }} />
          </View>
          <Text style={{ color: soft, fontSize: 12, fontWeight: '800', letterSpacing: 3 }}>PAISA</Text>
        </View>
      )}
      <Text style={{ color: soft, fontSize: 14, fontWeight: '600', letterSpacing: kind === 'card' ? 1 : 0 }}>
        {spent === 0 ? 'No spending today' : kind === 'card' ? 'SPENT TODAY' : 'You spent'}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
        <AnimatedAmount paise={spent} style={{ color: fg, fontSize: big, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] }} />
        {kind !== 'card' && <Text style={{ color: soft, fontSize: kind === 'poster' ? 20 : 18, fontWeight: '600', marginLeft: 8 }}>today.</Text>}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: kind === 'card' ? 18 : 16, flexWrap: 'wrap' }}>
        {!!compare && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: chip, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99 }}>
            {pct !== null && pct !== 0 && <Ionicons name={up ? 'trending-up' : 'trending-down'} size={15} color={light ? (up ? '#FFA8A8' : '#63E6BE') : up ? colors.expense : colors.income} />}
            <Text style={{ color: fg, fontSize: 12.5, fontWeight: '600' }}>{compare}</Text>
          </View>
        )}
        {d.budget && (
          <View style={{ backgroundColor: chip, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99 }}>
            <Text style={{ color: fg, fontSize: 12.5, fontWeight: '600' }}>
              {d.budget.remainingPaise >= 0 ? `${formatINR(d.budget.remainingPaise)} left this month` : `${formatINR(-d.budget.remainingPaise)} over budget`}
            </Text>
          </View>
        )}
      </View>
      {d.today.pendingDebitPaise > 0 && (
        <Text style={{ color: soft, fontSize: 12, marginTop: 12 }}>+ {formatINR(d.today.pendingDebitPaise)} pending, not included above</Text>
      )}
    </>
  );
  const enter = reduce ? undefined : FadeInDown.duration(motion.enterMs + 150).springify().damping(motion.damping);

  if (kind === 'poster') {
    return <Animated.View entering={enter} style={{ paddingVertical: 8 }}>{content}</Animated.View>;
  }
  if (kind === 'solid') {
    const brutal = design.cardStyle === 'brutal';
    return (
      <Animated.View entering={enter} style={{ backgroundColor: solidBg, borderRadius: radius.lg + 4, padding: 22, borderWidth: brutal ? 2 : 0, borderColor: colors.text,
        shadowColor: colors.text, shadowOpacity: brutal ? 1 : 0, shadowRadius: 0, shadowOffset: { width: 4, height: 4 } }}>{content}</Animated.View>
    );
  }
  return (
    <Animated.View entering={enter}>
      <LinearGradient colors={design.hero.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.lg + 4, padding: 22, overflow: 'hidden', minHeight: kind === 'card' ? 200 : undefined }}>
        <Orb size={190} color={design.hero.orbs[0]} style={{ right: -60, top: -60 }} dx={-26} dy={22} ms={4200} animate={motion.orbs} />
        <Orb size={140} color={design.hero.orbs[1]} style={{ left: -40, bottom: -50 }} dx={30} dy={-18} ms={5200} animate={motion.orbs} />
        <Orb size={70} color={design.hero.orbs[2]} style={{ right: 60, bottom: 20 }} dx={-14} dy={-20} ms={3600} animate={motion.orbs} />
        {content}
      </LinearGradient>
    </Animated.View>
  );
}
