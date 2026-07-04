import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Fill,
  ImageShader,
  Shader,
  Skia,
  useImage,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';

import { KALEIDOSCOPE_SKSL } from '@/shaders/kaleidoscope';
import { ATLAS_SIZE, FRAGMENT_ATLAS } from '@/fragments/catalog';
import { useKaleidoscope } from '@/state/store';
import { usePhysics } from '@/hooks/usePhysics';
import type { Drive } from '@/hooks/useDrive';

const compiled = Skia.RuntimeEffect.Make(KALEIDOSCOPE_SKSL);
if (!compiled) throw new Error('Failed to compile kaleidoscope shader');
const effect = compiled;

interface Props {
  size: number;
  drive: Drive;
}

export function KaleidoscopeCanvas({ size, drive }: Props) {
  const mirrors = useKaleidoscope((s) => s.mirrors);
  const fragments = useKaleidoscope((s) => s.fragments);

  const atlas = useImage(FRAGMENT_ATLAS);
  const cell = usePhysics(fragments, mirrors, drive);

  const uniforms = useDerivedValue(() => ({
    u_resolution: [size, size],
    u_mirrors: mirrors,
    u_rotation: drive.rotation.value,
    u_count: cell.value.count,
    u_atlasSize: [ATLAS_SIZE.width, ATLAS_SIZE.height],
    u_fpos: cell.value.fpos,
    u_fuv: cell.value.fuv,
    u_fflip: cell.value.fflip,
  }));

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <Canvas style={{ width: size, height: size }}>
        <Fill>
          <Shader source={effect} uniforms={uniforms}>
            {atlas ? (
              <ImageShader
                image={atlas}
                tx="decal"
                ty="decal"
                fm="linear"
                mm="none"
              />
            ) : null}
          </Shader>
        </Fill>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#b69cff',
    shadowOpacity: 0.35,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
});
