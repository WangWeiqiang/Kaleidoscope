import React, { useMemo } from 'react';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';

interface Props {
  sides: number;
  size: number;
  color: string;
  fill?: string;
  strokeWidth?: number;
}

/** A crisp regular-polygon outline used as the mirror-count glyph. */
export function PolygonGlyph({
  sides,
  size,
  color,
  fill,
  strokeWidth = 2,
}: Props) {
  const path = useMemo(() => {
    const p = Skia.Path.Make();
    const c = size / 2;
    const r = size / 2 - strokeWidth;
    // point upward
    const start = -Math.PI / 2;
    for (let i = 0; i < sides; i++) {
      const a = start + (i / sides) * Math.PI * 2;
      const x = c + r * Math.cos(a);
      const y = c + r * Math.sin(a);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.close();
    return p;
  }, [sides, size, strokeWidth]);

  return (
    <Canvas style={{ width: size, height: size }}>
      {fill ? <Path path={path} color={fill} style="fill" /> : null}
      <Path
        path={path}
        color={color}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeJoin="round"
      />
    </Canvas>
  );
}
