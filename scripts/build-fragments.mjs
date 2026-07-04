// Scans assets/fragments/<category>/*.png and generates:
//   - assets/fragments/atlas.png      (all fragments packed into one image)
//   - assets/fragments/atlas-mat.png  (baked material atlas: RG=normal, B=thickness)
//   - src/fragments/catalog.ts        (typed catalog + atlas UVs + require maps)
//   - assets/fragments/catalog.json   (human-readable reference)
//
// The material atlas is baked from each sprite's alpha silhouette (bevelled
// height field → normals + thickness) plus a micro-normal from the colour
// texture, so the lighting pass can shade glass/metal/paper convincingly.
//
// Run after adding/removing fragment PNGs:  npm run fragments
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'assets', 'fragments');
const OUT_TS = join(__dirname, '..', 'src', 'fragments', 'catalog.ts');
const CELL = 200; // atlas cell size in px

const categories = JSON.parse(readFileSync(join(ROOT, 'categories.json'), 'utf8'));
const overrides = existsSync(join(ROOT, 'labels.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'labels.json'), 'utf8'))
  : {};
// opacity: glass = absorption depth (higher = deeper colour), others = coverage
const DEFAULT_OPACITY = { glass: 0.82, paper: 1.0, metal: 1.0, plastic: 1.0 };
// physical density → how the pile stacks and falls
const DEFAULT_WEIGHT = { glass: 1.0, paper: 0.4, metal: 1.35, plastic: 0.7 };
// material index consumed by the lighting shader
const MAT_TYPE = { glass: 0, paper: 1, metal: 2, plastic: 3 };
const prettify = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ---- collect items ----
const catalog = [];
const flat = []; // {item, abspath}
for (const cat of categories) {
  const dir = join(ROOT, cat.id);
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')).sort();
  const items = files.map((file) => {
    const name = file.replace(/\.png$/i, '');
    const id = `${cat.id}-${name}`;
    const rel = `${cat.id}/${file}`;
    const ov = overrides[id] || {};
    const item = {
      id, catId: cat.id,
      label: ov.label ?? prettify(name),
      file: rel,
      size: ov.size ?? 1.0,
      opacity: ov.opacity ?? DEFAULT_OPACITY[cat.id] ?? 1.0,
      weight: ov.weight ?? DEFAULT_WEIGHT[cat.id] ?? 1.0,
      matType: MAT_TYPE[cat.id] ?? 3,
      uv: [0, 0, CELL, CELL], // filled in below
    };
    flat.push({ item, abspath: join(dir, file) });
    return item;
  });
  catalog.push({ id: cat.id, label: cat.label, en: cat.en, items });
}
const total = flat.length;

// ---- pack into an atlas with CanvasKit ----
const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
const rows = Math.max(1, Math.ceil(total / cols));
const atlasW = cols * CELL;
const atlasH = rows * CELL;

const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js');
const CanvasKit = await CanvasKitInit({
  locateFile: (f) => join(__dirname, '..', 'node_modules', 'canvaskit-wasm', 'bin', f),
});

const surface = CanvasKit.MakeSurface(atlasW, atlasH);
const canvas = surface.getCanvas();
canvas.clear(CanvasKit.Color(0, 0, 0, 0)); // transparent
const paint = new CanvasKit.Paint();
paint.setAntiAlias(true);

// material atlas pixel buffer (RGBA, unpremultiplied; A=255 so premul is a no-op)
const matPixels = new Uint8Array(atlasW * atlasH * 4);

// --- helpers for the material bake -----------------------------------------

/** separable box blur (in place-ish) on a Float32Array field */
function boxBlur(src, w, h, radius, passes) {
  let a = src;
  let b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -radius; x <= radius; x++) acc += a[row + Math.min(Math.max(x, 0), w - 1)];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc / (2 * radius + 1);
        const xo = Math.max(x - radius, 0);
        const xi = Math.min(x + radius + 1, w - 1);
        acc += a[row + xi] - a[row + xo];
      }
    }
    // vertical
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += b[Math.min(Math.max(y, 0), h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * radius + 1);
        const yo = Math.max(y - radius, 0);
        const yi = Math.min(y + radius + 1, h - 1);
        acc += b[yi * w + x] - b[yo * w + x];
      }
    }
  }
  return a;
}

/**
 * Bake one sprite's material cell from its unpremultiplied RGBA pixels:
 * height = alpha bevelled by a wide blur (flat interior, ramped edges),
 * micro-relief from the colour texture, normals from the height gradient.
 */
function bakeMaterialCell(rgba, w, h) {
  const n = w * h;
  const alpha = new Float32Array(n);
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    alpha[i] = a;
    lum[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
  }
  const bevel = boxBlur(Float32Array.from(alpha), w, h, 7, 3);
  const lumLow = boxBlur(Float32Array.from(lum), w, h, 2, 1);

  const height = new Float32Array(n);
  for (let i = 0; i < n; i++) height[i] = alpha[i] * bevel[i];

  const out = new Uint8Array(n * 4);
  const S = 5.0;   // silhouette bevel strength
  const MS = 2.8;  // colour micro-relief strength
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xm = y * w + Math.max(x - 1, 0), xp = y * w + Math.min(x + 1, w - 1);
      const ym = Math.max(y - 1, 0) * w + x, yp = Math.min(y + 1, h - 1) * w + x;
      const gx = (height[xp] - height[xm]) * 0.5 * S + (lum[i] - lumLow[i] + (lum[xp] - lum[xm]) * 0.5) * MS;
      const gy = (height[yp] - height[ym]) * 0.5 * S + ((lum[yp] - lum[ym]) * 0.5) * MS;
      const inv = 1 / Math.hypot(gx, gy, 1);
      out[i * 4 + 0] = Math.round((-gx * inv * 0.5 + 0.5) * 255);
      out[i * 4 + 1] = Math.round((-gy * inv * 0.5 + 0.5) * 255);
      out[i * 4 + 2] = Math.round(Math.min(Math.max(height[i], 0), 1) * 255);
      out[i * 4 + 3] = 255; // opaque → premultiplication cannot corrupt RG/B
    }
  }
  return out;
}

