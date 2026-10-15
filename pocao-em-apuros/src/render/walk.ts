// Onde a bruxa pode andar na loja: chão, móveis que bloqueiam e caminhos que contornam os móveis.
// Coordenadas em px lógicos da cena (480×270); o ponto de referência de um personagem são os pés.
import type { Rect } from './layout';
import { LAYOUT, MENTOR_SPOT } from './layout';
import { STATION_ORDER } from '../data/stations';

/** Chão andável (abaixo da parede do fundo). */
export const FLOOR: Rect = { x: 8, y: 88, w: 464, h: 174 };

/** Pegadas dos móveis (onde os pés não podem entrar), medidas sobre o cenário desenhado. */
export const OBSTACLES: Rect[] = [
  { x: 24, y: 100, w: 80, h: 30 }, // bancada de preparo
  { x: 111, y: 86, w: 13, h: 14 }, // vaso perto da bancada
  { x: 178, y: 128, w: 52, h: 34 }, // caldeirão
  { x: 300, y: 98, w: 54, h: 31 }, // mesa do alambique
  { x: 396, y: 170, w: 66, h: 20 }, // bacias de resfriamento
  { x: 316, y: 219, w: 61, h: 28 }, // mesa de embalagem
  { x: 104, y: 220, w: 94, h: 21 }, // balcão
  { x: 199, y: 196, w: 31, h: 14 }, // mesinha ao lado do balcão
  { x: 289, y: 234, w: 13, h: 17 }, // vaso do meio
  { x: 464, y: 220, w: 12, h: 18 }, // vaso da direita
  { x: 445, y: 243, w: 28, h: 20 }, // baú
];

/** Pessoas paradas também ocupam lugar (aprendizes e a mentora). */
function peopleRects(): Rect[] {
  const out: Rect[] = [{ x: MENTOR_SPOT.x - 5, y: MENTOR_SPOT.y - 4, w: 10, h: 6 }];
  for (const id of STATION_ORDER) for (const w of LAYOUT[id].workers) out.push({ x: w.x - 5, y: w.y - 4, w: 10, h: 6 });
  return out;
}

const FOOT_W = 4; // meia largura dos pés
const FOOT_UP = 2; // profundidade para trás
const FOOT_DOWN = 1;

let people: Rect[] | null = null;

/** Os pés da bruxa caberiam em (x, y)? */
export function free(x: number, y: number, withPeople = true): boolean {
  if (x - FOOT_W < FLOOR.x || x + FOOT_W > FLOOR.x + FLOOR.w || y - FOOT_UP < FLOOR.y || y + FOOT_DOWN > FLOOR.y + FLOOR.h) return false;
  const hit = (r: Rect) => x + FOOT_W > r.x && x - FOOT_W < r.x + r.w && y + FOOT_DOWN > r.y && y - FOOT_UP < r.y + r.h;
  if (OBSTACLES.some(hit)) return false;
  if (withPeople && (people ||= peopleRects()).some(hit)) return false;
  return true;
}

/**
 * Anda de (x, y) na direção (dx, dy) e escorrega pelos obstáculos: se o caminho direto está
 * bloqueado, tenta só na horizontal ou só na vertical (como nos jogos 2D clássicos).
 */
export function slide(x: number, y: number, dx: number, dy: number): { x: number; y: number } {
  // se ela já está num lugar apertado (ao lado de um aprendiz), deixa sair
  if (!free(x, y)) {
    return { x: Math.max(FLOOR.x + FOOT_W, Math.min(FLOOR.x + FLOOR.w - FOOT_W, x + dx)), y: Math.max(FLOOR.y + FOOT_UP, Math.min(FLOOR.y + FLOOR.h - FOOT_DOWN, y + dy)) };
  }
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 1.5));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (free(x + sx, y + sy)) {
      x += sx;
      y += sy;
    } else if (sx && free(x + sx, y)) x += sx;
    else if (sy && free(x, y + sy)) y += sy;
    else break;
  }
  return { x, y };
}

