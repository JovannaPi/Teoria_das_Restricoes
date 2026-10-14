// Cenário estático da oficina, desenhado uma única vez num canvas fora da tela.
import { FLOOR_Y, H, W } from './layout';
import { P } from './palette';
import { box, drawFlask, ellipse, makeCanvas, px, type Ctx } from './sprites';

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function renderBackground(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(W, H);
  const r = rand(7);
  wall(ctx, r);
  floor(ctx);
  windowArt(ctx);
  shelves(ctx, r);
  bookshelf(ctx, r);
  door(ctx);
  decorations(ctx, r);
  rug(ctx);
  return c;
}

function wall(ctx: Ctx, r: () => number) {
  px(ctx, 0, 0, W, FLOOR_Y, P.wall);
  // tábuas verticais
  for (let x = 0; x < W; x += 12) {
    px(ctx, x, 0, 1, FLOOR_Y, P.wallDark);
    px(ctx, x + 1, 0, 1, FLOOR_Y, P.wallPlankHi);
    for (let k = 0; k < 3; k++) {
      const y = Math.floor(r() * (FLOOR_Y - 6));
      px(ctx, x + 3 + Math.floor(r() * 6), y, 1, 2, P.wallDark);
    }
  }
  // vigas
  px(ctx, 0, 0, W, 6, P.beam);
  px(ctx, 0, 5, W, 1, P.outline);
  px(ctx, 0, 1, W, 1, P.beamHi);
  for (const x of [0, 120, 236, 356, 474]) {
    px(ctx, x, 0, 6, FLOOR_Y, P.beam);
    px(ctx, x + 1, 0, 1, FLOOR_Y, P.beamHi);
    px(ctx, x + 5, 0, 1, FLOOR_Y, P.outline);
  }
  // rodapé
  px(ctx, 0, FLOOR_Y - 6, W, 6, P.wood1);
  px(ctx, 0, FLOOR_Y - 6, W, 1, P.wood2);
  px(ctx, 0, FLOOR_Y - 1, W, 1, P.outline);
  // parede lateral esquerda (perspectiva leve)
  for (let y = FLOOR_Y; y < H; y++) {
    const w = Math.max(0, Math.round(10 - (y - FLOOR_Y) * 0.02));
    px(ctx, 0, y, w, 1, P.wallDark);
  }
}

function floor(ctx: Ctx) {
  px(ctx, 0, FLOOR_Y, W, H - FLOOR_Y, P.floor);
  // ladrilhos hexagonais escuros, como pedra antiga
  const hw = 14;
  const hh = 8;
  for (let row = 0; row * hh < H - FLOOR_Y + hh; row++) {
    for (let col = -1; col * hw < W + hw; col++) {
      const cx = col * hw + (row % 2) * (hw / 2);
      const cy = FLOOR_Y + row * hh;
      hex(ctx, cx, cy, hw / 2 - 1, hh / 2, (row + col) % 3 === 0 ? P.floorTileHi : P.floorTile);
    }
  }
  // sombra junto à parede
  for (let i = 0; i < 8; i++) px(ctx, 0, FLOOR_Y + i, W, 1, `rgba(10,4,16,${0.35 - i * 0.04})`);
}

function hex(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, c: string) {
  for (let y = -ry; y < ry; y++) {
    const t = Math.abs(y + 0.5) / ry;
    const w = Math.round(rx * (1 - Math.max(0, t - 0.5)));
    px(ctx, cx - w, cy + y, w * 2, 1, c);
  }
  px(ctx, cx - rx, cy + ry - 1, rx * 2, 1, P.floorLine);
}

