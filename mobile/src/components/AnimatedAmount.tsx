import React, { useEffect, useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import { Easing, useAnimatedReaction, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { formatINR } from '@upi/core';
import { useTheme } from '../theme';

/** Count-up for a paise value. Skips animation when reduced motion is on. */
export function AnimatedAmount({ paise, style, duration }: { paise: number; style?: TextStyle; duration?: number }) {
  const { motion } = useTheme();
  const ms = duration ?? motion.countMs;
  const reduce = useReducedMotion() || ms === 0;
  const v = useSharedValue(reduce ? paise : 0);
  const [shown, setShown] = useState(reduce ? paise : 0);

  useEffect(() => {
    v.value = reduce ? paise : withTiming(paise, { duration: ms, easing: Easing.out(Easing.cubic) });
  }, [paise, reduce, ms, v]);

  useAnimatedReaction(
    () => Math.round(v.value), // exact paise: the count-up lands on the real amount, never a rounded one
    (cur, prev) => { if (cur !== prev) scheduleOnRN(setShown, cur); },
  );

  return (
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={style} accessibilityLabel={formatINR(paise)} accessibilityRole="text">
      {formatINR(shown)}
    </Text>
  );
}
