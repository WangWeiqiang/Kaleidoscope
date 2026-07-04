import React, { useMemo } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  Circle,
  Group,
  Path,
  RadialGradient,
  Skia,
  vec,
} from '@shopify/react-native-skia';

import { theme } from '@/theme';
import type { Drive } from '@/hooks/useDrive';

interface Props {
  size: number;
  drive: Drive;
  enabled: boolean;
}

const MAX_SPIN = 14; // rad/s clamp

/** A weighty rotary dial. Fling it to spin the chamber; it coasts on release. */
export function RotaryKnob({ size, drive, enabled }: Props) {
  const r = size / 2;

  // knurled tick marks around the rim
  const ticks = useMemo(() => {
    const p = Skia.Path.Make();
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const inner = r - 14;
      const outer = r - 6;
      p.moveTo(r + inner * Math.cos(a), r + inner * Math.sin(a));
      p.lineTo(r + outer * Math.cos(a), r + outer * Math.sin(a));
    }
    return p;
  }, [r]);

  // gesture state
  const prevAngle = useSharedValue(0);
  const prevT = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .onStart((e) => {
      'worklet';
      prevAngle.value = Math.atan2(e.y - r, e.x - r);
      prevT.value = Date.now();
    })
    .onUpdate((e) => {
      'worklet';
      const ang = Math.atan2(e.y - r, e.x - r);
      let d = ang - prevAngle.value;
      // shortest signed angular delta
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const now = Date.now();
      const dt = Math.max((now - prevT.value) / 1000, 1 / 240);
      let vel = d / dt;
      if (vel > MAX_SPIN) vel = MAX_SPIN;
      if (vel < -MAX_SPIN) vel = -MAX_SPIN;
      drive.spin.value = vel;
      prevAngle.value = ang;
      prevT.value = now;
    });

  // knob graphic shares the chamber rotation so dial and pattern move together
  const dialStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${drive.rotation.value}rad` }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ width: size, height: size }, dialStyle]}>
        <Canvas style={{ width: size, height: size }}>
          {/* body */}
          <Circle cx={r} cy={r} r={r - 2}>
            <RadialGradient
              c={vec(r * 0.75, r * 0.7)}
              r={r * 1.4}
              colors={['#23262f', '#0e0f15', '#05060a']}
            />
          </Circle>
          {/* rim highlight */}
          <Circle
            cx={r}
            cy={r}
            r={r - 2}
            style="stroke"
            strokeWidth={2}
            color={theme.colors.knobRim}
          />
          {/* knurling */}
          <Path
            path={ticks}
            style="stroke"
            strokeWidth={1.4}
            color="rgba(255,255,255,0.16)"
          />
          {/* inner face */}
          <Circle cx={r} cy={r} r={r - 22}>
            <RadialGradient
              c={vec(r * 0.8, r * 0.75)}
              r={r}
              colors={['#191b24', '#0b0c12']}
            />
          </Circle>
          {/* grip indicator */}
          <Group>
            <Circle
              cx={r}
              cy={20}
              r={6}
              color={theme.colors.accent}
            />
            <Circle cx={r} cy={20} r={11} style="stroke" strokeWidth={2} color={theme.colors.accentGlow} />
          </Group>
          {/* center cap */}
          <Circle cx={r} cy={r} r={9} color="#2a2d39" />
          <Circle cx={r} cy={r} r={9} style="stroke" strokeWidth={1} color="rgba(255,255,255,0.18)" />
        </Canvas>
      </Animated.View>
    </GestureDetector>
  );
}
