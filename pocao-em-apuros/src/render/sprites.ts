// Gerador de pixel art: personagens, frascos, ícones da interface.
// Todos os recursos visuais são desenhados por código (sem imagens externas).
import { CLOTH, HAIR, P, SKIN } from './palette';

export type Ctx = CanvasRenderingContext2D;

export function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Retângulo com contorno escuro de 1px. */
export function box(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, outline = P.outline): void {
  px(ctx, x - 1, y - 1, w + 2, h + 2, outline);
  px(ctx, x, y, w, h, fill);
}

export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, c: string): void {
  ctx.fillStyle = c;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

// ------------------------------------------------------------------ personagens

export type HatKind = 'bruxa' | 'bruxa_velha' | 'capuz' | 'nenhum' | 'boina' | 'tiara' | 'elmo' | 'flor';
export type HairStyle = 'curto' | 'longo' | 'coque' | 'careca' | 'tranca' | 'espetado';
export type Species = 'humana' | 'elfa' | 'goblin' | 'anao' | 'espectro' | 'sapo' | 'fauna';

export interface Look {
  id: string;
  skin: string;
  hair: string;
  cloth: string;
  cloth2: string;
  hat: HatKind;
  hatColor: string;
  hairStyle: HairStyle;
  species: Species;
  height: number;
  beard?: boolean;
  apron?: boolean;
  glasses?: boolean;
}

export type Action = 'idle' | 'walk' | 'work' | 'carry' | 'happy' | 'angry' | 'sleep' | 'cast';

export const LOOKS: Record<string, Look> = {
  lina: {
    id: 'lina',
    skin: SKIN[0],
    hair: '#8a4a22',
    cloth: P.night1,
    cloth2: P.green2,
    hat: 'bruxa',
    hatColor: P.night0,
    hairStyle: 'longo',
    species: 'humana',
    height: 18,
  },
  morgana: {
    id: 'morgana',
    skin: SKIN[1],
    hair: '#d8d8e0',
    cloth: P.purple1,
    cloth2: P.amber2,
    hat: 'bruxa_velha',
    hatColor: P.purple0,
    hairStyle: 'coque',
    species: 'humana',
    height: 18,
    glasses: true,
  },
  tico: {
    id: 'tico',
    skin: SKIN[2],
    hair: HAIR[2],
    cloth: P.green1,
    cloth2: P.cream,
    hat: 'boina',
    hatColor: P.red1,
    hairStyle: 'espetado',
    species: 'humana',
    height: 15,
    apron: true,
  },
  trufa: {
    id: 'trufa',
    skin: SKIN[3],
    hair: '#2a1810',
    cloth: P.amber0,
    cloth2: P.gold1,
    hat: 'tiara',
    hatColor: P.gold1,
    hairStyle: 'tranca',
    species: 'humana',
    height: 17,
  },
};

const WORKER_LOOKS: Look[] = [
  { id: 'w0', skin: SKIN[0], hair: HAIR[3], cloth: P.purple2, cloth2: P.cream, hat: 'capuz', hatColor: P.purple1, hairStyle: 'curto', species: 'humana', height: 16, apron: true },
  { id: 'w1', skin: SKIN[2], hair: HAIR[0], cloth: '#3d6e6a', cloth2: P.cream, hat: 'nenhum', hatColor: P.purple1, hairStyle: 'coque', species: 'humana', height: 16, apron: true },
  { id: 'w2', skin: SKIN[3], hair: HAIR[5], cloth: P.night2, cloth2: P.cream, hat: 'flor', hatColor: P.red2, hairStyle: 'tranca', species: 'humana', height: 16, apron: true },
  { id: 'w3', skin: SKIN[1], hair: HAIR[1], cloth: P.copper1, cloth2: P.cream, hat: 'boina', hatColor: P.green1, hairStyle: 'curto', species: 'elfa', height: 16, apron: true },
  { id: 'w4', skin: SKIN[4], hair: HAIR[7], cloth: P.amber0, cloth2: P.cream, hat: 'nenhum', hatColor: P.purple1, hairStyle: 'espetado', species: 'goblin', height: 14, apron: true },
  { id: 'w5', skin: SKIN[0], hair: HAIR[4], cloth: P.red1, cloth2: P.cream, hat: 'capuz', hatColor: P.red0, hairStyle: 'longo', species: 'humana', height: 16, apron: true },
  { id: 'w6', skin: SKIN[2], hair: HAIR[6], cloth: P.purple1, cloth2: P.cream, hat: 'nenhum', hatColor: P.purple1, hairStyle: 'coque', species: 'elfa', height: 16, apron: true },
];

export function workerLook(i: number): Look {
  return WORKER_LOOKS[i % WORKER_LOOKS.length];
}

const SPECIES_LIST: Species[] = ['humana', 'elfa', 'goblin', 'anao', 'espectro', 'sapo', 'fauna'];
const HATS: HatKind[] = ['nenhum', 'capuz', 'boina', 'tiara', 'elmo', 'flor', 'nenhum'];
const STYLES: HairStyle[] = ['curto', 'longo', 'coque', 'careca', 'tranca', 'espetado'];

export function clientLook(species: number, palette: number, seed: number): Look {
  const sp = SPECIES_LIST[species % SPECIES_LIST.length];
  const r = (n: number) => Math.abs((seed * 9301 + n * 49297) % 233280) % 1000;
  let skin = SKIN[r(1) % 4];
  if (sp === 'goblin') skin = SKIN[4];
  if (sp === 'espectro') skin = SKIN[5];
  if (sp === 'sapo') skin = SKIN[6];
  if (sp === 'fauna') skin = SKIN[7];
  return {
    id: `c${species}-${palette}-${seed}`,
    skin,
    hair: HAIR[r(2) % HAIR.length],
    cloth: CLOTH[palette % CLOTH.length],
    cloth2: CLOTH[(palette + 3) % CLOTH.length],
    hat: sp === 'espectro' ? 'nenhum' : HATS[r(3) % HATS.length],
    hatColor: CLOTH[(palette + 5) % CLOTH.length],
    hairStyle: sp === 'sapo' || sp === 'espectro' ? 'careca' : STYLES[r(4) % STYLES.length],
    species: sp,
    height: sp === 'anao' ? 14 : sp === 'goblin' ? 14 : sp === 'elfa' ? 19 : 17,
    beard: sp === 'anao' || (sp === 'humana' && r(5) % 5 === 0),
    glasses: r(6) % 7 === 0,
  };
}

const charCache = new Map<string, HTMLCanvasElement>();

/**
 * Desenha (com cache) um personagem. Retorna um canvas 24x34 com os pés em (12, 31).
 */
export function characterSprite(look: Look, action: Action, frame: number, facing: 1 | -1): HTMLCanvasElement {
  const key = `${look.id}|${action}|${frame % 4}|${facing}`;
  const hit = charCache.get(key);
  if (hit) return hit;
  const [c, ctx] = makeCanvas(24, 34);
  if (facing < 0) {
    ctx.translate(24, 0);
    ctx.scale(-1, 1);
  }
  drawCharacter(ctx, 12, 31, look, action, frame % 4);
  if (charCache.size > 1500) charCache.clear();
  charCache.set(key, c);
  return c;
}

function drawCharacter(ctx: Ctx, cx: number, fy: number, L: Look, action: Action, f: number): void {
  const O = P.outline;
  const ghost = L.species === 'espectro';
  const walking = action === 'walk' || action === 'carry';
  const bob = walking ? (f % 2) : action === 'happy' ? (f % 2) * -1 : action === 'idle' && f === 2 ? 1 : 0;
  const H = L.height;
  const legH = L.species === 'anao' || L.species === 'goblin' ? 2 : 3;
  const bodyH = H - 6 - legH;
  const top = fy - H + bob; // topo da cabeça
  const headY = top;
  const bodyY = top + 6;
  // pernas
  if (!ghost) {
    const lx = cx - 3;
    const rx = cx + 1;
    const lOff = walking ? (f % 2 === 0 ? -1 : 1) : 0;
    const legColor = L.species === 'fauna' ? '#6a4a2a' : P.iron1;
    px(ctx, lx - 1 + lOff, fy - legH - 1, 4, legH + 2, O);
    px(ctx, lx + lOff, fy - legH, 2, legH, legColor);
    px(ctx, rx - 1 - lOff, fy - legH - 1, 4, legH + 2, O);
    px(ctx, rx - lOff, fy - legH, 2, legH, legColor);
    if (L.species === 'fauna') {
      px(ctx, lx + lOff, fy - 1, 2, 1, P.iron0);
      px(ctx, rx - lOff, fy - 1, 2, 1, P.iron0);
    }
  }
  // corpo (manto em trapézio)
  for (let i = 0; i < bodyH; i++) {
    const w = 3 + Math.floor((i * 3) / Math.max(1, bodyH - 1));
    px(ctx, cx - w - 1, bodyY + i, w * 2 + 2, 1, O);
  }
  px(ctx, cx - 3, bodyY - 1, 6, 1, O);
  for (let i = 0; i < bodyH; i++) {
    const w = 3 + Math.floor((i * 3) / Math.max(1, bodyH - 1));
    px(ctx, cx - w, bodyY + i, w * 2, 1, ghost ? 'rgba(207,230,242,0.75)' : L.cloth);
    if (i > 1) px(ctx, cx - w, bodyY + i, 1, 1, shade(L.cloth));
  }
  if (ghost) {
    // cauda ondulante
    for (let k = -4; k <= 4; k += 2) px(ctx, cx + k, fy - 2 + ((k + f) % 2), 2, 2, 'rgba(207,230,242,0.6)');
  }
  // detalhe: faixa/avental
  if (L.apron) {
    px(ctx, cx - 2, bodyY + 2, 4, bodyH - 2, P.cream);
    px(ctx, cx - 2, bodyY + 2, 4, 1, P.paperDark);
  } else {
    px(ctx, cx - 3, bodyY + 3, 6, 1, L.cloth2);
  }
  // braços
  const armY = bodyY + 1;
  let la = 0;
  let ra = 0;
  if (action === 'work') {
    la = f % 2 === 0 ? -2 : 0;
    ra = f % 2 === 0 ? 0 : -2;
  } else if (action === 'cast') {
    ra = -3;
  } else if (action === 'happy') {
    la = -3;
    ra = -3;
  } else if (action === 'angry') {
    la = -1;
    ra = -1;
  } else if (action === 'carry') {
    la = -1;
    ra = -1;
  }
  const armC = ghost ? 'rgba(207,230,242,0.7)' : shade(L.cloth);
  px(ctx, cx - 6, armY + la - 1, 3, 5, O);
  px(ctx, cx - 5, armY + la, 1, 3, armC);
  px(ctx, cx - 5, armY + la + 3, 1, 1, L.skin);
  px(ctx, cx + 3, armY + ra - 1, 3, 5, O);
  px(ctx, cx + 4, armY + ra, 1, 3, armC);
  px(ctx, cx + 4, armY + ra + 3, 1, 1, L.skin);
  if (action === 'carry') {
    // frasco nas mãos
    px(ctx, cx - 2, armY + 2, 4, 4, O);
    px(ctx, cx - 1, armY + 3, 2, 2, P.green2);
  }
  if (action === 'cast') {
    px(ctx, cx + 5, armY - 4, 1, 1, P.amber3);
    px(ctx, cx + 6, armY - 5, 1, 1, P.purple4);
  }
  // cabeça
  const hw = L.species === 'sapo' ? 8 : 6;
  const hx = cx - hw / 2;
  px(ctx, hx - 1, headY - 1, hw + 2, 8, O);
  px(ctx, hx, headY, hw, 6, L.skin);
  px(ctx, hx, headY + 5, hw, 1, shade(L.skin));
  // orelhas
  if (L.species === 'elfa' || L.species === 'goblin') {
    px(ctx, hx - 3, headY + 1, 3, 2, O);
    px(ctx, hx - 2, headY + 2, 2, 1, L.skin);
    px(ctx, hx + hw, headY + 1, 3, 2, O);
    px(ctx, hx + hw, headY + 2, 2, 1, L.skin);
  }
  if (L.species === 'fauna') {
    px(ctx, hx, headY - 3, 1, 3, P.paperDark);
    px(ctx, hx + hw - 1, headY - 3, 1, 3, P.paperDark);
  }
  // rosto (olhando para a direita)
  const eyeY = headY + 2;
  if (action === 'sleep') {
    px(ctx, hx + 2, eyeY + 1, 2, 1, O);
    px(ctx, hx + 4, eyeY + 1, 1, 1, O);
  } else if (L.species === 'sapo') {
    px(ctx, hx + 1, headY - 1, 2, 2, P.white);
    px(ctx, hx + 5, headY - 1, 2, 2, P.white);
    px(ctx, hx + 2, headY, 1, 1, O);
    px(ctx, hx + 6, headY, 1, 1, O);
    px(ctx, hx + 2, headY + 4, 4, 1, shade(L.skin));
  } else {
    px(ctx, hx + 2, eyeY, 1, 2, ghost ? P.night1 : O);
    px(ctx, hx + 4, eyeY, 1, 2, ghost ? P.night1 : O);
    if (action === 'happy') px(ctx, hx + 2, eyeY + 3, 3, 1, P.red1);
    if (action === 'angry') {
      px(ctx, hx + 1, eyeY - 1, 2, 1, O);
      px(ctx, hx + 4, eyeY - 1, 2, 1, O);
      px(ctx, hx + 2, eyeY + 3, 3, 1, O);
    }
    px(ctx, hx + 1, eyeY + 2, 1, 1, 'rgba(224,72,90,0.45)');
  }
  if (L.glasses) {
    px(ctx, hx + 1, eyeY, 2, 1, P.gold1);
    px(ctx, hx + 4, eyeY, 2, 1, P.gold1);
  }
  if (L.beard) {
    px(ctx, hx, headY + 4, hw, 3, L.hair === '#d8d8e0' ? P.white : L.hair);
    px(ctx, hx + 1, headY + 7, hw - 2, 1, L.hair);
  }
  // cabelo
  const hair = L.hair;
  switch (L.hairStyle) {
    case 'curto':
      px(ctx, hx, headY, hw, 2, hair);
      px(ctx, hx, headY + 2, 1, 1, hair);
      break;
    case 'longo':
      px(ctx, hx - 1, headY - 1, hw + 2, 2, hair);
      px(ctx, hx - 1, headY + 1, 2, 8, hair);
      px(ctx, hx + hw - 1, headY + 1, 2, 7, hair);
      break;
    case 'coque':
      px(ctx, hx, headY, hw, 2, hair);
      px(ctx, hx - 2, headY - 1, 3, 3, hair);
      break;
    case 'tranca':
      px(ctx, hx, headY, hw, 2, hair);
      px(ctx, hx - 1, headY + 2, 2, 7, hair);
      px(ctx, hx - 1, headY + 9, 2, 1, P.red2);
      break;
    case 'espetado':
      px(ctx, hx, headY - 1, hw, 2, hair);
      px(ctx, hx + 1, headY - 2, 1, 1, hair);
      px(ctx, hx + 4, headY - 2, 1, 1, hair);
      break;
    case 'careca':
      break;
  }
  // chapéus
  const hc = L.hatColor;
  switch (L.hat) {
    case 'bruxa':
    case 'bruxa_velha': {
      const tall = 9;
      px(ctx, hx - 3, headY - 1, hw + 6, 3, O);
      px(ctx, hx - 2, headY, hw + 4, 1, hc);
      for (let i = 0; i < tall; i++) {
        const w = Math.max(1, Math.round((hw - 1) * (1 - i / tall)));
        const off = L.hat === 'bruxa_velha' && i > tall - 4 ? -(i - (tall - 4)) : 0;
        px(ctx, cx - w / 2 - 1 + off, headY - 2 - i, w + 2, 1, O);
        px(ctx, cx - w / 2 + off, headY - 2 - i, w, 1, hc);
      }
      px(ctx, hx, headY - 2, hw, 1, L.hat === 'bruxa' ? P.purple3 : P.amber2);
      if (L.hat === 'bruxa') px(ctx, cx + 1, headY - 4, 1, 1, P.amber2);
      break;
    }
    case 'capuz':
      px(ctx, hx - 2, headY - 2, hw + 4, 4, O);
      px(ctx, hx - 1, headY - 1, hw + 2, 2, hc);
      px(ctx, hx - 1, headY + 1, 1, 5, hc);
      px(ctx, hx + hw, headY + 1, 1, 5, hc);
      break;
    case 'boina':
      px(ctx, hx - 1, headY - 2, hw + 3, 3, O);
      px(ctx, hx, headY - 1, hw + 1, 1, hc);
      px(ctx, cx, headY - 3, 1, 1, O);
      break;
    case 'tiara':
      px(ctx, hx, headY - 1, hw, 1, hc);
      px(ctx, cx - 1, headY - 2, 2, 1, P.red2);
      break;
    case 'elmo':
      px(ctx, hx - 1, headY - 2, hw + 2, 4, O);
      px(ctx, hx, headY - 1, hw, 2, P.iron3);
      px(ctx, cx - 1, headY - 4, 2, 2, P.red1);
      break;
    case 'flor':
      px(ctx, hx + hw - 2, headY - 1, 2, 2, hc);
      px(ctx, hx + hw - 1, headY - 2, 1, 1, P.amber2);
      break;
    case 'nenhum':
      break;
  }
}

function shade(hex: string): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 40);
  const g = Math.max(0, ((n >> 8) & 255) - 40);
  const b = Math.max(0, (n & 255) - 30);
  return `rgb(${r},${g},${b})`;
}

