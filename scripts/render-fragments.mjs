// Validates the two-pass optical pipeline with the real atlases: settles a
// deterministic pile of fragments, renders the lit object cell (pass 1), then
// the mirror-tube/eyepiece view (pass 2) across mirror counts.
//   → preview/fragments-sheet.png  (view pass, mirrors 3/4/5/6/8)
//   → preview/cell.png             (raw lit object cell, for material checks)
//   → preview/detail.png           (one large hexagon view)
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
const extract = (name) =>
  src.match(new RegExp(`${name}\\s*=\\s*\`([\\s\\S]*?)\``))[1].replace(/\$\{MAX_FRAGMENTS\}/g, MAX);
const cat = JSON.parse(readFileSync(join(__dirname, '..', 'assets', 'fragments', 'catalog.json'), 'utf8'));
const items = cat.categories.flatMap((c) => c.items);

const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js');
const CanvasKit = await CanvasKitInit({
  locateFile: (f) => join(__dirname, '..', 'node_modules', 'canvaskit-wasm', 'bin', f),
});
const cellEffect = CanvasKit.RuntimeEffect.Make(extract('CELL_SKSL'), (e) => { throw new Error('CELL SkSL: ' + e); });
const viewEffect = CanvasKit.RuntimeEffect.Make(extract('VIEW_SKSL'), (e) => { throw new Error('VIEW SkSL: ' + e); });
console.log('✅ both shader passes compiled');

const loadAtlas = (file) => {
  const img = CanvasKit.MakeImageFromEncoded(readFileSync(join(__dirname, '..', 'assets', 'fragments', file)));
  return img.makeShaderOptions(
    CanvasKit.TileMode.Decal, CanvasKit.TileMode.Decal,
    CanvasKit.FilterMode.Linear, CanvasKit.MipmapMode.None,
  );
};
const atlasShader = loadAtlas('atlas.png');
const matShader = loadAtlas('atlas-mat.png');

// --- settle a deterministic pile with a tiny gravity sim ---------------------
function settlePile(n, seed, gravAngle) {
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const gx = Math.sin(gravAngle), gy = Math.cos(gravAngle);
  const bodies = [];
  for (let i = 0; i < n; i++) {
    const it = items[Math.floor(rnd() * items.length)];
    bodies.push({
      it,
      x: (rnd() - 0.5) * 1.4, y: (rnd() - 0.5) * 1.4,
      vx: 0, vy: 0,
      angle: rnd() * TAU,
      size: (0.20 + 0.14 * (it.size || 1)) * (0.49 + 0.111 * (1 + rnd() * 9)),
      squash: 0.55 + rnd() * 0.45,
      facing: rnd() < 0.5 ? 1 : -1,
    });
  }
  const dt = 1 / 60;
  for (let step = 0; step < 420; step++) {
    for (const p of bodies) {
      p.vx = (p.vx + gx * 2.1 * dt) * 0.97;
      p.vy = (p.vy + gy * 2.1 * dt) * 0.97;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const d = Math.hypot(p.x, p.y);
      const lim = 0.97 - p.size * 0.32;
      if (d > lim) {
        p.x = (p.x / d) * lim; p.y = (p.y / d) * lim;
        const vn = (p.vx * p.x + p.vy * p.y) / lim;
        p.vx -= 1.1 * vn * (p.x / lim); p.vy -= 1.1 * vn * (p.y / lim);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = bodies[i], c = bodies[j];
        let dx = c.x - a.x, dy = c.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minD = (a.size + c.size) * 0.55;
        if (dist < minD && dist > 1e-4) {
          dx /= dist; dy /= dist;
          const push = (minD - dist) * 0.45;
          a.x -= dx * push; a.y -= dy * push;
          c.x += dx * push; c.y += dy * push;
        }
      }
    }
  }
  return bodies;
}

function packUniforms(bodies) {
  const fpos = new Array(MAX * 4).fill(0);
  const fuv = new Array(MAX * 4).fill(0);
  const fmat = new Array(MAX * 4).fill(0);
  bodies.forEach((p, i) => {
    fpos[i * 4] = p.x; fpos[i * 4 + 1] = p.y;
    fpos[i * 4 + 2] = p.angle; fpos[i * 4 + 3] = p.size;
    fuv[i * 4] = p.it.uv[0]; fuv[i * 4 + 1] = p.it.uv[1];
    fuv[i * 4 + 2] = p.it.uv[2]; fuv[i * 4 + 3] = p.it.uv[3];
    fmat[i * 4] = p.it.matType ?? 3;
    fmat[i * 4 + 1] = p.it.opacity ?? 1;
    fmat[i * 4 + 2] = p.squash;
    fmat[i * 4 + 3] = p.facing;
  });
  return { fpos, fuv, fmat, count: bodies.length };
}