// --- pack both atlases -------------------------------------------------------

flat.forEach(({ item, abspath }, i) => {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const x = col * CELL;
  const y = row * CELL;
  item.uv = [x, y, CELL, CELL];
  const img = CanvasKit.MakeImageFromEncoded(readFileSync(abspath));
  if (!img) return;
  const src = CanvasKit.LTRBRect(0, 0, img.width(), img.height());
  // fit into the cell with a little padding, centred
  const pad = 8;
  const dst = CanvasKit.LTRBRect(x + pad, y + pad, x + CELL - pad, y + CELL - pad);
  canvas.drawImageRect(img, src, dst, paint);

  // render the same placement standalone to bake the material cell
  const cellSurf = CanvasKit.MakeSurface(CELL, CELL);
  const cc = cellSurf.getCanvas();
  cc.clear(CanvasKit.Color(0, 0, 0, 0));
  cc.drawImageRect(img, src, CanvasKit.LTRBRect(pad, pad, CELL - pad, CELL - pad), paint);
  cellSurf.flush();
  const snap = cellSurf.makeImageSnapshot();
  const rgba = snap.readPixels(0, 0, {
    width: CELL, height: CELL,
    colorType: CanvasKit.ColorType.RGBA_8888,
    alphaType: CanvasKit.AlphaType.Unpremul,
    colorSpace: CanvasKit.ColorSpace.SRGB,
  });
  const mat = bakeMaterialCell(rgba, CELL, CELL);
  for (let yy = 0; yy < CELL; yy++) {
    const dstOff = ((y + yy) * atlasW + x) * 4;
    matPixels.set(mat.subarray(yy * CELL * 4, (yy + 1) * CELL * 4), dstOff);
  }
  snap.delete();
  cellSurf.delete();
  img.delete();
});
surface.flush();
const atlasImg = surface.makeImageSnapshot();
writeFileSync(
  join(ROOT, 'atlas.png'),
  Buffer.from(atlasImg.encodeToBytes(CanvasKit.ImageFormat.PNG, 100)),
);
atlasImg.delete();
surface.delete();
paint.delete();

const matImg = CanvasKit.MakeImage(
  {
    width: atlasW, height: atlasH,
    colorType: CanvasKit.ColorType.RGBA_8888,
    alphaType: CanvasKit.AlphaType.Unpremul,
    colorSpace: CanvasKit.ColorSpace.SRGB,
  },
  matPixels,
  atlasW * 4,
);
writeFileSync(
  join(ROOT, 'atlas-mat.png'),
  Buffer.from(matImg.encodeToBytes(CanvasKit.ImageFormat.PNG, 100)),
);
matImg.delete();

// ---- write catalog.json ----
writeFileSync(join(ROOT, 'catalog.json'), JSON.stringify({ atlas: { width: atlasW, height: atlasH }, categories: catalog }, null, 2) + '\n');

// ---- write catalog.ts ----
const thumbEntries = flat.map(({ item }) =>
  `  ${JSON.stringify(item.file)}: require('../../assets/fragments/${item.file}'),`,
);
const ts = `// AUTO-GENERATED by scripts/build-fragments.mjs — do not edit by hand.
// Run \`npm run fragments\` after changing files under assets/fragments/.
import type { ImageSourcePropType } from 'react-native';

export interface FragmentItem {
  id: string;
  catId: string;
  label: string;
  file: string;
  size: number;
  opacity: number;
  weight: number;
  /** material index for the lighting shader: 0 glass · 1 paper · 2 metal · 3 plastic */
  matType: number;
  /** atlas sub-rect in px: [x, y, w, h] */
  uv: [number, number, number, number];
}
export interface FragmentCategory {
  id: string;
  label: string;
  en: string;
  items: FragmentItem[];
}

export const ATLAS_SIZE = { width: ${atlasW}, height: ${atlasH} };

/** The packed atlas image (all fragments) — used by the kaleidoscope shader. */
export const FRAGMENT_ATLAS = require('../../assets/fragments/atlas.png');

/** Baked material atlas (RG=normal, B=thickness) — same layout as the atlas. */
export const FRAGMENT_ATLAS_MAT = require('../../assets/fragments/atlas-mat.png');

export const FRAGMENT_CATALOG: FragmentCategory[] = ${JSON.stringify(catalog, null, 2)};

/** Per-fragment images — used for thumbnails in the picker UI. */
export const FRAGMENT_THUMBS: Record<string, ImageSourcePropType> = {
${thumbEntries.join('\n')}
};

export function itemById(id: string): FragmentItem | undefined {
  for (const c of FRAGMENT_CATALOG) {
    const it = c.items.find((i) => i.id === id);
    if (it) return it;
  }
  return undefined;
}
`;
mkdirSync(dirname(OUT_TS), { recursive: true });
writeFileSync(OUT_TS, ts);

console.log(
  `Built ${catalog.length} categories, ${total} fragments.\n` +
    `  → assets/fragments/atlas.png (${atlasW}×${atlasH})\n` +
    `  → assets/fragments/atlas-mat.png\n` +
    `  → src/fragments/catalog.ts\n  → assets/fragments/catalog.json`,
);
process.exit(0);
