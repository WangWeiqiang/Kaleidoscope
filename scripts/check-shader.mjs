// Headless SkSL compile check using CanvasKit (the same Skia engine that
// react-native-skia runs on device). Extracts both SkSL passes from the shader
// module and tries to build RuntimeEffects, reporting any errors.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Pull the template-literal SkSL out of the TS source without importing TS.
const src = readFileSync(join(__dirname, '..', 'src', 'shaders', 'kaleidoscope.ts'), 'utf8');
const max = (src.match(/MAX_FRAGMENTS\s*=\s*(\d+)/) || [, '32'])[1];

function extract(name) {
  const m = src.match(new RegExp(`${name}\\s*=\\s*\`([\\s\\S]*?)\``));
  if (!m) {
    console.error(`Could not locate ${name} literal`);
    process.exit(1);
  }
  return m[1].replace(/\$\{MAX_FRAGMENTS\}/g, max);
}

const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js');
const CanvasKit = await CanvasKitInit({
  locateFile: (f) => join(__dirname, '..', 'node_modules', 'canvaskit-wasm', 'bin', f),
});

function getIndex(fx, name) {
  for (let i = 0; i < fx.getUniformCount(); i++) {
    if (fx.getUniformName(i) === name) return i;
  }
  return -1;
}

// name → uniforms the app is expected to set
const PASSES = {
  CELL_SKSL: ['u_resolution', 'u_count', 'u_lightRot', 'u_shape', 'u_fpos', 'u_fuv', 'u_fmat', 'u_frot'],
  VIEW_SKSL: ['u_resolution', 'u_mirrors', 'u_rotation'],
};

let failed = false;
for (const [name, expected] of Object.entries(PASSES)) {
  const sksl = extract(name);
  let err = '';
  const effect = CanvasKit.RuntimeEffect.Make(sksl, (e) => {
    err = e;
  });
  if (!effect) {
    console.error(`❌ ${name} failed to compile:\n` + err);
    failed = true;
    continue;
  }
  const absent = expected.filter((u) => getIndex(effect, u) === -1);
  console.log(`✅ ${name} compiled.`);
  console.log('   uniforms found:', expected.filter((u) => !absent.includes(u)).join(', '));
  if (absent.length) {
    console.error(`⚠️  ${name}: uniforms declared in app but missing from shader:`, absent.join(', '));
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