function renderCell(size, pile, lightRot) {
  const { fpos, fuv, fmat, count } = packUniforms(pile);
  const uniforms = [size, size, count, lightRot, ...fpos, ...fuv, ...fmat];
  const shader = cellEffect.makeShaderWithChildren(uniforms, [atlasShader, matShader]);
  const surface = CanvasKit.MakeSurface(size, size);
  const canvas = surface.getCanvas();
  const paint = new CanvasKit.Paint();
  paint.setShader(shader);
  canvas.drawRect(CanvasKit.LTRBRect(0, 0, size, size), paint);
  surface.flush();
  const img = surface.makeImageSnapshot();
  shader.delete(); paint.delete(); surface.delete();
  return img;
}

function renderView(size, cellImg, mirrors, rotation) {
  const cellShader = cellImg.makeShaderOptions(
    CanvasKit.TileMode.Decal, CanvasKit.TileMode.Decal,
    CanvasKit.FilterMode.Linear, CanvasKit.MipmapMode.None,
  );
  const shader = viewEffect.makeShaderWithChildren(
    [size, size, mirrors, rotation],
    [cellShader],
  );
  const surface = CanvasKit.MakeSurface(size, size);
  const canvas = surface.getCanvas();
  canvas.clear(CanvasKit.Color(5, 6, 10, 255));
  const paint = new CanvasKit.Paint();
  paint.setShader(shader);
  canvas.drawRect(CanvasKit.LTRBRect(0, 0, size, size), paint);
  surface.flush();
  const img = surface.makeImageSnapshot();
  shader.delete(); cellShader.delete(); paint.delete(); surface.delete();
  return img;
}

const ROT = 0.3;
const LIGHT = 2.2 - ROT;

// --- contact sheet across mirror counts --------------------------------------
const SIZE = 460;
const cols = [3, 4, 5, 6, 8];
const sheet = CanvasKit.MakeSurface(SIZE * cols.length, SIZE);
const sheetCanvas = sheet.getCanvas();
sheetCanvas.clear(CanvasKit.Color(5, 6, 10, 255));
cols.forEach((m, i) => {
  const pile = settlePile(20, 7 + i, ROT);
  const cellImg = renderCell(SIZE, pile, LIGHT);
  const view = renderView(SIZE, cellImg, m, ROT);
  sheetCanvas.drawImage(view, i * SIZE, 0);
  view.delete(); cellImg.delete();
});
sheet.flush();
const sheetImg = sheet.makeImageSnapshot();
writeFileSync(join(OUT, 'fragments-sheet.png'), Buffer.from(sheetImg.encodeToBytes(CanvasKit.ImageFormat.PNG, 95)));
console.log('wrote preview/fragments-sheet.png');

// --- raw object cell (material inspection) -----------------------------------
const cellImg = renderCell(700, settlePile(14, 9, ROT), LIGHT);
const cellSurf = CanvasKit.MakeSurface(700, 700);
cellSurf.getCanvas().drawImage(cellImg, 0, 0);
cellSurf.flush();
const cellSnap = cellSurf.makeImageSnapshot();
writeFileSync(join(OUT, 'cell.png'), Buffer.from(cellSnap.encodeToBytes(CanvasKit.ImageFormat.PNG, 95)));
console.log('wrote preview/cell.png');

// --- rotation sweep: the wedge must track the pile at EVERY angle -------------
const sweepRots = [0, 0.9, 1.8, 2.7, 3.6, 4.5];
const SW = 380;
const sweep = CanvasKit.MakeSurface(SW * sweepRots.length, SW);
const sweepCanvas = sweep.getCanvas();
sweepCanvas.clear(CanvasKit.Color(5, 6, 10, 255));
sweepRots.forEach((r, i) => {
  const pile = settlePile(16, 21, r);            // pile resettles as the cell turns
  const cellImg = renderCell(SW, pile, 2.2 - r);
  const view = renderView(SW, cellImg, 8, r);    // 8 mirrors = narrowest wedge
  sweepCanvas.drawImage(view, i * SW, 0);
  view.delete(); cellImg.delete();
});
sweep.flush();
const sweepImg = sweep.makeImageSnapshot();
writeFileSync(join(OUT, 'rotation-sweep.png'), Buffer.from(sweepImg.encodeToBytes(CanvasKit.ImageFormat.PNG, 95)));
console.log('wrote preview/rotation-sweep.png');

// --- one large detail view ----------------------------------------------------
const detailCell = renderCell(900, settlePile(22, 11, ROT), LIGHT);
const detail = renderView(900, detailCell, 6, ROT);
const detailSurf = CanvasKit.MakeSurface(900, 900);
detailSurf.getCanvas().clear(CanvasKit.Color(5, 6, 10, 255));
detailSurf.getCanvas().drawImage(detail, 0, 0);
detailSurf.flush();
const detailSnap = detailSurf.makeImageSnapshot();
writeFileSync(join(OUT, 'detail.png'), Buffer.from(detailSnap.encodeToBytes(CanvasKit.ImageFormat.PNG, 95)));
console.log('wrote preview/detail.png');
process.exit(0);
