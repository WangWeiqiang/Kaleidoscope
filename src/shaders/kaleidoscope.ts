/**
 * Kaleidoscope optics, modelled as the real instrument — two passes:
 *
 * PASS 1 — CELL_SKSL (the object cell)
 *   Renders the loose fragment pile in plain disc space (no folding) against a
 *   backlit frosted diffuser, with a physically-motivated material response:
 *     · glass   — Beer-Lambert transmission (colours multiply and deepen with
 *                 thickness) + a sharp surface glint that travels as shards turn
 *     · paper   — translucent diffuse; the backlight glows through
 *     · metal   — opaque, blocks the backlight, tinted specular reflection
 *     · plastic — bright diffuse + white highlight, slightly translucent
 *   Normals/thickness come from a baked material atlas (see build-fragments).
 *   All compositing happens in linear light; the result is sqrt-encoded
 *   (gamma 2) so the 8-bit intermediate keeps shadow precision.
 *
 * PASS 2 — VIEW_SKSL (the mirror tube + eyepiece)
 *   Runs as a layer image filter over pass 1. For each screen pixel it applies
 *   eyepiece barrel distortion, folds the ray into the fundamental wedge of the
 *   dihedral D_N mirror system, counts the real number of mirror bounces and
 *   attenuates accordingly (first-surface mirrors still lose a little light per
 *   bounce and drift slightly cool), samples the cell texture with lateral
 *   chromatic aberration and edge defocus, darkens the mirror seams, then tone
 *   maps and vignettes through the circular aperture.
 */
export const MAX_FRAGMENTS = 32;

