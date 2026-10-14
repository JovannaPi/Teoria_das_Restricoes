// QR Code gerado no próprio aparelho (biblioteca qrcode-generator, MIT, sem rede).
import qrcode from 'qrcode-generator';

/** Matriz de módulos (true = escuro). Correção de erro "Q" (~25%) para ler bem em projeção. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'Q');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const m: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    m.push(row);
  }
  return m;
}

/** Desenha preto sobre branco com margem branca de 4 módulos (zona de silêncio). */
export function drawQr(canvas: HTMLCanvasElement, text: string, sizePx: number): void {
  const m = qrMatrix(text);
  const quiet = 4;
  const n = m.length + quiet * 2;
  const scale = Math.max(1, Math.floor(sizePx / n));
  canvas.width = canvas.height = n * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  m.forEach((row, r) => row.forEach((dark, c) => dark && ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale)));
}

/** Endereço público do jogo a partir de onde ele está aberto (sem parâmetros nem âncora). */
export function currentGameUrl(): string {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.pathname = u.pathname.replace(/(index|pocao-em-apuros)\.html$/, '');
  return u.toString();
}

/** Endereços que NÃO funcionam nos celulares da turma. */
export function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return true;
    return /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|\.local$/.test(u.hostname) || u.protocol !== 'https:';
  } catch {
    return true;
  }
}
