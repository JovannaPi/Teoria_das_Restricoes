import type { StationId } from '../sim/types';

// Resolução lógica da oficina (pixel art ampliada pelo navegador).
export const W = 480;
export const H = 270;
export const FLOOR_Y = 84;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StationLayout {
  id: StationId;
  hit: Rect; // área clicável
  center: { x: number; y: number };
  workers: { x: number; y: number; facing: 1 | -1 }[]; // por posto de trabalho
  queue: Rect; // onde a fila de entrada é desenhada
  help: { x: number; y: number }; // onde a Lina fica ao ajudar
  label: { x: number; y: number }; // etiqueta HTML sobreposta
  out: { x: number; y: number }; // ponto de saída das poções
}

export const LAYOUT: Record<StationId, StationLayout> = {
  preparo: {
    id: 'preparo',
    hit: { x: 22, y: 88, w: 82, h: 46 },
    center: { x: 62, y: 112 },
    workers: [
      { x: 44, y: 142, facing: 1 },
      { x: 80, y: 142, facing: -1 },
      { x: 104, y: 140, facing: -1 },
    ],
    queue: { x: 4, y: 128, w: 22, h: 30 },
    help: { x: 62, y: 152 },
    label: { x: 62, y: 86 },
    out: { x: 100, y: 120 },
  },
  caldeirao: {
    id: 'caldeirao',
    hit: { x: 168, y: 116, w: 120, h: 66 },
    center: { x: 204, y: 152 },
    workers: [
      { x: 236, y: 160, facing: -1 },
      { x: 284, y: 178, facing: -1 },
    ],
    queue: { x: 134, y: 146, w: 30, h: 30 },
    help: { x: 176, y: 182 },
    label: { x: 214, y: 112 },
    out: { x: 210, y: 130 },
  },
  destilacao: {
    id: 'destilacao',
    hit: { x: 300, y: 72, w: 104, h: 54 },
    center: { x: 332, y: 106 },
    workers: [
      { x: 316, y: 132, facing: 1 },
      { x: 384, y: 132, facing: -1 },
    ],
    queue: { x: 292, y: 128, w: 22, h: 22 },
    help: { x: 348, y: 140 },
    label: { x: 346, y: 68 },
    out: { x: 360, y: 116 },
  },
  resfriamento: {
    id: 'resfriamento',
    hit: { x: 398, y: 140, w: 78, h: 50 },
    center: { x: 436, y: 168 },
    workers: [
      { x: 418, y: 196, facing: 1 },
      { x: 452, y: 196, facing: -1 },
      { x: 468, y: 150, facing: -1 },
    ],
    queue: { x: 374, y: 156, w: 22, h: 30 },
    help: { x: 436, y: 206 },
    label: { x: 436, y: 136 },
    out: { x: 420, y: 186 },
  },
  embalagem: {
    id: 'embalagem',
    hit: { x: 312, y: 206, w: 70, h: 44 },
    center: { x: 346, y: 230 },
    workers: [{ x: 350, y: 212, facing: 1 }],
    queue: { x: 388, y: 218, w: 30, h: 30 },
    help: { x: 322, y: 258 },
    label: { x: 346, y: 202 },
    out: { x: 318, y: 232 },
  },
  balcao: {
    id: 'balcao',
    hit: { x: 104, y: 208, w: 96, h: 48 },
    center: { x: 150, y: 236 },
    workers: [{ x: 150, y: 214, facing: -1 }],
    queue: { x: 204, y: 222, w: 26, h: 26 },
    help: { x: 182, y: 212 },
    label: { x: 150, y: 202 },
    out: { x: 110, y: 236 },
  },
};

export const DOOR = { x: -8, y: 238 };
export const COUNTER_FRONT = { x: 92, y: 246 };
export const WAITING_AREA: Rect = { x: 18, y: 160, w: 76, h: 56 };
export const SHELF = { x: 214, y: 196 };
export const MENTOR_SPOT = { x: 282, y: 98 };
export const LINA_HOME = { x: 196, y: 214 };
export const WALK_AREA: Rect = { x: 10, y: 92, w: 462, h: 170 };

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
