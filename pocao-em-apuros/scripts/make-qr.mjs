// Gera o QR Code em alta resolução para slides e confere se ele é lido (nítido e "projetado").
// Uso, DEPOIS de publicar e abrir a URL pública no celular:
//   npm run qr -- https://SEU-ENDERECO-PUBLICO/pocao/
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import jsQR from 'jsqr';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator');

const url = process.argv[2];
if (!url || !/^https:\/\//.test(url) || /localhost|127\.0\.0\.1/.test(url)) {
  console.error('Informe a URL PÚBLICA (https) do jogo publicado. Ex.: npm run qr -- https://exemplo.github.io/repo/pocao/');
  process.exit(1);
}

function matrix(text) {
  const qr = qrcode(0, 'Q');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Rasteriza com margem branca de 4 módulos. Retorna {w, h, rgba}. */
function raster(m, scale) {
  const quiet = 4;
  const n = m.length + quiet * 2;
  const w = n * scale;
  const rgba = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let r = 0; r < m.length; r++)
    for (let c = 0; c < m.length; c++)
      if (m[r][c])
        for (let y = 0; y < scale; y++)
          for (let x = 0; x < scale; x++) {
            const i = (((r + quiet) * scale + y) * w + (c + quiet) * scale + x) * 4;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
          }
  return { w, h: w, rgba };
}

/** Simula uma foto de projeção: baixa resolução, desfoque, pouco contraste e ruído. */
function degrade(img) {
  const { w, rgba } = img;
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let k = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const yy = Math.min(w - 1, Math.max(0, y + dy));
          sum += rgba[(yy * w + xx) * 4];
          k++;
        }
      const v = 70 + (sum / k / 255) * 120 + (Math.random() - 0.5) * 30;
      const i = (y * w + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = v;
      out[i + 3] = 255;
    }
  return { w, h: w, rgba: out };
}

function png(img) {
  const { w, rgba } = img;
  const raw = Buffer.alloc(w * (w + 1));
  for (let y = 0; y < w; y++) {
    raw[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = rgba[(y * w + x) * 4];
  }
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (t, d) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8;
  ihdr[9] = 0; // tons de cinza
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const m = matrix(url);
const big = raster(m, Math.floor(2048 / (m.length + 8)));
const crisp = jsQR(big.rgba, big.w, big.h);
const proj = degrade(raster(m, 4));
const projected = jsQR(proj.rgba, proj.w, proj.h);
mkdirSync('docs/seminario', { recursive: true });
writeFileSync('docs/seminario/qr-code.png', png(big));
console.log(`QR (${m.length}×${m.length} módulos, correção Q) salvo em docs/seminario/qr-code.png (${big.w}px)`);
console.log(`Leitura nítida: ${crisp?.data === url ? 'OK' : 'FALHOU'} · leitura simulando projeção: ${projected?.data === url ? 'OK' : 'FALHOU'}`);
if (crisp?.data !== url || projected?.data !== url) process.exit(1);
