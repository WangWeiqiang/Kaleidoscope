// Dependency-free PNG asset generator. Produces a jewel-toned kaleidoscope
// rosette for the app icon / adaptive icon / splash. Run: `npm run assets`.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'assets');
mkdirSync(ASSETS, { recursive: true });

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
function png(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TAU = Math.PI * 2;
function hsv(h, s, v) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const r = [v, q, p, p, t, v][i % 6];
  const g = [t, v, v, q, p, p][i % 6];
  const b = [p, p, t, v, v, q][i % 6];
  return [r, g, b];
}

function render(size, { transparent = false, sectors = 6, scale = 1 } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const R = (size / 2) * 0.96;
  const seg = TAU / sectors;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / scale;
      const dy = (y - cy) / scale;
      const r = Math.sqrt(dx * dx + dy * dy);
      let a = Math.atan2(dy, dx);
      a = a % seg;
      a = Math.abs(a - seg / 2); // mirror fold
      const fx = Math.cos(a) * r;
      const fy = Math.sin(a) * r;
      // jewel cells
      const cell =
        Math.sin(fx * 0.06) * Math.cos(fy * 0.06) +
        Math.sin((fx + fy) * 0.035 + 1.3);
      const hue = (r / R) * 0.7 + a * 0.6 + 0.05;
      const v = 0.55 + 0.45 * Math.max(0, cell);
      let [rr, gg, bb] = hsv(hue, 0.85, v);
      // central bloom
      const bloom = Math.max(0, 1 - r / (R * 0.5));
      rr += bloom * 0.4;
      gg += bloom * 0.4;
      bb += bloom * 0.45;
      const inside = r < R;
      const i = (y * size + x) * 4;
      if (!inside) {
        buf[i] = 5;
        buf[i + 1] = 6;
        buf[i + 2] = 10;
        buf[i + 3] = transparent ? 0 : 255;
      } else {
        const edge = Math.min(1, (R - r) / 6); // antialias rim
        buf[i] = Math.min(255, rr * 255);
        buf[i + 1] = Math.min(255, gg * 255);
        buf[i + 2] = Math.min(255, bb * 255);
        buf[i + 3] = transparent ? Math.round(edge * 255) : 255;
      }
    }
  }
  return png(size, size, buf);
}

writeFileSync(join(ASSETS, 'icon.png'), render(1024, { sectors: 6 }));
writeFileSync(
  join(ASSETS, 'adaptive-icon.png'),
  render(1024, { sectors: 6, transparent: true, scale: 1.25 }),
);
writeFileSync(
  join(ASSETS, 'favicon.png'),
  render(64, { sectors: 6 }),
);
writeFileSync(
  join(ASSETS, 'splash.png'),
  render(1242, { sectors: 8, scale: 1.1 }),
);
console.log('Generated assets in', ASSETS);