export const CELL_SKSL = `
uniform float2 u_resolution;        // pass-1 canvas size
uniform float  u_count;             // number of active fragments
uniform float  u_lightRot;          // key-light azimuth in the chamber frame
uniform float4 u_fpos[${MAX_FRAGMENTS}];  // x,y (disc space), angle, size
uniform float4 u_fuv[${MAX_FRAGMENTS}];   // atlas rect: x,y,w,h (px)
uniform float4 u_fmat[${MAX_FRAGMENTS}];  // material, opacity, squash, facing
uniform shader u_atlas;             // colour atlas (premultiplied)
uniform shader u_matlas;            // material atlas: RG=normal, B=thickness

const float TAU = 6.28318530718;

half4 main(float2 fragCoord) {
  float2 p = (fragCoord - 0.5 * u_resolution) / (0.5 * min(u_resolution.x, u_resolution.y));
  float r = length(p);

  // Backlit frosted diffuser: bright warm centre, gentle falloff, faint mottle
  // so the field reads as ground glass rather than a flat fill (linear light).
  float3 col = float3(1.02, 0.99, 0.94) * (0.95 - 0.38 * r * r);
  float2 hp = fragCoord * 0.017;
  col *= 1.0 + 0.016 * sin(hp.x * 3.1 + hp.y * 1.7) * sin(hp.x * 1.3 - hp.y * 2.3);

  // Key light, fixed in the world → rotates against the chamber.
  float3 L = normalize(float3(cos(u_lightRot), sin(u_lightRot), 0.62));
  float3 H = normalize(L + float3(0.0, 0.0, 1.0)); // view is straight down the tube

  for (int i = 0; i < ${MAX_FRAGMENTS}; i++) {
    if (float(i) >= u_count) break;
    float4 fp = u_fpos[i];
    float sz = fp.w;
    if (sz <= 0.0) continue;
    float4 fm = u_fmat[i];                    // x: material, y: opacity, z: squash, w: facing
    float squash = max(fm.z, 0.15);

    float2 d = p - fp.xy;
    float c = cos(-fp.z), s = sin(-fp.z);
    float2 l = float2(c * d.x - s * d.y, s * d.x + c * d.y) / sz;
    l.y /= squash;                            // 3D tumble foreshortening
    if (abs(l.x) >= 0.5 || abs(l.y) >= 0.5) continue;
    float2 q = l + 0.5;
    if (fm.w < 0.0) q.x = 1.0 - q.x;          // shard shows its back face
    float4 rect = u_fuv[i];
    float2 ac = rect.xy + q * rect.zw;

    half4 tex = u_atlas.eval(ac);
    float rawA = float(tex.a);
    if (rawA < 0.06) continue;
    // crisp coverage: soft-AA fringe pixels are cut so unpremultiplied colour
    // noise never smears a dirty halo around the shard (kept wide enough not
    // to serrate the edges of small photo sprites scaled up in the atlas)
    float a = smoothstep(0.10, 0.62, rawA);
    if (a < 0.01) continue;
    float3 albedo = clamp(float3(tex.rgb) / max(rawA, 0.25), 0.0, 1.0);
    albedo *= albedo;                         // sRGB-ish → linear (gamma 2)

    half4 m = u_matlas.eval(ac);
    float2 nl = (float2(m.rg) * 2.0 - 1.0) * 1.7; // sprite-local relief
    if (fm.w < 0.0) nl.x = -nl.x;
    // a foreshortened shard IS a tilted shard: squash = |cos tilt|, so lean
    // the face normal by the matching sine about the tumble axis — that is
    // what makes shards catch and lose the light as they turn
    float st = sqrt(max(1.0 - fm.z * fm.z, 0.0));
    nl.y += st * 1.5 * fm.w;
    // rotate the normal into the chamber frame (c,s are cos/sin of -angle)
    float2 nw = float2(c * nl.x + s * nl.y, -s * nl.x + c * nl.y);
    float th = float(m.b);                    // shard thickness 0..1
    float3 N = normalize(float3(nw, 1.0));
    float ndl = max(dot(N, L), 0.0);
    float ndh = max(dot(N, H), 0.0);
    float fres = pow(1.0 - N.z, 3.0);         // grazing-angle boost
    float edge = clamp(1.0 - squash * 1.15, 0.0, 1.0); // 1 when seen edge-on

    float mt = fm.x; // 0 glass · 1 paper · 2 metal · 3 plastic
    if (mt < 0.5) {
      // GLASS — transmission: colours multiply, thickness deepens saturation.
      float3 tint = mix(albedo, albedo.brg, 0.20 * fres); // dichroic shimmer
      float depth = (1.0 + 2.1 * th) * fm.y + edge * 1.8; // edge-on = long path
      col *= mix(float3(1.0), pow(tint, float3(depth)), a);
      // sharp glint travelling on the surface + light piping on raw edges
      float spec = pow(ndh, 110.0) * (0.5 + 0.5 * fres);
      col += float3(1.0, 0.98, 0.93) * spec * a * (1.3 + 1.8 * edge);
      col += albedo * (0.12 * edge * a);      // glowing rim of an edge-on shard
    } else if (mt < 1.5) {
      // PAPER — soft translucent diffuse; backlight bleeds through the sheet.
      float3 body = albedo * (0.30 + 0.28 * ndl) + albedo * col * 0.52;
      col = mix(col, body, a * fm.y);
    } else if (mt < 2.5) {
      // METAL — blocks the backlight; mostly a dark silhouette reflecting the
      // tube interior, until the face angle lines up and it FLASHES.
      float spec = pow(ndh, 28.0);
      float sheen = 0.08 + 1.2 * pow(ndh, 6.0);
      float3 body = albedo * sheen + (albedo * 0.6 + 0.4) * spec * 2.2;
      body += albedo * fres * 0.5;            // grazing rim light
      col = mix(col, body, a);
    } else {
      // PLASTIC — bright body colour, a hint of translucency, white highlight.
      float3 body = albedo * (0.34 + 0.30 * ndl) + albedo * col * 0.38;
      body += float3(0.85) * pow(ndh, 48.0) * (0.35 + 0.65 * fres);
      col = mix(col, body, a * min(fm.y + 0.12, 1.0));
    }
  }

  // Shallow chamber dish: the wall shades the very edge of the cell.
  col *= 1.0 - 0.45 * smoothstep(0.84, 1.02, r);

  col = clamp(col, 0.0, 4.0);
  return half4(half3(sqrt(col)), 1.0);        // gamma-2 encode for pass 2
}
`;

