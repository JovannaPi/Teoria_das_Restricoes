// Cena animada da oficina. Lê o estado da simulação e desenha; nunca altera regras.
import { RECIPES } from '../data/recipes';
import { STATION_ORDER } from '../data/stations';
import { UPGRADES } from '../data/upgrades';
import type { Order, RecipeId, SimNotice, SimState, StationId } from '../sim/types';
import { renderBackground } from './background';
import {
  COUNTER_FRONT,
  DOOR,
  H,
  inRect,
  LAYOUT,
  LINA_HOME,
  MENTOR_SPOT,
  SHELF,
  W,
  WAITING_AREA,
  WALK_AREA,
} from './layout';
import { P } from './palette';
import { findPath, slide } from './walk';
import {
  Action,
  box,
  characterSprite,
  clientLook,
  drawCoin,
  drawFlask,
  drawKit,
  ellipse,
  lighten,
  Look,
  LOOKS,
  px,
  workerLook,
  type Ctx,
} from './sprites';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: 'bubble' | 'steam' | 'spark' | 'frost' | 'coin' | 'smoke' | 'drop' | 'leaf' | 'star';
  color: string;
}

interface Carrier {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  color: string;
}

interface Walker {
  x: number;
  y: number;
  tx: number;
  ty: number;
  facing: 1 | -1;
  speed: number;
}

interface ClientActor extends Walker {
  order: number;
  look: Look;
  state: 'entrando' | 'esperando' | 'saindo';
  mood: 'neutro' | 'feliz' | 'bravo';
  bubbleUntil: number;
}

export type Pick =
  | { kind: 'station'; id: StationId }
  | { kind: 'client'; order: number }
  | { kind: 'npc'; id: string }
  | { kind: 'lina' }
  | { kind: 'floor'; x: number; y: number };

/** Personagem fixo com quem a bruxa pode conversar: a mentora ou a equipe de uma estação. */
export interface Npc {
  id: string; // 'mentora' ou 'aprendiz:<estação>'
  station: StationId | null;
  x: number;
  y: number;
}

/** Distância (px lógicos) a partir da qual dá para conversar sem andar. */
export const TALK_RANGE = 34;

export interface SceneView {
  selected: StationId | null;
  hover: StationId | null;
  showDrum: boolean;
  highlight: StationId | null; // destaque do tutorial
  talkAlert?: string | null; // personagem com uma dica nova (balão "!")
}

function stationStopped(s: SimState, id: StationId) {
  const st = s.stations[id];
  if (st.paused) return 'pausada';
  if (s.t < st.downUntil) return st.downReason || 'manutenção';
  if (s.t < st.breakUntil) return 'intervalo';
  return null;
}

export class ShopScene {
  readonly ctx: Ctx;
  private bg: HTMLCanvasElement;
  private particles: Particle[] = [];
  private carriers: Carrier[] = [];
  private clients = new Map<number, ClientActor>();
  private leaving: ClientActor[] = [];
  lina: Walker & {
    helpTarget: StationId | null;
    arrived: boolean;
    onArrive: (() => void) | null;
    action: Action;
    path: { x: number; y: number }[];
    realTime: boolean; // passeio do jogador anda em tempo real; ajudar uma estação custa tempo da loja
    steer: { x: number; y: number } | null; // arrastando o dedo / setas do teclado
    steering: boolean;
  } = {
    x: LINA_HOME.x,
    y: LINA_HOME.y,
    tx: LINA_HOME.x,
    ty: LINA_HOME.y,
    facing: 1,
    speed: 55,
    helpTarget: null,
    arrived: true,
    onArrive: null,
    action: 'idle',
    path: [],
    realTime: false,
    steer: null,
    steering: false,
  };
  private cat = { x: 260, y: 230, tx: 260, ty: 230, facing: 1 as 1 | -1, speed: 22, nap: 0 };
  private idleSince: Record<StationId, number> = {} as Record<StationId, number>;
  private flash: { station: StationId; until: number; color: string }[] = [];
  private time = 0;
  /** Efeitos reduzidos: aparelhos modestos ou "reduzir animações" ligado. */
  lowFx = detectLowEnd();
  floatTexts: { x: number; y: number; text: string; cls: string; born: number }[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.bg = renderBackground();
    for (const id of STATION_ORDER) this.idleSince[id] = 0;
  }

  reset(): void {
    this.particles = [];
    this.carriers = [];
    this.clients.clear();
    this.leaving = [];
    this.flash = [];
    this.floatTexts = [];
    Object.assign(this.lina, { x: LINA_HOME.x, y: LINA_HOME.y, tx: LINA_HOME.x, ty: LINA_HOME.y, helpTarget: null, arrived: true, onArrive: null, path: [], steer: null, steering: false });
  }

  // ------------------------------------------------------------ entrada

  /** Mentora e uma pessoa de cada estação aberta (quem estiver desenhado). */
  npcs(s: SimState): Npc[] {
    const out: Npc[] = [{ id: 'mentora', station: null, x: MENTOR_SPOT.x, y: MENTOR_SPOT.y }];
    for (const id of STATION_ORDER) {
      const st = s.stations[id];
      if (st.locked) continue;
      const n = Math.min(LAYOUT[id].workers.length, st.slots);
      for (let k = 0; k < n; k++) out.push({ id: `aprendiz:${id}`, station: id, x: LAYOUT[id].workers[k].x, y: LAYOUT[id].workers[k].y });
    }
    return out;
  }

  /**
   * O que está sob o ponto (x, y) da cena. `tol` (px lógicos) amplia as áreas de toque: vale o que
   * estiver exatamente sob o dedo (pessoas antes de móveis); se nada estiver, o alvo mais próximo
   * dentro da tolerância.
   */
  pick(x: number, y: number, s: SimState, tol = 0): Pick {
    let best: Pick | null = null;
    let bestD = Infinity;
    // corpo de um personagem: ~7 px para cada lado dos pés, 22 px de altura
    const body = (cx: number, cy: number, half = 7) => {
      const dx = Math.max(0, Math.abs(cx - x) - half);
      const dy = y < cy - 22 ? cy - 22 - y : y > cy + 2 ? y - cy - 2 : 0;
      return Math.hypot(dx, dy);
    };
    const consider = (d: number, p: Pick) => {
      if (d <= tol && d < bestD) {
        bestD = d;
        best = p;
      }
    };
    const l = this.lina;
    const dl = body(l.x, l.y, 8);
    if (dl === 0) return { kind: 'lina' };
    consider(dl, { kind: 'lina' });
    for (const c of this.clients.values()) {
      const d = body(c.x, c.y);
      if (d === 0) return { kind: 'client', order: c.order };
      consider(d, { kind: 'client', order: c.order });
    }
    for (const n of this.npcs(s)) {
      const d = body(n.x, n.y, 6);
      if (d === 0) return { kind: 'npc', id: n.id };
      consider(d, { kind: 'npc', id: n.id });
    }
    for (const id of [...STATION_ORDER].reverse()) {
      if (s.stations[id].locked) continue;
      const r = LAYOUT[id].hit;
      if (inRect(r, x, y)) return { kind: 'station', id };
      const dx = x < r.x ? r.x - x : x > r.x + r.w ? x - r.x - r.w : 0;
      const dy = y < r.y ? r.y - y : y > r.y + r.h ? y - r.y - r.h : 0;
      consider(Math.hypot(dx, dy), { kind: 'station', id });
    }
    return best ?? { kind: 'floor', x, y };
  }