// ---------------------------------------------------------------- caminhos (A* numa grade de 4 px)
const CELL = 4;
const GW = Math.ceil(480 / CELL);
const GH = Math.ceil(270 / CELL);
let grid: Uint8Array | null = null;

function buildGrid(): Uint8Array {
  const g = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) g[j * GW + i] = free(i * CELL + CELL / 2, j * CELL + CELL / 2) ? 1 : 0;
  return g;
}

function cellOf(x: number, y: number): [number, number] {
  return [Math.max(0, Math.min(GW - 1, Math.floor(x / CELL))), Math.max(0, Math.min(GH - 1, Math.floor(y / CELL)))];
}

/** O ponto livre mais próximo de (x, y) — para chegar perto de algo que fica dentro de um móvel. */
export function nearestFree(x: number, y: number): { x: number; y: number } {
  if (free(x, y)) return { x, y };
  const g = (grid ||= buildGrid());
  const [ci, cj] = cellOf(x, y);
  for (let r = 1; r < 40; r++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let j = cj - r; j <= cj + r; j++)
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= GW || j >= GH || !g[j * GW + i]) continue;
        const px = i * CELL + CELL / 2;
        const py = j * CELL + CELL / 2;
        const d = Math.hypot(px - x, py - y);
        if (!best || d < best.d) best = { x: px, y: py, d };
      }
    if (best) return { x: best.x, y: best.y };
  }
  return { x, y };
}

function lineFree(ax: number, ay: number, bx: number, by: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay));
  for (let k = 1; k <= n; k++) if (!free(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n)) return false;
  return true;
}

/** Caminho de (ax, ay) até perto de (bx, by) contornando os móveis; lista de pontos a seguir. */
export function findPath(ax: number, ay: number, bx: number, by: number): { x: number; y: number }[] {
  const end = nearestFree(bx, by);
  if (lineFree(ax, ay, end.x, end.y)) return [end];
  const g = (grid ||= buildGrid());
  const [si, sj] = cellOf(ax, ay);
  const [ei, ej] = cellOf(end.x, end.y);
  const N = GW * GH;
  const cost = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const open: number[] = [];
  const start = sj * GW + si;
  const goal = ej * GW + ei;
  cost[start] = 0;
  open.push(start);
  const h = (k: number) => Math.hypot((k % GW) - ei, Math.floor(k / GW) - ej);
  const closed = new Uint8Array(N);
  while (open.length) {
    // fila simples: a grade é pequena (120×68)
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (cost[open[k]] + h(open[k]) < cost[open[bi]] + h(open[bi])) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % GW;
    const cj = Math.floor(cur / GW);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
        const nk = nj * GW + ni;
        if (!g[nk] && nk !== goal) continue;
        // sem cortar quina de móvel na diagonal
        if (di && dj && (!g[cj * GW + ni] || !g[nj * GW + ci])) continue;
        const c = cost[cur] + (di && dj ? 1.414 : 1);
        if (c < cost[nk]) {
          cost[nk] = c;
          from[nk] = cur;
          open.push(nk);
        }
      }
  }
  if (from[goal] === -1 && goal !== start) return [end];
  const cells: { x: number; y: number }[] = [];
  for (let k = goal; k !== -1 && k !== start; k = from[k]) cells.push({ x: (k % GW) * CELL + CELL / 2, y: Math.floor(k / GW) * CELL + CELL / 2 });
  cells.reverse();
  cells[cells.length - 1] = end;
  // encurta: pula pontos intermediários enquanto houver linha livre
  const out: { x: number; y: number }[] = [];
  let px = ax;
  let py = ay;
  let i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !lineFree(px, py, cells[j].x, cells[j].y)) j--;
    out.push(cells[j]);
    px = cells[j].x;
    py = cells[j].y;
    i = j + 1;
  }
  return out;
}
