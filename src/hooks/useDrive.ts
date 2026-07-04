import { useEffect } from 'react';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { DriveMode } from '@/state/store';

const FRICTION = 1.2;     // knob spin decay per second (coasts, then stops)
const STOP_EPS = 0.02;    // below this angular speed we consider it stopped
const CHURN_GAIN = 2.2;   // how fast motion rearranges the fragments
const SENSOR_HZ = 60;

export interface Drive {
  /** Rigid chamber rotation in radians (drives the mirror fold). */
  rotation: SharedValue<number>;
  /** Angular velocity of the chamber (rad/s) — write to it from the knob. */
  spin: SharedValue<number>;
  /** Accumulated motion → fragment rearrangement. Frozen when device is still. */
  churn: SharedValue<number>;
}

/**
 * Owns the animated quantities that feed the shader. The kaleidoscope is STATIC
 * unless the user drives it — there is no idle animation. Motion (knob fling,
 * phone rotation, or shaking) both rotates the chamber and advances `churn`,
 * which tumbles the fragments into a new arrangement; when motion stops, the
 * image freezes, exactly like a real kaleidoscope held still.
 *
 *  - knob  : fling the dial; it coasts down with friction, then stops.
 *  - tilt  : gyroscope — rotating the phone spins the chamber and churns.
 *  - shake : accelerometer — shaking only churns (tumbles the fragments).
 */
export function useDrive(mode: DriveMode): Drive {
  const rotation = useSharedValue(0);
  const spin = useSharedValue(0);
  const churn = useSharedValue(0);

  // Knob momentum integration on the UI thread.
  useFrameCallback((info) => {
    'worklet';
    if (mode !== 'knob') return;
    const dt = Math.min((info.timeSincePreviousFrame ?? 16) / 1000, 0.05);
    if (Math.abs(spin.value) < STOP_EPS) {
      spin.value = 0; // fully stopped → image freezes
      return;
    }
    rotation.value += spin.value * dt;
    churn.value += Math.abs(spin.value) * dt * CHURN_GAIN;
    spin.value *= Math.exp(-FRICTION * dt); // coast down
  }, true);

  // Sensor subscriptions (JS thread → shared values).
  useEffect(() => {
    if (mode === 'knob') return;

    let sub: { remove: () => void } | undefined;

    // Deadzones below sensor noise so a still device gives a perfectly frozen
    // image (a real kaleidoscope at rest does not move).
    const GYRO_DEADZONE = 0.06;  // rad/s
    const ACCEL_DEADZONE = 0.06; // g above the 1g baseline

    if (mode === 'tilt') {
      Gyroscope.setUpdateInterval(1000 / SENSOR_HZ);
      sub = Gyroscope.addListener(({ x, y, z }) => {
        const dt = 1 / SENSOR_HZ;
        const motion = Math.abs(x) + Math.abs(y) + Math.abs(z);
        if (motion < GYRO_DEADZONE) return;             // held still → frozen
        rotation.value += z * dt;                       // spin the chamber
        churn.value += motion * dt * CHURN_GAIN;        // tumble fragments
      });
    } else if (mode === 'shake') {
      Accelerometer.setUpdateInterval(1000 / SENSOR_HZ);
      sub = Accelerometer.addListener(({ x, y, z }) => {
        const dt = 1 / SENSOR_HZ;
        const energy = Math.sqrt(x * x + y * y + z * z) - 1; // subtract gravity
        if (Math.abs(energy) < ACCEL_DEADZONE) return;  // held still → frozen
        churn.value += Math.abs(energy) * dt * CHURN_GAIN * 4.0;
      });
    }

    return () => sub?.remove();
  }, [mode, rotation, churn]);

  return { rotation, spin, churn };
}
