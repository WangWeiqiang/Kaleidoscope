// Generates a few transparent-PNG placeholder fragments per category so the
// app is testable before you collect real artwork. Safe to delete/overwrite —
// drop your own PNGs into assets/fragments/<category>/ and run `npm run fragments`.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'assets', 'fragments');

// ---- minimal PNG (RGBA) encoder ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// draw an irregular angular shard of the given colour on a transparent canvas
function shard(size, [r, g, b], opacity, seed, faceted) {
  const buf = Buffer.alloc(size * size * 4);
  const rng = mulberry(seed);
  const N = 9 + Math.floor(rng() * 4);
  const radii = Array.from({ length: N }, () => 0.62 + rng() * 0.34);
  const rot = rng() * Math.PI * 2;
  const cx = size / 2, cy = size / 2, R = size / 2 - 4;
  const radAt = (ang) => {
    let a = ((ang - rot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const f = (a / (Math.PI * 2)) * N;
    const i = Math.floor(f), t = f - i;
    // sharp linear interpolation between vertices → straight broken edges
    return radii[i % N] * (1 - t) + radii[(i + 1) % N] * t;
  };
  const lx = -0.5, ly = -0.7; // light dir for a soft facet shade
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / R, dy = (y - cy) / R;
      const dist = Math.hypot(dx, dy);
      const edge = radAt(Math.atan2(dy, dx));
      const i = (y * size + x) * 4;
      if (dist <= edge) {
        // facet shading + bright rim
        const shade = faceted
          ? 0.78 + 0.22 * Math.max(0, -(dx * lx + dy * ly))
          : 0.85 + 0.15 * (1 - dist / edge);
        const rim = dist > edge - 0.06 ? 1.0 : 0.0;
        const rr = Math.min(255, (r * shade + rim * 90) | 0);
        const gg = Math.min(255, (g * shade + rim * 90) | 0);
        const bb = Math.min(255, (b * shade + rim * 90) | 0);
        const aa = dist > edge - 0.02 ? 255 * (edge - dist) / 0.02 : 255;
        buf[i] = rr; buf[i + 1] = gg; buf[i + 2] = bb;
        buf[i + 3] = Math.max(0, Math.min(255, aa)) * opacity;
      } else {
        buf[i + 3] = 0; // transparent
      }
    }
  }
  return png(size, size, buf);
}

// palettes per category (a handful of representative colours)
const SAMPLES = {
  glass: { faceted: true, opacity: 0.82, items: {
    amber: [210, 150, 60], emerald: [40, 175, 110], cobalt: [50, 95, 200],
    rose: [205, 110, 150], clear: [205, 220, 235] } },
  paper: { faceted: false, opacity: 1.0, items: {
    kraft: [195, 160, 110], white: [235, 230, 220], red: [200, 80, 75],
    blue: [80, 115, 185], yellow: [225, 200, 90] } },
  metal: { faceted: true, opacity: 1.0, items: {
    silver: [205, 210, 218], gold: [230, 190, 95], copper: [210, 130, 95],
    steel: [120, 130, 145] } },
  plastic: { faceted: true, opacity: 1.0, items: {
    pink: [240, 110, 160], cyan: [70, 200, 195], lime: [150, 210, 80],
    purple: [165, 110, 220] } },
};

let count = 0, seed = 1;
const labels = {};
for (const [cat, cfg] of Object.entries(SAMPLES)) {
  mkdirSync(join(ROOT, cat), { recursive: true });
  for (const [name, color] of Object.entries(cfg.items)) {
    const file = join(ROOT, cat, `${name}.png`);
    // don't clobber real artwork the user may have added under the same name
    if (existsSync(file) && process.argv[2] !== '--force') continue;
    writeFileSync(file, shard(256, color, cfg.opacity, seed++, cfg.faceted));
    count++;
  }
}
console.log(`Generated ${count} sample fragment PNGs under assets/fragments/`);