export function lighten(hex: string, amt = 50): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amt);
  const g = Math.min(255, ((n >> 8) & 255) + amt);
  const b = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

// ------------------------------------------------------------------ frascos e itens

export function drawFlask(ctx: Ctx, x: number, y: number, color: string, shape: number = 0): void {
  // x,y = base central do frasco (7x9)
  const O = P.outline;
  if (shape === 1) {
    // frasco redondo
    ellipse(ctx, x, y - 3, 4, 3, O);
    ellipse(ctx, x, y - 3, 3, 2, color);
    px(ctx, x - 1, y - 9, 3, 4, O);
    px(ctx, x, y - 8, 1, 3, P.ice3);
    px(ctx, x - 2, y - 4, 1, 1, P.white);
  } else if (shape === 2) {
    // frasco alto
    px(ctx, x - 3, y - 9, 6, 10, O);
    px(ctx, x - 2, y - 6, 4, 6, color);
    px(ctx, x - 2, y - 8, 4, 2, P.ice2);
    px(ctx, x - 2, y - 6, 1, 4, lighten(color));
    px(ctx, x - 1, y - 10, 2, 1, P.wood3);
  } else {
    px(ctx, x - 3, y - 6, 7, 7, O);
    px(ctx, x - 2, y - 5, 5, 5, color);
    px(ctx, x - 1, y - 9, 3, 4, O);
    px(ctx, x, y - 8, 1, 3, P.ice2);
    px(ctx, x - 2, y - 4, 1, 2, lighten(color));
    px(ctx, x - 1, y - 10, 3, 1, P.wood3);
  }
}

