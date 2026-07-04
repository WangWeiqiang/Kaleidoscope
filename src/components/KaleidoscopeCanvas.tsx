import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Fill,
  Group,
  ImageShader,
  Paint,
  RuntimeShader,
  Shader,
  Skia,
  useImage,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';

import { CELL_SKSL, VIEW_SKSL } from '@/shaders/kaleidoscope';
import { FRAGMENT_ATLAS, FRAGMENT_ATLAS_MAT } from '@/fragments/catalog';
import { useKaleidoscope } from '@/state/store';
import { usePhysics } from '@/hooks/usePhysics';
import type { Drive } from '@/hooks/useDrive';

const compiledCell = Skia.RuntimeEffect.Make(CELL_SKSL);
if (!compiledCell) throw new Error('Failed to compile cell shader');
const cellEffect = compiledCell;
const compiledView = Skia.RuntimeEffect.Make(VIEW_SKSL);
if (!compiledView) throw new Error('Failed to compile view shader');
const viewEffect = compiledView;

// Azimuth of the (world-fixed) key light shining into the object cell.
const LIGHT_AZIMUTH = 2.2;

interface Props {
  size: number;
  drive: Drive;
}

/**
 * Two-pass optical pipeline, matching the real instrument:
 *  1. the object cell — the fragment pile, lit and composited in linear light —
 *     is drawn unfolded, then
 *  2. a layer image filter plays the part of the mirror tube and eyepiece:
 *     folding, per-bounce mirror attenuation, chromatic aberration, edge
 *     defocus, seams, vignette and tone mapping.
 */
export function KaleidoscopeCanvas({ size, drive }: Props) {
  const mirrors = useKaleidoscope((s) => s.mirrors);
  const chamber = useKaleidoscope((s) => s.chamber);
  const fragments = useKaleidoscope((s) => s.fragments);

  const atlas = useImage(FRAGMENT_ATLAS);
  const matAtlas = useImage(FRAGMENT_ATLAS_MAT);
  const cell = usePhysics(fragments, drive, chamber);

  const cellUniforms = useDerivedValue(() => ({
    u_resolution: [size, size],
    u_count: cell.value.count,
    // the key light is fixed in the world, so it counter-rotates in the
    // chamber frame — highlights sweep across the shards as the tube turns
    u_lightRot: LIGHT_AZIMUTH - drive.rotation.value,
    u_fpos: cell.value.fpos,
    u_fuv: cell.value.fuv,
    u_fmat: cell.value.fmat,
  }));

  // NOTE: the layer image filter runs in dp (the density CTM is applied when
  // the layer is composited), so this resolution must match the pass-1 one.
  const viewUniforms = useDerivedValue(() => ({
    u_resolution: [size, size],
    u_mirrors: mirrors,
    u_rotation: drive.rotation.value,
  }));

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <Canvas style={{ width: size, height: size }}>
        {atlas && matAtlas ? (
          <Group
            layer={
              <Paint>
                <RuntimeShader source={viewEffect} uniforms={viewUniforms} />
              </Paint>
            }
          >
            <Fill>
              <Shader source={cellEffect} uniforms={cellUniforms}>
                <ImageShader image={atlas} tx="decal" ty="decal" fm="linear" mm="none" />
                <ImageShader image={matAtlas} tx="decal" ty="decal" fm="linear" mm="none" />
              </Shader>
            </Fill>
          </Group>
        ) : null}
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