  /** Personagem mais perto da bruxa dentro do alcance de conversa (ou null). */
  nearNpc(s: SimState, range = TALK_RANGE): Npc | null {
    let best: Npc | null = null;
    let bd = range;
    for (const n of this.npcs(s)) {
      const d = Math.hypot(n.x - this.lina.x, (n.y - this.lina.y) * 1.3);
      if (d <= bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Arrastar o dedo (ou segurar as setas): a bruxa vai na direção do ponto, escorregando nos móveis. */
  steerLina(x: number | null, y = 0): void {
    const l = this.lina;
    if (x == null) {
      l.steer = null;
      return;
    }
    l.steer = { x, y };
    l.path = [];
    l.onArrive = null;
    l.helpTarget = null;
    l.arrived = true;
  }

  walkLina(x: number, y: number, onArrive: (() => void) | null = null, helpTarget: StationId | null = null, realTime = false): void {
    const l = this.lina;
    l.steer = null;
    const tx = Math.max(WALK_AREA.x, Math.min(WALK_AREA.x + WALK_AREA.w, x));
    const ty = Math.max(WALK_AREA.y, Math.min(WALK_AREA.y + WALK_AREA.h, y));
    // contorna os móveis em vez de atravessá-los
    l.path = findPath(l.x, l.y, tx, ty);
    const first = l.path.shift() ?? { x: tx, y: ty };
    l.tx = first.x;
    l.ty = first.y;
    l.onArrive = onArrive;
    l.helpTarget = helpTarget;
    l.realTime = realTime;
    l.arrived = false;
  }

  // ------------------------------------------------------------ notificações da simulação

  handleNotice(n: SimNotice, s: SimState): void {
    switch (n.type) {
      case 'job-move': {
        if (!n.from) return;
        const a = LAYOUT[n.from].out;
        const b = n.to === 'prateleira' ? SHELF : rectCenter(LAYOUT[n.to].queue);
        if (this.carriers.length < 24) this.carriers.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, t: 0, dur: 0.55, color: RECIPES[n.recipe].color });
        break;
      }
      case 'delivered': {
        const c = this.clients.get(n.order);
        for (let i = 0; i < 5; i++)
          this.particles.push({ x: 140, y: 222, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 25, life: 0, max: 0.9, kind: 'coin', color: P.gold1 });
        this.floatTexts.push({ x: 140, y: 210, text: `+${Math.round(n.amount)}`, cls: n.late ? 'late' : 'gain', born: this.time });
        if (c) c.bubbleUntil = this.time + 1.5;
        break;
      }
      case 'failure': {
        const l = LAYOUT[n.station].center;
        for (let i = 0; i < 10; i++)
          this.particles.push({ x: l.x + (Math.random() - 0.5) * 16, y: l.y - 10, vx: (Math.random() - 0.5) * 14, vy: -12 - Math.random() * 10, life: 0, max: 1.4, kind: 'smoke', color: '#3a3040' });
        this.flash.push({ station: n.station, until: this.time + 0.8, color: P.red2 });
        this.floatTexts.push({ x: l.x, y: l.y - 22, text: 'refugo', cls: 'bad', born: this.time });
        break;
      }
      case 'upgrade-ready': {
        const l = LAYOUT[n.station].center;
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2;
          this.particles.push({ x: l.x, y: l.y - 10, vx: Math.cos(a) * 40, vy: Math.sin(a) * 25, life: 0, max: 1.1, kind: 'star', color: i % 2 ? P.amber3 : P.purple4 });
        }
        this.flash.push({ station: n.station, until: this.time + 1.2, color: P.amber2 });
        break;
      }
      case 'stock-arrived':
        this.floatTexts.push({ x: 60, y: 80, text: `+${n.qty}`, cls: 'info', born: this.time });
        break;
      case 'event': {
        if (n.event.station) this.flash.push({ station: n.event.station, until: this.time + 1.5, color: P.purple4 });
        break;
      }
      default:
        break;
    }
    void s;
  }

  // ------------------------------------------------------------ atualização