/** Kit de ingredientes preparados (tigela com ervas) — o estoque em processo antes da fervura. */
export function drawKit(ctx: Ctx, x: number, y: number, color: string, wilted = false): void {
  const O = P.outline;
  px(ctx, x - 4, y - 4, 9, 5, O);
  px(ctx, x - 3, y - 3, 7, 3, P.wood2);
  px(ctx, x - 3, y - 3, 7, 1, P.wood3);
  const g = wilted ? '#6a6a3a' : P.green2;
  px(ctx, x - 2, y - 5, 2, 2, g);
  px(ctx, x + 1, y - 6, 2, 3, color);
  px(ctx, x - 1, y - 6, 1, 1, wilted ? '#8a7a4a' : P.green3);
}

export function drawCoin(ctx: Ctx, x: number, y: number, f = 0): void {
  const w = [3, 2, 1, 2][f % 4];
  px(ctx, x - w - 1, y - 4, w * 2 + 2, 7, P.outline);
  px(ctx, x - w, y - 3, w * 2, 5, P.gold1);
  if (w > 1) px(ctx, x - w, y - 3, 1, 3, P.gold2);
}

// ------------------------------------------------------------------ ícones da interface

const ICONS: Record<string, string[]> = {
  coin: ['..oooo..', '.oyyyyo.', 'oyYyyyyo', 'oyYyoyyo', 'oyYyoyyo', 'oyyyyyyo', '.oyyyyo.', '..oooo..'],
  heart: ['.oo..oo.', 'orroorro', 'oRrrrrro', 'oRrrrrro', '.orrrro.', '..orro..', '...oo...', '........'],
  clock: ['..oooo..', '.ocwwco.', 'ocwwowco', 'owwwowwo', 'owwwoowo', 'ocwwwwco', '.ocwwco.', '..oooo..'],
  flask: ['..oooo..', '...ow o.'.replace(' ', 'o'), '...oio..', '..oiio..', '.oggggo.', 'oggGgggo', 'ogggggGo', '.oooooo.'],
  scroll: ['.oooooo.', 'opppppPo', '.opkkpo.', '.oppppo.', '.opkkpo.', '.oppppo.', 'opppppPo', '.oooooo.'],
  bag: ['..oooo..', '.ob..bo.', '.oooooo.', 'obbbbbbo', 'obBbbbbo', 'obbbybbo', 'obbbbbbo', '.oooooo.'],
  flow: ['........', 'oo...o..', 'ggo..oo.', 'oogggggo', 'ggggggo.', 'oo...oo.', '.....o..', '........'],
  hammer: ['.ooooo..', 'oiiiiio.', 'oiIiiio.', '.oooio..', '...obo..', '...obo..', '...obo..', '...ooo..'],
  chart: ['o.......', 'o....oo.', 'o....gg.', 'o.oo.gg.', 'o.pp.gg.', 'o.pp.gg.', 'oooooooo', '........'],
  book: ['oooooo..', 'oPpppPo.', 'oPpyypo.', 'oPppppo.', 'oPpyypo.', 'oPppppo.', 'oPppppoo', '.oooooo.'],
  gear: ['..o..o..', '.oiooio.', 'oiiiiiio', '.iio.ii.', '.iio.ii.', 'oiiiiiio', '.oiooio.', '..o..o..'],
  star: ['...oo...', '...yy...', 'ooyyyyoo', '.oyYyyo.', '..oyyo..', '.oyooyo.', '.oo..oo.', '........'],
  lock: ['..oooo..', '.o....o.', '.o....o.', 'oooooooo', 'oyyyyyyo', 'oyyooyyo', 'oyyyyyyo', 'oooooooo'],
  crystal: ['...o....', '..ooo...', '.ocpco..', 'ocpPpco.', 'ocpppco.', '.ocpco..', '..ooo...', '...o....'],
  drum: ['.oooooo.', 'oRRRRRRo', 'orrrrrro', 'oyoyoyoo', 'orrrrrro', 'orrrrrro', '.oooooo.', '........'],
  bell: ['...oo...', '..oyyo..', '.oyyyyo.', '.oyyyyo.', '.oyyyyo.', 'oyyyyyyo', 'oooooooo', '...oo...'],
  warn: ['...oo...', '..oyyo..', '..oyoy..'.replace('oy..', 'oyo.'), '.oyyoyo.', '.oyyoyyo', 'oyyyyyyo', 'oyyoyyyo', 'oooooooo'],
  check: ['........', '......go', '.....ggo', 'o...ggo.', 'gg.ggo..', '.gggo...', '..go....', '........'],
  cross: ['........', 'ro....ro', '.ro..ro.', '..rrro..', '..rrro..', '.ro..ro.', 'ro....ro', '........'],
  people: ['.oo..oo.', 'owwooww.', 'owwooww.', '.oo..oo.', 'obbooppo', 'obbooppo', 'obbooppo', '........'],
  hat: ['....o...', '...opo..', '...opo..', '..oppo..', '..oppyo.', '.opppppo', 'oooooooo', '........'],
  pause: ['........', '.oo..oo.', '.ow..ow.', '.ow..ow.', '.ow..ow.', '.ow..ow.', '.oo..oo.', '........'],
  play: ['.o......', '.owo....', '.owwo...', '.owwwo..', '.owwwo..', '.owwo...', '.owo....', '.o......'],
  restart: ['..oooo..', '.o....o.', 'o......o', 'o....ooo', 'o.....oo', '.o....o.', '..oooo..', '........'],
  sound: ['...o....', '..oo..o.', 'oooo.o..', 'owwo.o.o', 'owwo.o.o', 'oooo.o..', '..oo..o.', '...o....'],
  mute: ['...o....', '..oo....', 'oooo.r.r', 'owwo..r.', 'owwo..r.', 'oooo.r.r', '..oo....', '...o....'],
  eye: ['........', '..oooo..', '.ow..wo.', 'ow.oo.wo', 'ow.oo.wo', '.ow..wo.', '..oooo..', '........'],
  door: ['.oooooo.', 'obbbbbbo', 'obBbbbbo', 'obbbbbbo', 'obbbbyb.'.replace('b.', 'bo'), 'obbbbbbo', 'obbbbbbo', 'oooooooo'],
};