export const VIEW_SKSL = `
uniform float2 u_resolution;        // layer size (physical px)
uniform float  u_mirrors;           // mirror count (3,4,5,6,8)
uniform float  u_rotation;          // chamber rotation (radians)
uniform shader image;               // pass-1 object cell (sqrt-encoded)

const float TAU = 6.28318530718;
const float OBJ = 1.78;             // view radius 0.5 → cell radius ~0.95

half3 cellAt(float2 cp) {
  float m = 0.5 * min(u_resolution.x, u_resolution.y);
  half3 t = image.eval(cp * m + 0.5 * u_resolution).rgb;
  return t * t;                     // decode gamma 2 → linear
}

half4 main(float2 fragCoord) {
  float2 uv = (fragCoord - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float radius = length(uv);
  float r2 = radius * radius;

  // Eyepiece barrel distortion — straight seams bow very slightly at the edge.
  float2 uvd = uv * (1.0 + 0.30 * r2);

  // Fold into the fundamental wedge of D_N and count real mirror bounces.
  float seg = TAU / u_mirrors;
  float hw = seg * 0.5;
  float a = atan(uvd.y, uvd.x) + u_rotation;
  float am = mod(a, TAU);
  float widx = floor(am / hw);                     // wedge index 0..2N-1
  float k = min(widx, 2.0 * u_mirrors - widx);     // bounces to reach this wedge
  float la = mod(a, seg);
  float af = la > hw ? seg - la : la;
  float rr = length(uvd) * OBJ;
  // Rotating-cell scope: the mirrors and eye stay fixed while the CELL turns,
  // so the sampled wedge always looks at world-down in cell coordinates —
  // straight into the pile wherever gravity has settled it. Without this the
  // wedge is glued to a fixed cell sector and most rotations show empty glass.
  float ws = 0.5 * 3.14159265 - u_rotation - hw * 0.5;
  float2 pc = float2(cos(af + ws), sin(af + ws)) * rr;

  // Edge defocus: jitter-rotated taps melt into a soft focus. Chromatic
  // aberration is applied as a differential anchored to that soft base, so a
  // hard dark/bright edge fringes gently instead of flashing full-saturation
  // green/magenta pixels (jagged low-res sprites made raw CA speckle).
  float ca = 1.0 + 0.006 * r2;
  float blur = 0.0025 + 0.008 * smoothstep(0.30, 0.50, radius);
  float ja = fract(sin(dot(fragCoord, float2(41.717, 289.31))) * 21753.7) * TAU;
  float2 j1 = float2(cos(ja), sin(ja)) * blur;
  float2 j2 = float2(-j1.y, j1.x);
  half3 col = cellAt(pc);
  col += cellAt(pc + j1);
  col += cellAt(pc - j1);
  col += cellAt(pc + j2);
  col += cellAt(pc - j2);
  col *= 0.2;
  col.r += (cellAt(pc * ca).r - col.r) * 0.55;
  col.b += (cellAt(pc / ca).b - col.b) * 0.55;

  // Mirror attenuation: every bounce loses a little light, drifting slightly
  // cool — far wedges are visibly a touch dimmer, like a real mirror system.
  col *= pow(half3(0.945, 0.962, 0.952), half3(half(k)));

  // Mirror seams: thin DARK lines where the plates meet (never bright).
  float seamD = min(af, hw - af) * max(rr, 0.06);
  col *= 1.0 - 0.5 * half(smoothstep(0.012, 0.002, seamD));

  // Tube vignette + circular aperture with a soft edge.
  col *= half(mix(1.0, 0.55, smoothstep(0.18, 0.50, radius)));
  float ap = smoothstep(0.500, 0.486, radius);

  // Filmic-ish shoulder keeps glints glowing without clipping, then gamma.
  float3 tone = 1.0 - exp(-float3(col) * 1.5);
  half3 outc = half3(pow(tone, float3(0.4545)));

  // A breath of grain so smooth gradients never band.
  float g = fract(sin(dot(fragCoord, float2(12.9898, 78.233))) * 43758.5453);
  outc += half3((g - 0.5) * 0.010);

  return half4(outc * half(ap), half(ap));
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
