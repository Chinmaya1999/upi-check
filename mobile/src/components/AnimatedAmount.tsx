import React, { useEffect, useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import { Easing, useAnimatedReaction, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { formatINR } from '@upi/core';

/** Count-up for a paise value. Skips animation when reduced motion is on. */
export function AnimatedAmount({ paise, style, duration = 900 }: { paise: number; style?: TextStyle; duration?: number }) {
  const reduce = useReducedMotion();
  const v = useSharedValue(reduce ? paise : 0);
  const [shown, setShown] = useState(reduce ? paise : 0);

  useEffect(() => {
    v.value = reduce ? paise : withTiming(paise, { duration, easing: Easing.out(Easing.cubic) });
  }, [paise, reduce, duration, v]);

  useAnimatedReaction(
    () => Math.round(v.value), // exact paise: the count-up lands on the real amount, never a rounded one
    (cur, prev) => { if (cur !== prev) scheduleOnRN(setShown, cur); },
  );

  return (
    <Text style={style} accessibilityLabel={formatINR(paise)} accessibilityRole="text">
      {formatINR(shown)}
    </Text>
  );
}
