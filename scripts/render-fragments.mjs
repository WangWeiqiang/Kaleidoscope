// Validates the compositing kaleidoscope shader with the real atlas: places a
// handful of fragments and renders a contact sheet across mirror counts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'preview');
mkdirSync(OUT, { recursive: true });

const MAX = 32;
const TAU = Math.PI * 2;

const src = readFileSync(join(__dirname, '..', 'src', 'shaders', 'kaleidoscope.ts'), 'utf8');
const sksl = src
  .match(/KALEIDOSCOPE_SKSL\s*=\s*`([\s\S]*?)`/)[1]
  .replace(/\$\{MAX_FRAGMENTS\}/g, String(MAX));
const cat = JSON.parse(readFileSync(join(__dirname, '..', 'assets', 'fragments', 'catalog.json'), 'utf8'));
const items = cat.categories.flatMap((c) => c.items);
const atlasSize = cat.atlas;

const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js');
const CanvasKit = await CanvasKitInit({
  locateFile: (f) => join(__dirname, '..', 'node_modules', 'canvaskit-wasm', 'bin', f),
});
const effect = CanvasKit.RuntimeEffect.Make(sksl, (e) => { throw new Error('SkSL: ' + e); });
console.log('✅ shader compiled');

const atlasImg = CanvasKit.MakeImageFromEncoded(
  readFileSync(join(__dirname, '..', 'assets', 'fragments', 'atlas.png')),
);
const atlasShader = atlasImg.makeShaderOptions(
  CanvasKit.TileMode.Decal, CanvasKit.TileMode.Decal,
  CanvasKit.FilterMode.Linear, CanvasKit.MipmapMode.None,
);

// deterministic pile of fragments folded into the wedge
function buildFragments(mirrors, n, seed) {
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const seg = TAU / mirrors;
  const fpos = new Array(MAX * 4).fill(0);
  const fuv = new Array(MAX * 4).fill(0);
  const fflip = new Array(MAX).fill(0);
  for (let i = 0; i < n; i++) {
    const it = items[Math.floor(rnd() * items.length)];
    const ang = rnd() * TAU;
    const rad = 0.12 + rnd() * 0.8;
    const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
    const la = ((Math.atan2(y, x) % seg) + seg) % seg;
    const af = la > seg / 2 ? seg - la : la;
    const flip = la > seg / 2 ? 1 : 0;
    fpos[i * 4 + 0] = Math.cos(af) * rad;
    fpos[i * 4 + 1] = Math.sin(af) * rad;
    fpos[i * 4 + 2] = rnd() * TAU;
    fpos[i * 4 + 3] = 0.16 + 0.10 * (it.size || 1);
    fuv[i * 4 + 0] = it.uv[0];
    fuv[i * 4 + 1] = it.uv[1];
    fuv[i * 4 + 2] = it.uv[2];
    fuv[i * 4 + 3] = it.uv[3];
    fflip[i] = flip;
  }
  return { fpos, fuv, fflip, count: n };
}

const SIZE = 460;
function render(mirrors, n, seed) {
  const { fpos, fuv, fflip, count } = buildFragments(mirrors, n, seed);
  const uniforms = [
    SIZE, SIZE,            // u_resolution
    mirrors,               // u_mirrors
    0.3,                   // u_rotation
    count,                 // u_count
    atlasSize.width, atlasSize.height, // u_atlasSize
    ...fpos, ...fuv, ...fflip,
  ];
  const shader = effect.makeShaderWithChildren(uniforms, [atlasShader]);
  const surface = CanvasKit.MakeSurface(SIZE, SIZE);
  const canvas = surface.getCanvas();
  canvas.clear(CanvasKit.Color(5, 6, 10, 255));
  const paint = new CanvasKit.Paint();
  paint.setShader(shader);
  canvas.drawRect(CanvasKit.LTRBRect(0, 0, SIZE, SIZE), paint);
  surface.flush();
  const img = surface.makeImageSnapshot();
  const bytes = img.encodeToBytes(CanvasKit.ImageFormat.PNG, 95);
  shader.delete(); paint.delete(); img.delete(); surface.delete();
  return Buffer.from(bytes);
}

const cols = [3, 4, 5, 6, 8];
const W = SIZE * cols.length;
const surface = CanvasKit.MakeSurface(W, SIZE);
const canvas = surface.getCanvas();
canvas.clear(CanvasKit.Color(5, 6, 10, 255));
cols.forEach((m, i) => {
  const png = render(m, 14, 7 + i);
  const img = CanvasKit.MakeImageFromEncoded(png);
  canvas.drawImage(img, i * SIZE, 0);
  img.delete();
});
surface.flush();
const sheet = surface.makeImageSnapshot();
writeFileSync(join(OUT, 'fragments-sheet.png'), Buffer.from(sheet.encodeToBytes(CanvasKit.ImageFormat.PNG, 95)));
console.log('wrote preview/fragments-sheet.png');
process.exit(0);
