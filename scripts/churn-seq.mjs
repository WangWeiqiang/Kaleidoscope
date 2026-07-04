// Renders one chamber at increasing u_churn so we can see the fragments
// rearrange as the user turns the scope (rotation also advances together).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'preview');
mkdirSync(OUT, { recursive: true });

const src = readFileSync(join(__dirname, '..', 'src', 'shaders', 'kaleidoscope.ts'), 'utf8');
const sksl = src.match(/KALEIDOSCOPE_SKSL\s*=\s*`([\s\S]*?)`/)[1];

const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js');
const CanvasKit = await CanvasKitInit({
  locateFile: (f) => join(__dirname, '..', 'node_modules', 'canvaskit-wasm', 'bin', f),
});
const effect = CanvasKit.RuntimeEffect.Make(sksl, (e) => { throw new Error(e); });

const SIZE = 380;
const material = Number(process.argv[2] ?? 0); // 0 glass
const mirrors = Number(process.argv[3] ?? 3);  // triangle
const steps = [0, 0.7, 1.4, 2.1, 2.8, 3.5];

const W = SIZE * steps.length;
const surface = CanvasKit.MakeSurface(W, SIZE);
const canvas = surface.getCanvas();
canvas.clear(CanvasKit.Color(5, 6, 10, 255));

steps.forEach((churn, i) => {
  const uniforms = [SIZE, SIZE, mirrors, material, churn * 0.6, churn, 0.55];
  const shader = effect.makeShader(uniforms);
  const paint = new CanvasKit.Paint();
  paint.setShader(shader);
  canvas.save();
  canvas.translate(i * SIZE, 0);
  canvas.drawRect(CanvasKit.LTRBRect(0, 0, SIZE, SIZE), paint);
  canvas.restore();
  shader.delete();
  paint.delete();
});

surface.flush();
const img = surface.makeImageSnapshot();
writeFileSync(join(OUT, 'churn-seq.png'), Buffer.from(img.encodeToBytes(CanvasKit.ImageFormat.PNG, 95)));
console.log('wrote preview/churn-seq.png');
process.exit(0);