  update(dtReal: number, s: SimState, gameDt: number): void {
    this.time += dtReal;
    // Lina anda em tempo de jogo: deslocar-se até uma estação custa tempo da loja
    const l = this.lina;
    l.steering = false;
    if (l.steer) {
      const dx = l.steer.x - l.x;
      const dy = l.steer.y - l.y;
      const d = Math.hypot(dx, dy);
      if (d > 1.5) {
        const step = Math.min(d, 80 * dtReal);
        const p = slide(l.x, l.y, (dx / d) * step, (dy / d) * step);
        if (Math.abs(p.x - l.x) > 0.01 || Math.abs(p.y - l.y) > 0.01) l.steering = true;
        if (Math.abs(dx) > 0.5) l.facing = dx > 0 ? 1 : -1;
        l.x = l.tx = p.x;
        l.y = l.ty = p.y;
      }
    } else if (!l.arrived) {
      const moved = stepWalker(l, l.realTime ? dtReal * 1.4 : gameDt);
      if (moved) {
        const nxt = l.path.shift();
        if (nxt) {
          l.tx = nxt.x;
          l.ty = nxt.y;
        } else {
          l.arrived = true;
          const cb = l.onArrive;
          l.onArrive = null;
          if (cb) cb();
        }
      }
    }
    // gato
    const c = this.cat;
    if (c.nap > 0) c.nap -= dtReal;
    else if (stepWalker(c, dtReal)) {
      if (Math.random() < 0.4) c.nap = 3 + Math.random() * 5;
      c.tx = 30 + Math.random() * 420;
      c.ty = 140 + Math.random() * 110;
    }
    this.syncClients(s, dtReal);
    for (const cr of this.carriers) cr.t += dtReal;
    this.carriers = this.carriers.filter((cr) => cr.t < cr.dur);
    // emissores por estação
    const mods = gameDt > 0;
    for (const id of STATION_ORDER) {
      const st = s.stations[id];
      if (st.active.length > 0 && !stationStopped(s, id)) {
        this.idleSince[id] = s.t;
        if (mods && (!this.lowFx || Math.random() < 0.4)) this.emit(id, s, dtReal);
      }
    }
    for (const p of this.particles) {
      p.life += dtReal;
      p.x += p.vx * dtReal;
      p.y += p.vy * dtReal;
      if (p.kind === 'coin') p.vy += 90 * dtReal;
      if (p.kind === 'steam' || p.kind === 'smoke') p.vx *= 0.98;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    const cap = this.lowFx ? 120 : 400;
    if (this.particles.length > cap) this.particles.splice(0, this.particles.length - cap);
    this.floatTexts = this.floatTexts.filter((f) => this.time - f.born < 1.6);
  }

  private emit(id: StationId, s: SimState, dt: number) {
    const st = s.stations[id];
    const job = s.jobs[st.active[0].job];
    const color = job ? RECIPES[job.recipe].color : P.green2;
    const L = LAYOUT[id].center;
    const r = Math.random;
    if (id === 'caldeirao') {
      for (let k = 0; k < st.active.length; k++) {
        const cx = k === 0 ? 204 : 262;
        const cy = k === 0 ? 136 : 160;
        if (r() < dt * 14) this.particles.push({ x: cx + (r() - 0.5) * 26, y: cy, vx: 0, vy: -6 - r() * 6, life: 0, max: 0.6, kind: 'bubble', color: lighten(color, 40) });
        if (r() < dt * 5) this.particles.push({ x: cx + (r() - 0.5) * 16, y: cy - 4, vx: (r() - 0.5) * 4, vy: -14 - r() * 6, life: 0, max: 2, kind: 'steam', color: 'rgba(220,210,240,0.35)' });
        if (r() < dt * 3) this.particles.push({ x: cx + (r() - 0.5) * 20, y: cy + 26, vx: (r() - 0.5) * 6, vy: -18, life: 0, max: 0.5, kind: 'spark', color: P.amber2 });
      }
    } else if (id === 'destilacao') {
      if (r() < dt * 3) this.particles.push({ x: 352, y: 104, vx: 0, vy: 20, life: 0, max: 0.5, kind: 'drop', color });
      if (r() < dt * 2) this.particles.push({ x: 322 + (r() - 0.5) * 8, y: 82, vx: 0, vy: -10, life: 0, max: 1.4, kind: 'steam', color: 'rgba(230,200,180,0.3)' });
    } else if (id === 'resfriamento') {
      if (r() < dt * 6) this.particles.push({ x: L.x + (r() - 0.5) * 50, y: L.y - 8 + (r() - 0.5) * 6, vx: (r() - 0.5) * 3, vy: -5, life: 0, max: 1.2, kind: 'frost', color: P.ice3 });
    } else if (id === 'preparo') {
      if (r() < dt * 3) this.particles.push({ x: L.x + (r() - 0.5) * 30, y: L.y - 2, vx: (r() - 0.5) * 18, vy: -14, life: 0, max: 0.7, kind: 'leaf', color: P.green2 });
    } else if (id === 'embalagem') {
      if (r() < dt * 2) this.particles.push({ x: L.x + (r() - 0.5) * 20, y: L.y - 10, vx: (r() - 0.5) * 8, vy: -10, life: 0, max: 0.8, kind: 'star', color: P.amber3 });
    }
  }

  private syncClients(s: SimState, dt: number) {
    const waiting: Order[] = [];
    const accepted: Order[] = [];
    for (const k in s.orders) {
      const o = s.orders[k];
      if (o.status === 'aguardando') waiting.push(o);
      else if (o.status === 'aceito') accepted.push(o);
    }
    waiting.sort((a, b) => a.arrivedAt - b.arrivedAt);
    accepted.sort((a, b) => a.acceptedAt - b.acceptedAt);
    const live = new Set<number>();
    // fila no balcão (aguardando aceite)
    waiting.slice(0, 5).forEach((o, i) => {
      live.add(o.id);
      const a = this.ensureClient(o);
      a.tx = COUNTER_FRONT.x - i * 12;
      a.ty = COUNTER_FRONT.y + (i % 2) * 3;
    });
    // área de espera (pedidos aceitos)
    const cols = 5;
    accepted.slice(0, 15).forEach((o, i) => {
      live.add(o.id);
      const a = this.ensureClient(o);
      a.tx = WAITING_AREA.x + 6 + (i % cols) * 15;
      a.ty = WAITING_AREA.y + 14 + Math.floor(i / cols) * 18;
    });
    for (const [id, a] of this.clients) {
      if (!live.has(id)) {
        const o = s.orders[id];
        this.clients.delete(id);
        if (!o || o.status === 'aguardando' || o.status === 'aceito') continue; // apenas fora do limite visível
        a.state = 'saindo';
        a.mood = o.status === 'concluido' ? (o.late ? 'neutro' : 'feliz') : o.status === 'recusado' ? 'neutro' : 'bravo';
        a.tx = DOOR.x;
        a.ty = DOOR.y;
        a.speed = 50;
        a.bubbleUntil = this.time + 1.6;
        this.leaving.push(a);
      }
    }
    for (const a of this.clients.values()) {
      if (stepWalker(a, dt)) a.state = 'esperando';
    }
    for (const a of this.leaving) stepWalker(a, dt);
    this.leaving = this.leaving.filter((a) => a.x > DOOR.x + 1);
  }

  private ensureClient(o: Order): ClientActor {
    let a = this.clients.get(o.id);
    if (!a) {
      a = {
        order: o.id,
        look: clientLook(o.client.species, o.client.palette, o.client.seed),
        x: DOOR.x,
        y: DOOR.y,
        tx: COUNTER_FRONT.x,
        ty: COUNTER_FRONT.y,
        facing: 1,
        speed: 40,
        state: 'entrando',
        mood: 'neutro',
        bubbleUntil: 0,
      };
      this.clients.set(o.id, a);
    }
    return a;
  }

  clientPosition(order: number): { x: number; y: number } | null {
    const a = this.clients.get(order);
    return a ? { x: a.x, y: a.y } : null;
  }

  // ------------------------------------------------------------ desenho

  draw(s: SimState, view: SceneView): void {
    const ctx = this.ctx;
    ctx.drawImage(this.bg, 0, 0);
    const t = this.time;
    const items: { y: number; draw: () => void }[] = [];

    for (const id of STATION_ORDER) {
      const L = LAYOUT[id];
      items.push({ y: L.center.y + 8, draw: () => this.drawStation(id, s, view) });
      // aprendizes
      const st = s.stations[id];
      if (st.locked) continue;
      const stop = stationStopped(s, id);
      const n = Math.min(L.workers.length, st.slots);
      for (let k = 0; k < n; k++) {
        const w = L.workers[k];
        const busy = k < st.active.length && !stop;
        const idleFor = s.t - this.idleSince[id];
        const action: Action = stop === 'intervalo' ? 'sleep' : busy ? 'work' : idleFor > 4 ? 'sleep' : 'idle';
        const look = workerLook(STATION_ORDER.indexOf(id) * 2 + k);
        items.push({
          y: w.y,
          draw: () => {
            this.drawChar(look, action, w.x, w.y, w.facing, busy ? 8 : 3);
            if (action === 'sleep' && stop !== 'intervalo') this.drawZzz(w.x + 4, w.y - 22);
            if (stop === 'intervalo') this.drawTea(w.x + 6, w.y - 10);
          },
        });
      }
    }
    // mentora e Lina
    items.push({ y: MENTOR_SPOT.y, draw: () => this.drawChar(LOOKS.morgana, 'idle', MENTOR_SPOT.x, MENTOR_SPOT.y, -1, 2) });
    const l = this.lina;
    const linaAction: Action = !l.arrived || l.steering ? 'walk' : s.helper ? 'cast' : 'idle';
    items.push({
      y: l.y,
      draw: () => {
        this.drawChar(LOOKS.lina, linaAction, l.x, l.y, l.facing, linaAction === 'walk' ? 8 : 4);
        if (s.helper && l.arrived && Math.floor(t * 4) % 2 === 0) {
          px(ctx, l.x + 6, l.y - 22, 1, 1, P.amber3);
          px(ctx, l.x + 8, l.y - 25, 1, 1, P.purple4);
        }
      },
    });
    // balões de conversa: "…" em quem está ao alcance da bruxa, "!" em quem tem uma dica nova
    const near = this.nearNpc(s);
    const seen = new Set<string>();
    for (const n of this.npcs(s)) {
      if (seen.has(n.id)) continue;
      const alert = view.talkAlert === n.id;
      if (!alert && near?.id !== n.id) continue;
      seen.add(n.id);
      items.push({ y: 999, draw: () => this.drawTalkBubble(n.x, n.y - 34, alert) });
    }
    // gato
    const c = this.cat;
    items.push({ y: c.y, draw: () => this.drawCat(c.x, c.y, c.facing, c.nap > 0) });
    // clientes
    for (const a of [...this.clients.values(), ...this.leaving]) {
      items.push({ y: a.y, draw: () => this.drawClient(a, s) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    this.drawShelf(s);
    for (const id of STATION_ORDER) this.drawQueue(id, s);
    for (const cr of this.carriers) {
      const k = cr.t / cr.dur;
      const x = cr.x0 + (cr.x1 - cr.x0) * k;
      const y = cr.y0 + (cr.y1 - cr.y0) * k - Math.sin(k * Math.PI) * 14;
      drawFlask(ctx, x, y, cr.color);
    }
    this.drawParticles();
    for (const id of STATION_ORDER) this.drawStationOverlay(id, s, view);
    this.drawLights(s);
  }

  private drawTalkBubble(x: number, y: number, alert: boolean) {
    const ctx = this.ctx;
    const bob = Math.round(Math.sin(this.time * 4) * 1);
    const bx = Math.round(x) - 5;
    const by = Math.round(y) + bob;
    box(ctx, bx, by, 11, 8, alert ? P.amber2 : P.cream);
    px(ctx, bx + 3, by + 8, 2, 2, P.outline);
    px(ctx, bx + 4, by + 8, 1, 1, alert ? P.amber2 : P.cream);
    if (alert) px(ctx, bx + 5, by + 1, 1, 4, P.outline), px(ctx, bx + 5, by + 6, 1, 1, P.outline);
    else for (let k = 0; k < 3; k++) px(ctx, bx + 2 + k * 3, by + 4, 1, 1, P.outline);
  }

  private drawChar(look: Look, action: Action, x: number, y: number, facing: 1 | -1, fps: number) {
    const frame = Math.floor(this.time * fps) % 4;
    const spr = characterSprite(look, action, frame, facing);
    this.ctx.fillStyle = P.shadow;
    ellipse(this.ctx, Math.round(x), Math.round(y), 5, 1, P.shadow);
    this.ctx.drawImage(spr, Math.round(x) - 12, Math.round(y) - 31);
  }

  private drawClient(a: ClientActor, s: SimState) {
    const action: Action = a.state !== 'esperando' ? 'walk' : a.mood === 'bravo' ? 'angry' : 'idle';
    const moodAction: Action = a.state === 'saindo' && a.mood === 'feliz' && this.time < a.bubbleUntil ? 'happy' : action;
    this.drawChar(a.look, a.state === 'saindo' && this.time < a.bubbleUntil - 1 ? moodAction : action, a.x, a.y, a.facing, 6);
    // balão de humor / paciência
    const o = s.orders[a.order];
    if (o && (o.status === 'aguardando' || o.status === 'aceito')) {
      const ratio = o.status === 'aguardando' ? (o.acceptBy - s.t) / s.acceptWindow : (o.dueAt - s.t) / Math.max(1, o.dueAt - o.acceptedAt);
      const w = 10;
      px(this.ctx, a.x - w / 2 - 1, a.y - 26, w + 2, 3, P.outline);
      const col = ratio > 0.5 ? P.green2 : ratio > 0.2 ? P.amber2 : P.red2;
      px(this.ctx, a.x - w / 2, a.y - 25, Math.max(0, Math.round(w * Math.min(1, Math.max(0, ratio)))), 1, ratio < 0 ? P.red2 : col);
      if (o.status === 'aguardando' && Math.floor(this.time * 2) % 2 === 0) {
        box(this.ctx, a.x - 2, a.y - 34, 5, 6, P.cream);
        px(this.ctx, a.x, a.y - 33, 1, 3, P.outline);
        px(this.ctx, a.x, a.y - 29, 1, 1, P.outline);
      }
      if (o.vip) {
        px(this.ctx, a.x - 2, a.y - 30, 5, 2, P.gold1);
        px(this.ctx, a.x - 2, a.y - 31, 1, 1, P.gold2);
        px(this.ctx, a.x + 2, a.y - 31, 1, 1, P.gold2);
      }
    } else if (a.state === 'saindo' && this.time < a.bubbleUntil) {
      box(this.ctx, a.x - 3, a.y - 32, 7, 6, a.mood === 'feliz' ? P.cream : a.mood === 'bravo' ? P.red1 : P.paperDark);
      if (a.mood === 'feliz') {
        px(this.ctx, a.x - 2, a.y - 30, 2, 2, P.red2);
        px(this.ctx, a.x + 1, a.y - 30, 2, 2, P.red2);
        px(this.ctx, a.x - 1, a.y - 28, 3, 1, P.red2);
      } else if (a.mood === 'bravo') {
        px(this.ctx, a.x - 2, a.y - 31, 5, 1, P.outline);
        px(this.ctx, a.x, a.y - 30, 1, 3, P.cream);
      }
    }
  }

  private drawCat(x: number, y: number, facing: 1 | -1, nap: boolean) {
    const ctx = this.ctx;
    const f = Math.floor(this.time * 6) % 2;
    ellipse(ctx, x, y, 5, 1, P.shadow);
    const d = facing;
    if (nap) {
      ellipse(ctx, x, y - 3, 6, 3, P.outline);
      ellipse(ctx, x, y - 3, 5, 2, '#26222e');
      px(ctx, x + 3 * d, y - 6, 2, 2, '#26222e');
      this.drawZzz(x + 4, y - 12);
      return;
    }
    px(ctx, x - 5, y - 7, 10, 5, P.outline);
    px(ctx, x - 4, y - 6, 8, 3, '#26222e');
    px(ctx, x + 3 * d, y - 10, 4, 5, P.outline);
    px(ctx, x + 3 * d + (d > 0 ? 0 : 1), y - 9, 3, 3, '#26222e');
    px(ctx, x + 4 * d + (d > 0 ? 1 : 0), y - 8, 1, 1, P.amber2);
    px(ctx, x + 3 * d, y - 11, 1, 1, P.outline);
    px(ctx, x + 5 * d, y - 11, 1, 1, P.outline);
    px(ctx, x - 6 * d, y - 9 + f, 1, 3, P.outline);
    px(ctx, x - 3, y - 2, 1, 2 - f, P.outline);
    px(ctx, x + 2, y - 2, 1, 1 + f, P.outline);
  }

  private drawZzz(x: number, y: number) {
    const k = Math.floor(this.time * 2) % 3;
    const ctx = this.ctx;
    for (let i = 0; i <= k; i++) {
      const zx = x + i * 3;
      const zy = y - i * 4;
      px(ctx, zx, zy, 3, 1, P.cream);
      px(ctx, zx + 1, zy + 1, 1, 1, P.cream);
      px(ctx, zx, zy + 2, 3, 1, P.cream);
    }
  }

  private drawTea(x: number, y: number) {
    const ctx = this.ctx;
    box(ctx, x, y, 4, 3, P.cream);
    px(ctx, x + 4, y + 1, 1, 1, P.outline);
    if (Math.floor(this.time * 3) % 2) px(ctx, x + 1, y - 3, 1, 2, 'rgba(255,255,255,0.4)');
  }

  // ---------------------------------------------------------------- estações

  private activeColor(s: SimState, id: StationId, k = 0): string | null {
    const task = s.stations[id].active[k];
    if (!task) return null;
    const j = s.jobs[task.job];
    return j ? RECIPES[j.recipe].color : null;
  }

  private drawStation(id: StationId, s: SimState, view: SceneView) {
    const ctx = this.ctx;
    const st = s.stations[id];
    const t = this.time;
    const stop = stationStopped(s, id);
    const busy = st.active.length > 0 && !stop;
    if (st.locked) ctx.globalAlpha = 0.35;
    switch (id) {
      case 'preparo': {
        // bancada longa com tábuas, pilão e ervas
        box(ctx, 26, 104, 76, 10, P.wood2);
        px(ctx, 26, 104, 76, 2, P.wood3);
        px(ctx, 28, 114, 4, 16, P.wood0);
        px(ctx, 96, 114, 4, 16, P.wood0);
        px(ctx, 26, 128, 76, 2, P.wood0);
        for (let k = 0; k < Math.max(2, st.slots); k++) {
          const bx = 32 + k * 26;
          box(ctx, bx, 99, 16, 4, P.wood4);
          const chop = busy && k < st.active.length ? Math.floor(t * 8 + k) % 2 : 0;
          px(ctx, bx + 10, 94 + chop * 2, 1, 5, P.iron3);
          px(ctx, bx + 9, 94 + chop * 2, 3, 1, P.wood0);
          const col = this.activeColor(s, id, k);
          if (col && k < st.active.length) {
            px(ctx, bx + 2, 97, 3, 2, P.green2);
            px(ctx, bx + 5, 97, 2, 2, col);
          }
        }
        // pilão
        box(ctx, 86, 98, 8, 5, P.iron2);
        px(ctx, 90, 93 - (busy ? Math.floor(t * 6) % 2 : 0), 2, 5, P.paperDark);
        if (st.slots > 2) {
          box(ctx, 104, 110, 14, 18, P.wood2);
          px(ctx, 106, 108, 10, 2, P.wood4);
        }
        break;
      }
      case 'caldeirao': {
        this.drawCauldron(204, 160, 1, busy && st.active.length > 0, this.activeColor(s, id, 0), stop, st.setupTime > 0 && st.active[0]?.setupLeft > 0);
        if (st.slots >= 2 || (st.installing && st.installing.upgrade === 'caldeirao_extra')) {
          const installing = !!st.installing && st.installing.upgrade === 'caldeirao_extra';
          if (installing) ctx.globalAlpha = 0.5;
          this.drawCauldron(262, 180, 0.72, busy && st.active.length > 1, this.activeColor(s, id, 1), stop, (st.active[1]?.setupLeft ?? 0) > 0);
          ctx.globalAlpha = st.locked ? 0.35 : 1;
        }
        break;
      }
      case 'destilacao': {
        this.drawAlembic(328, 118, busy, this.activeColor(s, id, 0));
        if (st.slots >= 2 || (st.installing && st.installing.upgrade === 'alambique_duplo')) {
          if (st.installing?.upgrade === 'alambique_duplo') ctx.globalAlpha = 0.5;
          this.drawAlembic(376, 118, busy && st.active.length > 1, this.activeColor(s, id, 1));
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'resfriamento': {
        const n = Math.max(2, st.slots);
        for (let k = 0; k < n; k++) {
          const tx = 412 + (k % 2) * 34 - (k >= 2 ? 0 : 0);
          const ty = 176 - (k >= 2 ? 24 : 0);
          const xx = k >= 2 ? 462 : tx;
          // tina de madeira com gelo lunar
          ellipse(ctx, xx, ty, 15, 6, P.outline);
          px(ctx, xx - 15, ty, 31, 10, P.outline);
          ellipse(ctx, xx, ty + 10, 15, 4, P.outline);
          px(ctx, xx - 14, ty, 29, 10, P.wood2);
          ellipse(ctx, xx, ty + 10, 14, 3, P.wood1);
          px(ctx, xx - 14, ty + 3, 29, 1, P.iron2);
          px(ctx, xx - 14, ty + 7, 29, 1, P.iron2);
          ellipse(ctx, xx, ty, 13, 4, P.ice1);
          ellipse(ctx, xx - 3, ty - 1, 6, 2, P.ice2);
          px(ctx, xx - 8, ty - 2, 3, 2, P.ice3);
          px(ctx, xx + 6, ty, 3, 2, P.ice3);
          const col = this.activeColor(s, id, k);
          if (col && k < st.active.length) drawFlask(ctx, xx + 1, ty + 1, col, 2);
        }
        break;
      }
      case 'embalagem': {
        box(ctx, 318, 222, 56, 10, P.wood2);
        px(ctx, 318, 222, 56, 2, P.wood3);
        px(ctx, 320, 232, 4, 14, P.wood0);
        px(ctx, 368, 232, 4, 14, P.wood0);
        // caixas e fitas
        box(ctx, 324, 214, 12, 8, P.paperDark);
        px(ctx, 329, 214, 2, 8, P.red1);
        px(ctx, 324, 217, 12, 2, P.red1);
        box(ctx, 352, 216, 10, 6, P.paper);
        const col = this.activeColor(s, id, 0);
        if (col) {
          drawFlask(ctx, 344, 221, col);
          if (Math.floor(t * 6) % 2) px(ctx, 340, 212, 8, 1, P.purple3);
        }
        // rolo de fitas
        ellipse(ctx, 366, 214, 3, 3, P.outline);
        ellipse(ctx, 366, 214, 2, 2, P.purple2);
        break;
      }
      case 'balcao': {
        // balcão com tampo, cristal-caixa e sino
        box(ctx, 106, 222, 90, 18, P.wood1);
        px(ctx, 106, 222, 90, 4, P.wood3);
        px(ctx, 106, 226, 90, 1, P.wood0);
        for (let i = 0; i < 6; i++) px(ctx, 112 + i * 14, 230, 8, 8, P.wood2);
        ellipse(ctx, 180, 216, 5, 5, P.outline);
        ellipse(ctx, 180, 216, 4, 4, P.purple3);
        px(ctx, 178, 213, 2, 2, P.purple4);
        px(ctx, 176, 220, 9, 2, P.gold0);
        box(ctx, 120, 217, 4, 3, P.gold1);
        const col = this.activeColor(s, id, 0);
        if (col) drawFlask(ctx, 140, 221, col, 1);
        break;
      }
    }
    ctx.globalAlpha = 1;
    // destaque de seleção / hover / tutorial
    const L = LAYOUT[id].hit;
    const fl = this.flash.find((f) => f.station === id && f.until > t);
    if (view.selected === id || view.hover === id || view.highlight === id || fl) {
      const col = fl ? fl.color : view.highlight === id ? P.amber2 : view.selected === id ? P.amber3 : 'rgba(255,240,200,0.5)';
      dashedRect(ctx, L.x, L.y, L.w, L.h, col, Math.floor(t * 8));
    }
  }

  private drawCauldron(x: number, y: number, sc: number, busy: boolean, color: string | null, stop: string | null, cleaning: boolean) {
    const ctx = this.ctx;
    const t = this.time;
    const rx = Math.round(24 * sc);
    const ry = Math.round(16 * sc);
    const cy = y - ry;
    // fogo
    if (busy) {
      for (let i = -3; i <= 3; i++) {
        const h = 3 + ((Math.floor(t * 10) + i * 3) % 4);
        px(ctx, x + i * 3 * sc, y - h + 2, 2, h, i % 2 ? P.amber2 : P.red2);
        px(ctx, x + i * 3 * sc, y - h + 1, 1, 1, P.amber3);
      }
    }
    // lenha
    px(ctx, x - 12 * sc, y, 24 * sc, 3, P.wood1);
    px(ctx, x - 10 * sc, y + 2, 20 * sc, 2, P.wood0);
    // pés
    px(ctx, x - rx + 4, y - 4, 3, 6, P.iron0);
    px(ctx, x + rx - 7, y - 4, 3, 6, P.iron0);
    // corpo
    ellipse(ctx, x, cy, rx + 1, ry + 1, P.outline);
    ellipse(ctx, x, cy, rx, ry, P.iron1);
    ellipse(ctx, x - 4 * sc, cy - 2, rx - 6, ry - 5, P.iron2);
    px(ctx, x - rx + 4, cy - 4, 3, 6, P.iron3);
    // borda
    const by = cy - ry + 3;
    ellipse(ctx, x, by, rx + 1, Math.round(5 * sc) + 1, P.outline);
    ellipse(ctx, x, by, rx, Math.round(5 * sc), P.iron3);
    // líquido
    const liq = color ?? (stop ? '#2a2a3a' : '#3a5a5a');
    ellipse(ctx, x, by + 1, rx - 3, Math.max(2, Math.round(4 * sc) - 1), busy ? liq : '#24303a');
    if (busy) {
      ellipse(ctx, x - 5 * sc, by, 6 * sc, 1, lighten(liq, 60));
      const sw = Math.floor(t * 3) % 3;
      px(ctx, x + (sw - 1) * 6 * sc, by + 1, 3, 1, lighten(liq, 90));
    }
    // colher de mexer
    if (busy) {
      const ang = t * 3;
      const sx = x + Math.cos(ang) * 8 * sc;
      px(ctx, sx, by - 12 * sc, 2, 13 * sc, P.wood3);
    }
    if (cleaning) {
      // vassourinha de limpeza
      px(ctx, x + 6, by - 10, 1, 10, P.wood3);
      px(ctx, x + 4 + (Math.floor(t * 8) % 2), by - 1, 5, 2, P.paperDark);
    }
  }

  private drawAlembic(x: number, y: number, busy: boolean, color: string | null) {
    const ctx = this.ctx;
    const t = this.time;
    // mesa
    box(ctx, x - 24, y - 6, 48, 6, P.wood2);
    px(ctx, x - 22, y, 3, 10, P.wood0);
    px(ctx, x + 19, y, 3, 10, P.wood0);
    // fogareiro
    box(ctx, x - 14, y - 12, 12, 6, P.iron1);
    if (busy) px(ctx, x - 11, y - 13 - (Math.floor(t * 8) % 2), 6, 2, P.amber2);
    // panela de cobre
    ellipse(ctx, x - 8, y - 20, 10, 9, P.outline);
    ellipse(ctx, x - 8, y - 20, 9, 8, P.copper1);
    ellipse(ctx, x - 10, y - 22, 4, 4, P.copper2);
    px(ctx, x - 12, y - 25, 2, 2, P.copper3);
    // capitel e tubo
    px(ctx, x - 10, y - 32, 5, 5, P.outline);
    px(ctx, x - 9, y - 31, 3, 4, P.copper2);
    for (let i = 0; i < 18; i++) px(ctx, x - 6 + i, y - 30 + Math.floor(i / 2), 2, 2, i % 3 === 0 ? P.copper3 : P.copper1);
    // serpentina
    for (let i = 0; i < 4; i++) {
      ellipse(ctx, x + 14, y - 22 + i * 3, 5, 1, P.copper1);
    }
    // frasco coletor
    const fill = busy && color ? color : null;
    drawFlask(ctx, x + 20, y - 6, fill ?? '#2a3040', 1);
    if (fill) {
      const k = (t * 0.5) % 1;
      px(ctx, x + 18, y - 9 + Math.round((1 - k) * 2), 4, 1, lighten(fill, 70));
    }
  }

  private drawStationOverlay(id: StationId, s: SimState, view: SceneView) {
    const ctx = this.ctx;
    const st = s.stations[id];
    const L = LAYOUT[id];
    const t = this.time;
    if (st.locked) return;
    // barras de progresso por posto
    st.active.forEach((task, k) => {
      const bw = 14;
      const x = L.center.x - (st.active.length * (bw + 3)) / 2 + k * (bw + 3);
      const y = L.hit.y - 4;
      const prog = task.setupLeft > 0 ? 0 : 1 - Math.max(0, task.remaining) / task.total;
      px(ctx, x - 1, y - 1, bw + 2, 4, P.outline);
      px(ctx, x, y, bw, 2, P.iron1);
      const j = s.jobs[task.job];
      px(ctx, x, y, Math.round(bw * prog), 2, task.setupLeft > 0 ? P.ice1 : j ? RECIPES[j.recipe].color : P.green2);
    });
    const stop = stationStopped(s, id);
    const ix = L.hit.x + L.hit.w - 8;
    const iy = L.hit.y + 2;
    if (stop === 'pausada') {
      // placa de pare
      ellipse(ctx, ix, iy + 3, 4, 4, P.outline);
      ellipse(ctx, ix, iy + 3, 3, 3, P.red1);
      px(ctx, ix - 2, iy + 3, 5, 1, P.white);
    } else if (stop === 'manutenção' || stop === 'instalação') {
      // chave inglesa
      const bob = Math.floor(t * 4) % 2;
      px(ctx, ix - 1, iy + bob, 3, 8, P.outline);
      px(ctx, ix, iy + 1 + bob, 1, 6, P.iron3);
      px(ctx, ix - 2, iy + bob, 5, 2, P.iron3);
    }
    if (st.installing) {
      const u = st.installing;
      const total = UPGRADES[u.upgrade].installTime;
      const remain = Math.max(0, u.until - s.t);
      const w = 22;
      const x = L.center.x - w / 2;
      const y = L.hit.y + L.hit.h + 2;
      px(ctx, x - 1, y - 1, w + 2, 4, P.outline);
      px(ctx, x, y, w, 2, P.iron1);
      const k = 1 - Math.min(1, remain / total);
      px(ctx, x, y, Math.round(w * k), 2, P.amber2);
      // andaime
      px(ctx, L.hit.x + 4, L.hit.y + 4, 1, L.hit.h - 8, P.wood3);
      px(ctx, L.hit.x + L.hit.w - 5, L.hit.y + 4, 1, L.hit.h - 8, P.wood3);
      px(ctx, L.hit.x + 4, L.hit.y + 10, L.hit.w - 8, 1, P.wood3);
    }
    // marcador do tambor (corda amarrada)
    if (view.showDrum && s.policies.release === 'corda' && s.policies.drum === id) {
      const dx = L.hit.x + 3;
      const dy = L.hit.y + 2;
      box(ctx, dx, dy, 7, 5, P.red1);
      px(ctx, dx, dy + 2, 7, 1, P.gold1);
      px(ctx, dx - 3, dy - 3 + (Math.floor(t * 4) % 2), 1, 4, P.wood4);
    }
    // cristal temporário
    for (const e of s.events) {
      if (e.kind === 'cristal_temporario' && e.station === id && s.t < e.end) {
        const cx = L.hit.x + L.hit.w / 2 + 12;
        const cy = L.hit.y - 10 + Math.sin(t * 3) * 2;
        px(ctx, cx - 2, cy - 4, 5, 8, P.outline);
        px(ctx, cx - 1, cy - 3, 3, 6, P.amber2);
        px(ctx, cx - 1, cy - 3, 1, 2, P.amber3);
      }
      if (e.kind === 'aprendiz_ausente' && e.station === id && s.t < e.end) {
        const cx = L.hit.x + 6;
        const cy = L.hit.y + L.hit.h - 6;
        box(ctx, cx, cy, 6, 4, P.paper);
        px(ctx, cx + 1, cy + 1, 4, 1, P.red1);
      }
    }
    // ajuda da Lina
    if (s.helper === id && Math.floor(t * 3) % 2 === 0) {
      px(ctx, L.hit.x + L.hit.w - 14, L.hit.y + 3, 2, 2, P.amber3);
    }
  }

  private drawQueue(id: StationId, s: SimState) {
    const st = s.stations[id];
    if (st.locked || st.queue.length === 0) return;
    const r = LAYOUT[id].queue;
    const ctx = this.ctx;
    const cols = Math.max(1, Math.floor(r.w / 8));
    const rows = Math.max(1, Math.floor(r.h / 9));
    const max = cols * rows;
    const n = Math.min(max, st.queue.length);
    for (let i = 0; i < n; i++) {
      const j = s.jobs[st.queue[i]];
      if (!j) continue;
      const cx = r.x + 4 + (i % cols) * 8;
      const cy = r.y + r.h - Math.floor(i / cols) * 9;
      const color = RECIPES[j.recipe].color;
      if (j.step === 0) {
        // ingredientes separados (saquinho)
        box(ctx, cx - 3, cy - 6, 6, 6, P.paperDark);
        px(ctx, cx - 2, cy - 7, 4, 1, color);
      } else if (RECIPES[j.recipe].route[j.step - 1].station === 'preparo') drawKit(ctx, cx, cy, color, j.spoiled);
      else drawFlask(ctx, cx, cy, color);
      if (j.boosted) px(ctx, cx - 1, cy - 12, 3, 2, P.amber2);
    }
    // pilha transbordando
    if (st.queue.length > max) {
      const ctx2 = this.ctx;
      px(ctx2, r.x + r.w - 3, r.y - 2, 3, 3, P.red2);
    }
  }

  private drawShelf(s: SimState) {
    const ctx = this.ctx;
    // prateleira de pronta-entrega atrás do balcão
    box(ctx, SHELF.x - 14, SHELF.y + 2, 28, 3, P.wood2);
    px(ctx, SHELF.x - 12, SHELF.y + 5, 2, 10, P.wood0);
    px(ctx, SHELF.x + 10, SHELF.y + 5, 2, 10, P.wood0);
    let i = 0;
    for (const k in s.jobs) {
      const j = s.jobs[k];
      if (j.location !== 'prateleira') continue;
      if (i < 5) drawFlask(ctx, SHELF.x - 10 + i * 5, SHELF.y + 2, RECIPES[j.recipe].color, 2);
      i++;
    }
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const k = p.life / p.max;
      switch (p.kind) {
        case 'bubble':
          ctx.globalAlpha = 1 - k;
          px(ctx, p.x, p.y, k > 0.8 ? 3 : 2, k > 0.8 ? 1 : 2, p.color);
          break;
        case 'steam':
        case 'smoke':
          ctx.globalAlpha = (1 - k) * (p.kind === 'smoke' ? 0.8 : 1);
          ellipse(ctx, p.x, p.y, 2 + Math.round(k * 4), 1 + Math.round(k * 2), p.color);
          break;
        case 'spark':
        case 'star':
          ctx.globalAlpha = 1 - k;
          px(ctx, p.x, p.y, 1, 1, p.color);
          if (p.kind === 'star' && k < 0.5) {
            px(ctx, p.x - 1, p.y, 3, 1, p.color);
            px(ctx, p.x, p.y - 1, 1, 3, p.color);
          }
          break;
        case 'frost':
          ctx.globalAlpha = (1 - k) * 0.9;
          px(ctx, p.x, p.y, 1, 1, p.color);
          break;
        case 'drop':
          ctx.globalAlpha = 1 - k;
          px(ctx, p.x, p.y, 1, 2, p.color);
          break;
        case 'leaf':
          ctx.globalAlpha = 1 - k;
          px(ctx, p.x, p.y, 2, 1, p.color);
          break;
        case 'coin':
          ctx.globalAlpha = 1 - k * 0.6;
          drawCoin(ctx, p.x, p.y, Math.floor(this.time * 10));
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  private vignette: HTMLCanvasElement | null = null;

  private drawLights(s: SimState) {
    const ctx = this.ctx;
    if (!this.lowFx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x: number, y: number, r: number, color: string, a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color.replace('A', String(a)));
      g.addColorStop(1, color.replace('A', '0'));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const flick = 0.06 * Math.sin(this.time * 9) + 0.04 * Math.sin(this.time * 13.7);
    glow(125, 48, 28, 'rgba(255,190,90,A)', 0.22 + flick);
    glow(233, 48, 28, 'rgba(255,190,90,A)', 0.22 - flick);
    glow(396, 60, 24, 'rgba(255,190,90,A)', 0.18 + flick);
    glow(276, 40, 50, 'rgba(120,150,255,A)', 0.12);
    const cald = s.stations.caldeirao;
    const col = cald.active.length && s.jobs[cald.active[0].job] ? RECIPES[s.jobs[cald.active[0].job].recipe].color : null;
    if (col) glow(204, 140, 46, hexToRgbaTemplate(col), 0.22 + flick * 0.5);
    glow(204, 168, 30, 'rgba(255,140,60,A)', cald.active.length ? 0.22 + flick : 0.06);
    const res = s.stations.resfriamento;
    if (res.active.length) glow(436, 172, 30, 'rgba(140,210,255,A)', 0.16);
    ctx.restore();
    }
    // vinheta: desenhada uma vez e reaproveitada
    if (!this.vignette) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const vc = c.getContext('2d')!;
      const v = vc.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
      v.addColorStop(0, 'rgba(10,4,16,0)');
      v.addColorStop(1, 'rgba(10,4,16,0.55)');
      vc.fillStyle = v;
      vc.fillRect(0, 0, W, H);
      this.vignette = c;
    }
    ctx.drawImage(this.vignette, 0, 0);
  }
}

function detectLowEnd(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduce || (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory ?? 8) <= 2;
}

function hexToRgbaTemplate(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},A)`;
}

function dashedRect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string, phase: number) {
  ctx.fillStyle = c;
  const per = 2 * (w + h);
  for (let i = 0; i < per; i += 4) {
    const k = (i + phase) % per;
    let px2: number;
    let py2: number;
    if (k < w) [px2, py2] = [x + k, y];
    else if (k < w + h) [px2, py2] = [x + w, y + (k - w)];
    else if (k < 2 * w + h) [px2, py2] = [x + w - (k - w - h), y + h];
    else [px2, py2] = [x, y + h - (k - 2 * w - h)];
    ctx.fillRect(Math.round(px2), Math.round(py2), 2, 1);
  }
}

function rectCenter(r: { x: number; y: number; w: number; h: number }) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Move um caminhante; retorna true se chegou. */
function stepWalker(w: Walker, dt: number): boolean {
  const dx = w.tx - w.x;
  const dy = w.ty - w.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.6) {
    w.x = w.tx;
    w.y = w.ty;
    return true;
  }
  const step = Math.min(d, w.speed * dt);
  w.x += (dx / d) * step;
  w.y += (dy / d) * step;
  if (Math.abs(dx) > 0.5) w.facing = dx > 0 ? 1 : -1;
  return false;
}

export type { RecipeId };