const ICON_COLORS: Record<string, string> = {
  o: P.outline,
  y: P.gold1,
  Y: P.gold2,
  r: P.red2,
  R: '#ff8a96',
  w: P.cream,
  c: P.paperDark,
  g: P.green2,
  G: P.green3,
  i: P.iron3,
  I: '#8a88a0',
  p: P.purple3,
  P: P.purple4,
  k: P.wood1,
  b: P.wood2,
  B: P.wood3,
};

const iconCache = new Map<string, string>();

/** Ícone de pixel art como data URL (8x8 ampliado 4x). */
export function iconUrl(name: string, scale = 4): string {
  const key = name + scale;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const map = ICONS[name] || ICONS.star;
  const [c, ctx] = makeCanvas(8 * scale, 8 * scale);
  map.forEach((row, y) => {
    for (let x = 0; x < 8; x++) {
      const ch = row[x];
      if (!ch || ch === '.') continue;
      ctx.fillStyle = ICON_COLORS[ch] || P.outline;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

export function iconImg(name: string, cls = 'ico'): string {
  return `<img class="${cls}" src="${iconUrl(name)}" alt="" aria-hidden="true">`;
}

/** Retrato grande (para diálogos) desenhado a partir do personagem, ampliado. */
const portraitCache = new Map<string, string>();
export function portraitUrl(look: Look, action: Action = 'idle'): string {
  const key = look.id + action;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const spr = characterSprite(look, action, 0, 1);
  const [c, ctx] = makeCanvas(24 * 4, 34 * 4);
  ctx.drawImage(spr, 0, 0, 24 * 4, 34 * 4);
  const url = c.toDataURL();
  portraitCache.set(key, url);
  return url;
}

/** Ícone de frasco de uma receita (para listas e cartões). */
const flaskCache = new Map<string, string>();
export function flaskUrl(color: string, shape = 0): string {
  const key = color + shape;
  const hit = flaskCache.get(key);
  if (hit) return hit;
  const [c, ctx] = makeCanvas(12, 12);
  drawFlask(ctx, 6, 11, color, shape);
  const [big, bctx] = makeCanvas(36, 36);
  bctx.drawImage(c, 0, 0, 36, 36);
  const url = big.toDataURL();
  flaskCache.set(key, url);
  return url;
}
