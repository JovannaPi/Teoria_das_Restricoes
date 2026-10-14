import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { isLocalUrl, qrMatrix } from '../src/online/qr';

function rgba(m: boolean[][], scale: number) {
  const q = 4;
  const n = (m.length + q * 2) * scale;
  const d = new Uint8ClampedArray(n * n * 4).fill(255);
  m.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const i = (((r + q) * scale + y) * n + (c + q) * scale + x) * 4;
          d[i] = d[i + 1] = d[i + 2] = 0;
        }
    }),
  );
  return { d, n };
}

describe('QR Code', () => {
  it('o código gerado é lido de volta com o mesmo endereço', () => {
    const url = 'https://jovannapi.github.io/Teoria_das_Restricoes/pocao/';
    const { d, n } = rgba(qrMatrix(url), 6);
    expect(jsQR(d, n, n)?.data).toBe(url);
  });
  it('recusa endereços que não funcionam nos celulares da turma', () => {
    expect(isLocalUrl('http://localhost:4173/')).toBe(true);
    expect(isLocalUrl('http://192.168.0.10:5173/')).toBe(true);
    expect(isLocalUrl('file:///C:/jogo/pocao-em-apuros.html')).toBe(true);
    expect(isLocalUrl('https://jovannapi.github.io/Teoria_das_Restricoes/pocao/')).toBe(false);
  });
});
