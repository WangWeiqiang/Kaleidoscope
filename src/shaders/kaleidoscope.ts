/**
 * Kaleidoscope compositing shader (SkSL).
 *
 * The object cell is a loose pile of real fragment sprites (PNG art packed into
 * one atlas image). Their positions/rotations come from a gravity simulation and
 * are passed in as uniform arrays — already folded into the fundamental mirror
 * wedge on the CPU. This shader:
 *   1. folds each screen pixel into the fundamental wedge of an N-mirror chamber
 *      (dihedral D_N reflection — the path the light takes), then
 *   2. composites every fragment sprite that covers that wedge point, sampling
 *      its sub-rectangle from the atlas.
 * Because both the pixel and the fragments live in the same folded wedge space,
 * each fragment is reflected into all 2N sectors automatically — a true mirror
 * kaleidoscope of the user's own materials.
 */
export const MAX_FRAGMENTS = 32;

export const KALEIDOSCOPE_SKSL = `
uniform float2 u_resolution;        // canvas size (square, px)
uniform float  u_mirrors;           // mirror count (3,4,5,6,8)
uniform float  u_rotation;          // chamber view rotation (radians)
uniform float  u_count;             // number of active fragments
uniform float2 u_atlasSize;         // atlas image size (px)
uniform float4 u_fpos[${MAX_FRAGMENTS}];  // x,y (wedge space), angle, size
uniform float4 u_fuv[${MAX_FRAGMENTS}];   // atlas rect: x,y,w,h (px)
uniform float  u_fflip[${MAX_FRAGMENTS}]; // 1 = mirror the sprite (odd reflection)
uniform shader u_atlas;             // the packed fragment atlas

const float TAU = 6.28318530718;
const float OBJ = 1.43;             // maps fold radius (~0.7) to disc radius ~1

half4 main(float2 fragCoord) {
  float2 uv = (fragCoord - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float radius = length(uv);

  // Fold the pixel into the fundamental wedge of the dihedral group D_N.
  float a = atan(uv.y, uv.x) + u_rotation;
  float r = length(uv);
  float seg = TAU / u_mirrors;
  float la = mod(a, seg);
  float af = la > seg * 0.5 ? seg - la : la;     // [0, seg/2]
  float2 p = float2(cos(af), sin(af)) * r * OBJ; // object-cell coordinate

  // Composite fragments back-to-front (later additions sit on top).
  half3 col = half3(0.02, 0.025, 0.04);          // dark chamber background
  for (int i = 0; i < ${MAX_FRAGMENTS}; i++) {
    if (float(i) >= u_count) break;
    float4 fp = u_fpos[i];
    float sz = fp.w;
    if (sz <= 0.0) continue;
    float2 d = p - fp.xy;
    float c = cos(-fp.z), s = sin(-fp.z);
    float2 l = float2(c * d.x - s * d.y, s * d.x + c * d.y) / sz;
    if (abs(l.x) < 0.5 && abs(l.y) < 0.5) {
      float2 q = l + 0.5;
      if (u_fflip[i] > 0.5) q.x = 1.0 - q.x;
      float4 rect = u_fuv[i];
      float2 ac = rect.xy + q * rect.zw;
      half4 tex = u_atlas.eval(ac);
      col = mix(col, tex.rgb, tex.a);
    }
  }

  // Faint mirror seams along the wedge edges.
  float seamA = min(la, seg - la);
  float seam = smoothstep(0.012, 0.0, seamA * r);
  col += half3(half(seam)) * half3(0.10, 0.10, 0.12);

  // Circular aperture (looking down the tube) + polished rim + vignette.
  float aperture = smoothstep(0.5, 0.487, radius);
  float rim = smoothstep(0.5, 0.47, radius) - smoothstep(0.47, 0.41, radius);
  col += half3(0.26, 0.25, 0.30) * half(rim) * 0.7;
  col *= half(mix(0.82, 1.0, smoothstep(0.5, 0.12, radius)));

  return half4(col * half(aperture), half(aperture));
}
`;

/** Selectable mirror chambers. value = polygon sides → N-fold symmetry. */
export const MIRROR_OPTIONS = [
  { sides: 3, label: '三角', en: 'Triangle' },
  { sides: 4, label: '四角', en: 'Square' },
  { sides: 5, label: '五角', en: 'Pentagon' },
  { sides: 6, label: '六角', en: 'Hexagon' },
  { sides: 8, label: '八角', en: 'Octagon' },
] as const;
