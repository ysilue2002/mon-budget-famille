/**
 * Génère les icônes PNG de la PWA (Android, iOS, ordinateur) à partir de la
 * même géométrie que `public/icon.svg`, sans dépendance externe.
 *
 * Pourquoi des PNG : Android n'accepte l'invite d'installation qu'avec des
 * icônes 192 px et 512 px, et iOS ignore l'icône SVG pour l'écran d'accueil.
 * Le rendu est suréchantillonné (4×4) pour des bords nets.
 *
 * Usage : node scripts/make-icons.mjs
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const COLORS = {
  bg: [20, 83, 45],
  card: [246, 253, 249],
  strip: [157, 205, 170],
  ink: [54, 120, 78],
};

const SEGMENTS = [
  [34, 96, 54, 74],
  [54, 74, 68, 86],
  [68, 86, 92, 58],
];

function inRoundedRect(x, y, left, top, width, height, radius) {
  if (x < left || y < top || x > left + width || y > top + height) return false;
  const cx = Math.min(Math.max(x, left + radius), left + width - radius);
  const cy = Math.min(Math.max(y, top + radius), top + height - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function distanceToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / length));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Couleur d'un point en coordonnées du viewBox 128×128. */
function sample(x, y, square) {
  if (square || inRoundedRect(x, y, 0, 0, 128, 128, 28)) {
    if (SEGMENTS.some((segment) => distanceToSegment(x, y, segment) <= 3.5)) return COLORS.ink;
    if ((x - 86) ** 2 + (y - 76) ** 2 <= 81) return COLORS.ink;
    if (inRoundedRect(x, y, 24, 44, 80, 14, 7)) return COLORS.strip;
    if (inRoundedRect(x, y, 24, 44, 80, 52, 10)) return COLORS.card;
    return COLORS.bg;
  }
  return null;
}

function render({ size, padding = 0, square = false }) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4;
  const content = size * (1 - padding * 2);
  const offset = size * padding;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = ((px + (sx + 0.5) / samples) - offset) / (content / 128);
          const y = ((py + (sy + 0.5) / samples) - offset) / (content / 128);
          const color = sample(x, y, square);
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          covered += 1;
        }
      }
      const index = (py * size + px) * 4;
      if (covered === 0) continue;
      pixels[index] = Math.round(r / covered);
      pixels[index + 1] = Math.round(g / covered);
      pixels[index + 2] = Math.round(b / covered);
      pixels[index + 3] = Math.round((covered / (samples * samples)) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // profondeur
  header[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filtre « none »
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outputs = [
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
  { file: 'public/apple-touch-icon.png', size: 180, square: true, padding: 0.12 },
  { file: 'public/icon-maskable-512.png', size: 512, square: true, padding: 0.12 },
];

for (const output of outputs) {
  writeFileSync(output.file, encodePng(output.size, render(output)));
  console.log('écrit', output.file);
}
