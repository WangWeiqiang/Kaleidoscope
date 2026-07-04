// Headless SkSL compile check using CanvasKit (the same Skia engine that
// react-native-skia runs on device). Extracts the SkSL string from the
// shader module and tries to build a RuntimeEffect, reporting any errors.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Pull the template-literal SkSL out of the TS source without importing TS.
const src = readFileSync(join(__dirname, '..', 'src', 'shaders', 'kaleidoscope.ts'), 'utf8');
const m = src.match(/KALEIDOSCOPE_SKSL\s*=\s*`([\s\S]*?)`/);
if (!m) {
  console.error('Could not locate KALEIDOSCOPE_SKSL literal');
  process.exit(1);
}
const max = (src.match(/MAX_FRAGMENTS\s*=\s*(\d+)/) || [, '32'])[1];
const sksl = m[1].replace(/\$\{MAX_FRAGMENTS\}/g, max);

const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js');

const CanvasKit = await CanvasKitInit({
  locateFile: (f) => join(__dirname, '..', 'node_modules', 'canvaskit-wasm', 'bin', f),
});

let err = '';
const effect = CanvasKit.RuntimeEffect.Make(sksl, (e) => {
  err = e;
});

if (!effect) {
  console.error('❌ SkSL failed to compile:\n' + err);
  process.exit(1);
}

// sanity-check the uniforms the app sets actually exist
const expected = [
  'u_resolution',
  'u_mirrors',
  'u_rotation',
  'u_count',
  'u_atlasSize',
  'u_fpos',
  'u_fuv',
  'u_fflip',
];
const missing = expected.filter((u) => effect.getUniform(getIndex(effect, u)) === undefined);

function getIndex(fx, name) {
  for (let i = 0; i < fx.getUniformCount(); i++) {
    if (fx.getUniformName(i) === name) return i;
  }
  return -1;
}

const present = expected.filter((u) => getIndex(effect, u) !== -1);
const absent = expected.filter((u) => getIndex(effect, u) === -1);

console.log('✅ SkSL compiled successfully.');
console.log('   uniforms found:', present.join(', '));
if (absent.length) {
  console.error('⚠️  uniforms declared in app but missing from shader:', absent.join(', '));
  process.exit(1);
}
process.exit(0);