function windowArt(ctx: Ctx) {
  const x = 248;
  const y = 12;
  const w = 56;
  const h = 46;
  box(ctx, x - 4, y - 4, w + 8, h + 8, P.wood1);
  px(ctx, x, y, w, h, P.night1);
  // céu com degradê em faixas
  for (let i = 0; i < h; i++) px(ctx, x, y + i, w, 1, i < 14 ? P.night0 : i < 30 ? P.night1 : P.night2);
  // estrelas
  for (const [sx, sy] of [
    [6, 6],
    [20, 12],
    [44, 4],
    [50, 20],
    [12, 28],
    [36, 30],
  ])
    px(ctx, x + sx, y + sy, 1, 1, P.amber3);
  // lua crescente
  ellipse(ctx, x + 38, y + 14, 7, 7, P.amber3);
  ellipse(ctx, x + 41, y + 12, 6, 6, P.night0);
  // telhados da cidade
  px(ctx, x, y + h - 8, w, 8, P.night0);
  for (const [tx, tw, th] of [
    [2, 10, 6],
    [14, 8, 10],
    [26, 12, 5],
    [42, 9, 9],
  ]) {
    px(ctx, x + tx, y + h - 8 - th, tw, th, P.night0);
    px(ctx, x + tx + 3, y + h - 6 - th + 2, 2, 2, P.amber2);
  }
  // caixilho
  px(ctx, x + w / 2 - 1, y, 2, h, P.wood1);
  px(ctx, x, y + h / 2 - 1, w, 2, P.wood1);
  // cortinas roxas
  for (const side of [-1, 1]) {
    const cx = side < 0 ? x - 10 : x + w + 2;
    box(ctx, cx, y - 6, 8, h + 14, P.purple1);
    for (let i = 0; i < h + 14; i += 3) px(ctx, cx + 2 + (i % 2), y - 6 + i, 1, 2, P.purple2);
    px(ctx, cx, y + h - 6, 8, 2, P.amber1);
  }
  // varão
  px(ctx, x - 14, y - 8, w + 28, 2, P.copper1);
  // floreira com glicínias
  for (let i = 0; i < 14; i++) {
    px(ctx, x - 12 + i * 6, y - 6 + (i % 3), 3, 3, i % 2 ? P.purple3 : P.purple4);
    px(ctx, x - 11 + i * 6, y - 2 + (i % 3), 1, 3, P.green1);
  }
}

function shelves(ctx: Ctx, r: () => number) {
  // despensa: prateleiras de ingredientes (parede esquerda)
  const colors = [P.green2, P.red2, P.amber2, P.ice1, P.purple3, '#e0d070', P.copper2];
  for (let s = 0; s < 3; s++) {
    const y = 20 + s * 20;
    box(ctx, 14, y, 92, 3, P.wood2);
    px(ctx, 14, y, 92, 1, P.wood3);
    for (let i = 0; i < 9; i++) {
      const fx = 20 + i * 10 + Math.floor(r() * 2);
      const col = colors[Math.floor(r() * colors.length)];
      if (r() < 0.3) {
        // saco de ervas
        box(ctx, fx - 3, y - 7, 7, 7, P.paperDark);
        px(ctx, fx - 2, y - 8, 5, 1, P.green2);
      } else drawFlask(ctx, fx, y - 1, col, Math.floor(r() * 3));
    }
  }
  // ervas penduradas
  for (let i = 0; i < 6; i++) {
    const x = 130 + i * 16;
    px(ctx, x, 6, 1, 6 + (i % 3) * 3, P.wood0);
    const y = 12 + (i % 3) * 3;
    px(ctx, x - 2, y, 5, 6, P.green1);
    px(ctx, x - 1, y + 1, 3, 6, P.green2);
    px(ctx, x - 2, y + 6, 1, 2, P.green0);
  }
}

