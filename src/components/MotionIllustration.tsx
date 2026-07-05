import React, { useEffect, useMemo } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Canvas, Circle, Path, RoundedRect, Skia } from '@shopify/react-native-skia';

import { theme } from '@/theme';

interface Props {
  kind: 'tilt' | 'shake';
  size: number;
}

/**
 * Line-art instruction diagrams for the sensor drive modes, gently animated so
 * they read as "do this with your phone":
 *  · tilt  — a phone with a circular arrow, slowly rocking back and forth
 *  · shake — a phone between speed arcs, jittering side to side
 */
export function MotionIllustration({ kind, size }: Props) {
  const S = size;
  const c = S / 2;
  const phoneW = S * 0.3;
  const phoneH = S * 0.54;

  // --- looping hint animation -------------------------------------------------
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    if (kind === 'tilt') {
      t.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(-1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      );
    } else {
      t.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 110 }),
          withTiming(-1, { duration: 110 }),
          withTiming(1, { duration: 110 }),
          withTiming(-1, { duration: 110 }),
          withTiming(0, { duration: 140 }),
          withTiming(0, { duration: 620 }), // pause between shake bursts
        ),
        -1,
        false,
      );
    }
  }, [kind, t]);

  const wiggle = useAnimatedStyle(() =>
    kind === 'tilt'
      ? { transform: [{ rotate: `${t.value * 0.3}rad` }] }
      : { transform: [{ translateX: t.value * S * 0.045 }] },
  );

  // --- static line art ----------------------------------------------------------
  const arrow = useMemo(() => {
    const p = Skia.Path.Make();
    if (kind === 'tilt') {
      // circular arrow around the phone
      const R = S * 0.42;
      p.addArc({ x: c - R, y: c - R, width: 2 * R, height: 2 * R }, -150, 240);
      // arrowhead at the arc end (90° = ends pointing along the tangent)
      const end = ((-150 + 240) * Math.PI) / 180;
      const ex = c + R * Math.cos(end);
      const ey = c + R * Math.sin(end);
      const tx = -Math.sin(end); // tangent (sweep direction)
      const ty = Math.cos(end);
      const a = S * 0.055;
      p.moveTo(ex + tx * a, ey + ty * a);
      p.lineTo(ex - Math.cos(end) * a * 0.8, ey - Math.sin(end) * a * 0.8);
      p.moveTo(ex + tx * a, ey + ty * a);
      p.lineTo(ex + Math.cos(end) * a * 0.8, ey + Math.sin(end) * a * 0.8);
    } else {
      // speed arcs on both sides of the phone
      for (let i = 0; i < 3; i++) {
        const R = S * (0.26 + i * 0.075);
        p.addArc({ x: c - R, y: c - R, width: 2 * R, height: 2 * R }, 155, 50);
        p.addArc({ x: c - R, y: c - R, width: 2 * R, height: 2 * R }, -25, 50);
      }
    }
    return p;
  }, [kind, S, c]);

  const stroke = 'rgba(255,255,255,0.72)';

  return (
    <Animated.View style={[{ width: S, height: S }, wiggle]}>
      <Canvas style={{ width: S, height: S }}>
        {/* phone body */}
        <RoundedRect
          x={c - phoneW / 2}
          y={c - phoneH / 2}
          width={phoneW}
          height={phoneH}
          r={S * 0.05}
          style="stroke"
          strokeWidth={3}
          color={stroke}
        />
        {/* screen */}
        <RoundedRect
          x={c - phoneW / 2 + S * 0.025}
          y={c - phoneH / 2 + S * 0.045}
          width={phoneW - S * 0.05}
          height={phoneH - S * 0.09}
          r={S * 0.02}
          style="stroke"
          strokeWidth={1.5}
          color="rgba(255,255,255,0.25)"
        />
        {/* camera dot */}
        <Circle cx={c} cy={c - phoneH / 2 + S * 0.028} r={S * 0.012} color={stroke} />
        {/* motion arrows / arcs */}
        <Path
          path={arrow}
          style="stroke"
          strokeWidth={3}
          strokeCap="round"
          color={theme.colors.accent}
        />
      </Canvas>
    </Animated.View>
  );
}
