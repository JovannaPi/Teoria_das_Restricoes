// Gera os ícones PNG do app (pixel art do frasco) sem dependências: codificador PNG mínimo.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const MAP = [
  '................',
  '......BBBB......',
  '......BBBB......',
  '.......OO.......',
  '......OIIO......',
  '......OIIO......',
  '.....OIIIIO.....',
  '....OGGGGGGO....',
  '...OGGLGGGGGO...',
  '..OGGLLGGGGGGO..',
  '..OGGLGGGGGGGO..',
  '..OGGGGGGGGPGO..',
  '..OGGGGGGGPPGO..',
  '...OGGGGGGGGO...',
  '....OOOOOOOO....',
  '................',
];
const COLORS = { O: [27, 18, 34], B: [160, 106, 58], I: [168, 224, 255], G: [70, 176, 110], L: [134, 232, 168], P: [154, 106, 208] };
const BG = [26, 18, 32];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, padFrac) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const pad = Math.round(size * padFrac);
  const cell = (size - pad * 2) / 16;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let c = BG;
      const gx = Math.floor((x - pad) / cell);
      const gy = Math.floor((y - pad) / cell);
      if (gx >= 0 && gx < 16 && gy >= 0 && gy < 16) {
        const ch = MAP[gy][gx];
        if (ch !== '.') c = COLORS[ch];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, 0.08));
writeFileSync('public/icons/icon-512.png', png(512, 0.08));
writeFileSync('public/icons/maskable-512.png', png(512, 0.2));
writeFileSync('public/icons/apple-touch-icon.png', png(180, 0.1));
console.log('ícones gerados em public/icons');