function bookshelf(ctx: Ctx, r: () => number) {
  const x = 408;
  const y = 10;
  box(ctx, x, y, 62, 68, P.wood1);
  px(ctx, x + 2, y + 2, 58, 64, P.wood0);
  const bookColors = [P.purple2, P.red1, P.green1, P.night2, P.amber0, P.copper1, P.purple1];
  for (let s = 0; s < 4; s++) {
    const sy = y + 4 + s * 16;
    px(ctx, x + 2, sy + 13, 58, 2, P.wood2);
    let bx = x + 4;
    while (bx < x + 56) {
      const bw = 2 + Math.floor(r() * 3);
      const bh = 8 + Math.floor(r() * 5);
      if (r() < 0.12) {
        drawFlask(ctx, bx + 3, sy + 13, P.green2, 1);
        bx += 7;
        continue;
      }
      px(ctx, bx, sy + 13 - bh, bw, bh, bookColors[Math.floor(r() * bookColors.length)]);
      px(ctx, bx, sy + 13 - bh + 2, bw, 1, P.amber2);
      bx += bw + 1;
    }
  }
}

function door(ctx: Ctx) {
  // porta lateral (entrada dos clientes)
  px(ctx, 0, 190, 12, 64, P.outline);
  px(ctx, 0, 192, 10, 60, P.night0);
  px(ctx, 0, 192, 10, 2, P.wood2);
  px(ctx, 8, 192, 2, 60, P.wood2);
  // tapete de entrada
  px(ctx, 10, 228, 22, 22, P.outline);
  px(ctx, 11, 229, 20, 20, P.red0);
  px(ctx, 13, 231, 16, 16, P.red1);
  px(ctx, 19, 237, 4, 4, P.amber2);
}

function decorations(ctx: Ctx, r: () => number) {
  // placa da loja
  box(ctx, 150, 34, 68, 18, P.wood2);
  px(ctx, 152, 36, 64, 14, P.wood1);
  drawFlask(ctx, 160, 48, P.green2, 1);
  for (let i = 0; i < 8; i++) px(ctx, 168 + i * 5, 42, 3, 2, P.amber2);
  px(ctx, 168, 46, 38, 1, P.amber1);
  px(ctx, 183, 28, 1, 6, P.iron2);
  px(ctx, 168, 28, 32, 1, P.iron2);
  // relógio de pêndulo
  box(ctx, 372, 22, 16, 56, P.wood1);
  ellipse(ctx, 380, 32, 5, 5, P.cream);
  px(ctx, 380, 29, 1, 4, P.outline);
  px(ctx, 380, 32, 3, 1, P.outline);
  px(ctx, 374, 44, 12, 30, P.wood0);
  // velas na parede
  for (const [x, y] of [
    [124, 50],
    [232, 50],
    [396, 86 - 24],
  ]) {
    px(ctx, x - 3, y + 6, 7, 2, P.iron2);
    px(ctx, x - 1, y, 3, 6, P.cream);
  }
  // vasos e plantas no chão
  for (const [x, y] of [
    [118, 98],
    [470, 236],
    [296, 250],
  ]) {
    box(ctx, x - 4, y - 6, 8, 7, P.copper1);
    px(ctx, x - 5, y - 13, 3, 7, P.green1);
    px(ctx, x - 1, y - 15, 3, 9, P.green2);
    px(ctx, x + 2, y - 12, 3, 6, P.green1);
    if (r() < 2) px(ctx, x, y - 16, 2, 2, P.purple4);
  }
  // baú no canto
  box(ctx, 446, 244, 26, 18, P.wood1);
  px(ctx, 446, 250, 26, 2, P.iron2);
  px(ctx, 457, 250, 4, 4, P.gold1);
}

function rug(ctx: Ctx) {
  // tapete circular rúnico sob o caldeirão
  ellipse(ctx, 214, 162, 66, 24, P.outline);
  ellipse(ctx, 214, 162, 64, 22, P.purple1);
  ellipse(ctx, 214, 162, 58, 19, P.purple0);
  ellipse(ctx, 214, 162, 54, 17, P.purple1);
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    px(ctx, 214 + Math.cos(ang) * 60, 162 + Math.sin(ang) * 20, 2, 1, P.amber1);
  }
  // tapete da destilação
  px(ctx, 300, 128, 92, 2, P.outline);
  px(ctx, 302, 124, 88, 4, P.night1);
  for (let i = 0; i < 11; i++) px(ctx, 304 + i * 8, 125, 3, 2, P.amber1);
}
