// Núcleo da simulação: relógio de passo fixo, chegada de pedidos, liberação de
// trabalho, processamento nas estações, qualidade, entregas e contabilidade.
// Nenhuma dependência de renderização: pode ser executado em testes.
import { CLIENT_NAMES, CLIENT_SPECIES } from '../data/characters';
import { describeEvent, EVENT_DURATIONS } from '../data/events';
import { INGREDIENT_ORDER, INGREDIENTS, RECIPES, unitThroughput } from '../data/recipes';
import { POLICY_COSTS, STATION_ORDER, STATIONS } from '../data/stations';
import { UPGRADES } from '../data/upgrades';
import { analyzeCapacity, hypothesisMatches, defectProb, effectiveTime, observedUtilization, averageQueue } from './analysis';
import { currentMods, effectiveSlots, effectiveSpeed, Mods } from './mods';
import { Rng } from './rng';
import type {
  ActiveEvent,
  EventKind,
  IngredientId,
  Job,
  LogEntry,
  Order,
  Policies,
  RecipeId,
  ScenarioDef,
  ScheduledEvent,
  SimState,
  StationId,
  StationState,
} from './types';

export const DT = 0.1;
export const SAMPLE_EVERY = 2;
export const DAY_REFERENCE = 300; // segundos de um "dia" para depreciação
export const SIM_VERSION = 1;

export const DEFAULT_POLICIES: Policies = {
  release: 'empurrar',
  drum: 'caldeirao',
  bufferSize: 4,
  priority: 'fifo',
  inspection: 'final',
  keepBusy: false,
  setupExternal: {},
  breakCover: {},
  autoAccept: true,
  autoReorder: true,
};

function emptyRecord<T>(v: () => T): Record<StationId, T> {
  const o = {} as Record<StationId, T>;
  for (const id of STATION_ORDER) o[id] = v();
  return o;
}

export function createSim(sc: ScenarioDef): SimState {
  const stations = {} as Record<StationId, StationState>;
  for (const id of STATION_ORDER) {
    const d = STATIONS[id];
    const o = sc.stations[id] || {};
    stations[id] = {
      id,
      slots: o.slots ?? d.slots,
      speedMult: o.speedMult ?? 1,
      setupTime: o.setupTime ?? d.setupTime,
      breakEvery: o.breakEvery ?? d.breakEvery,
      breakDuration: o.breakDuration ?? d.breakDuration,
      costPerSec: o.costPerSec ?? d.costPerSec,
      locked: o.locked ?? false,
      queue: [],
      active: [],
      paused: false,
      nextBreakAt: (o.breakEvery ?? d.breakEvery) > 0 ? (o.breakEvery ?? d.breakEvery) : Number.POSITIVE_INFINITY,
      breakUntil: 0,
      downUntil: 0,
      downReason: '',
      busyTime: 0,
      setupSpent: 0,
      starvedTime: 0,
      stoppedTime: 0,
      processed: 0,
      maxQueue: 0,
      installing: null,
    };
  }
  const stock = {} as Record<IngredientId, number>;
  const stockValue = {} as Record<IngredientId, number>;
  for (const i of INGREDIENT_ORDER) {
    stock[i] = sc.startStock[i] ?? 0;
    stockValue[i] = stock[i] * INGREDIENTS[i].unitCost;
  }
  const policies: Policies = {
    ...DEFAULT_POLICIES,
    ...sc.policies,
    setupExternal: { ...(sc.policies.setupExternal || {}) },
    breakCover: { ...(sc.policies.breakCover || {}) },
  };
  const s: SimState = {
    version: SIM_VERSION,
    scenarioId: sc.id,
    t: 0,
    duration: sc.duration,
    finished: false,
    rngDemand: sc.seed,
    rngProc: (sc.seed * 7919 + 17) | 0,
    cash: sc.startCash,
    startCash: sc.startCash,
    reputation: sc.startReputation,
    stock,
    stockValue,
    pending: [],
    supplierLeadTime: sc.supplierLeadTime,
    stations,
    jobs: {},
    nextJobId: 1,
    orders: {},
    nextOrderId: 1,
    nextArrivalAt: sc.firstArrival,
    recipes: [...sc.recipes],
    demand: { ...sc.demand, mix: { ...sc.demand.mix } },
    policies,
    helper: null,
    upgradesOwned: [],
    upgradesAvailable: [...sc.upgrades],
    upgradesNeedHypothesis: !!sc.upgradesNeedHypothesis,
    acct: {
      revenue: 0,
      ctvSold: 0,
      materialsPurchased: 0,
      scrapCost: 0,
      opCash: 0,
      wipHolding: 0,
      depreciation: 0,
      equipment: 0,
      lostToLateness: 0,
    },
    stats: {
      delivered: 0,
      deliveredOnTime: 0,
      deliveredLate: 0,
      ordersCompleted: 0,
      ordersCanceled: 0,
      ordersRefused: 0,
      ordersExpired: 0,
      ordersArrived: 0,
      failures: 0,
      failuresCaughtEarly: 0,
      spoiled: 0,
      speculativeMade: 0,
      released: 0,
      wipIntegral: 0,
      maxWip: 0,
      leadTimeSum: 0,
      leadTimeCount: 0,
      orderLeadSum: 0,
      orderLeadCount: 0,
      starvedForIngredients: 0,
    },
    series: {
      t: [],
      delivered: [],
      wip: [],
      cash: [],
      throughput: [],
      queues: emptyRecord<number[]>(() => []),
      busy: emptyRecord<number[]>(() => []),
    },
    nextSampleAt: 0,
    events: [],
    scheduled: [...sc.events].sort((a, b) => a.at - b.at),
    nextEventId: 1,
    dynamicEvents: {
      enabled: !!sc.dynamicEvents?.enabled,
      intensity: sc.dynamicEvents?.intensity ?? 1,
      nextAt: 45,
    },
    pendingCrystal: null,
    log: [],
    decisions: [],
    hypotheses: [],
    deliveryTimes: [],
    wipHoldingCost: sc.wipHoldingCost,
    spoilTime: sc.spoilTime,
    graceTime: sc.graceTime,
    acceptWindow: sc.acceptWindow,
    rentPerSec: sc.rentPerSec,
    notices: [],
  };
  // melhorias já instaladas no início do cenário (sem custo nesta fase)
  for (const id of sc.ownedUpgrades || []) {
    const u = UPGRADES[id];
    s.upgradesOwned.push({ id, activeAt: 0, applied: true });
    applyUpgradeEffect(s, id);
    s.stations[u.station].costPerSec += u.opCostPerSec;
  }
  sample(s);
  return s;
}

// ---------------------------------------------------------------- utilidades

function rng(s: SimState, which: 'rngDemand' | 'rngProc'): Rng {
  return new Rng(s[which]);
}

function withRng<T>(s: SimState, which: 'rngDemand' | 'rngProc', fn: (r: Rng) => T): T {
  const r = rng(s, which);
  const out = fn(r);
  s[which] = r.value;
  return out;
}

export function addLog(s: SimState, kind: LogEntry['kind'], text: string): void {
  s.log.push({ t: s.t, kind, text });
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}

export function wipCount(s: SimState): number {
  let n = 0;
  for (const k in s.jobs) {
    if (s.jobs[k].location !== 'prateleira') n++;
  }
  return n;
}

export function shelfCount(s: SimState, recipe?: RecipeId): number {
  let n = 0;
  for (const k in s.jobs) {
    const j = s.jobs[k];
    if (j.location === 'prateleira' && (!recipe || j.recipe === recipe)) n++;
  }
  return n;
}

export function deliveredBetween(s: SimState, a: number, b: number): number {
  let n = 0;
  for (const t of s.deliveryTimes) if (t > a && t <= b) n++;
  return n;
}

export function throughputGain(s: SimState): number {
  return s.acct.revenue - s.acct.ctvSold;
}

export function operatingExpense(s: SimState): number {
  return s.acct.opCash + s.acct.scrapCost + s.acct.depreciation;
}

export function netProfit(s: SimState): number {
  return throughputGain(s) - operatingExpense(s);
}

/** Investimento: dinheiro imobilizado em estoques (valor de custo) e equipamentos (valor contábil). */
export function inventoryValue(s: SimState): { materias: number; emProcesso: number; prontas: number; equipamentos: number; total: number } {
  let materias = 0;
  for (const i of INGREDIENT_ORDER) materias += s.stockValue[i];
  let emProcesso = 0;
  let prontas = 0;
  for (const k in s.jobs) {
    const j = s.jobs[k];
    if (j.location === 'prateleira') prontas += j.materialCost;
    else emProcesso += j.materialCost;
  }
  const equipamentos = s.acct.equipment - s.acct.depreciation;
  return { materias, emProcesso, prontas, equipamentos, total: materias + emProcesso + prontas + equipamentos };
}

export function orderNeeds(o: Order): number {
  let n = 0;
  for (const l of o.lines) n += l.qty - l.delivered;
  return n;
}

export function orderTotalQty(o: Order): number {
  return o.lines.reduce((a, l) => a + l.qty, 0);
}

function stepIndex(recipe: RecipeId, station: StationId): number {
  return RECIPES[recipe].route.findIndex((x) => x.station === station);
}

// ---------------------------------------------------------------- pedidos

function makeClient(r: Rng) {
  return {
    name: CLIENT_NAMES[r.int(0, CLIENT_NAMES.length - 1)],
    species: r.int(0, CLIENT_SPECIES.length - 1),
    palette: r.int(0, 7),
    seed: r.int(1, 1_000_000),
  };
}

export function createOrder(s: SimState, opts?: { recipe?: RecipeId; qty?: number; vip?: boolean }): Order {
  const mods = currentMods(s);
  const order = withRng(s, 'rngDemand', (r) => {
    const mix: Partial<Record<RecipeId, number>> = {};
    for (const rc of s.recipes) {
      const w = (s.demand.mix[rc] || 0) * (mods.mixBoost[rc] || 1);
      if (w > 0) mix[rc] = w;
    }
    const lines = [];
    if (opts?.recipe) {
      lines.push({ recipe: opts.recipe, qty: opts.qty ?? 1, delivered: 0 });
    } else {
      const first = r.pickWeighted(mix);
      lines.push({ recipe: first, qty: r.int(s.demand.qtyMin, s.demand.qtyMax), delivered: 0 });
      if (s.demand.maxLines > 1 && r.chance(0.3)) {
        const rest = { ...mix };
        delete rest[first];
        if (Object.keys(rest).length) {
          lines.push({ recipe: r.pickWeighted(rest), qty: r.int(s.demand.qtyMin, s.demand.qtyMax), delivered: 0 });
        }
      }
    }
    const o: Order = {
      id: s.nextOrderId++,
      client: makeClient(r),
      lines,
      status: 'aguardando',
      arrivedAt: s.t,
      acceptBy: s.t + s.acceptWindow,
      acceptedAt: -1,
      dueAt: -1,
      closedAt: -1,
      revenue: 0,
      late: false,
      vip: !!opts?.vip,
      priceMult: opts?.vip ? 2 : 1,
    };
    return o;
  });
  s.orders[order.id] = order;
  s.stats.ordersArrived++;
  s.notices.push({ type: 'order-arrived', order: order.id });
  if (s.policies.autoAccept) acceptOrderInternal(s, order);
  return order;
}

export function acceptOrderInternal(s: SimState, o: Order): boolean {
  if (o.status !== 'aguardando') return false;
  o.status = 'aceito';
  o.acceptedAt = s.t;
  const base = Math.max(...o.lines.map((l) => RECIPES[l.recipe].dueTime));
  const extra = 12 * (orderTotalQty(o) - 1);
  o.dueAt = s.t + (o.vip ? base * 0.6 : base) + extra;
  // potions já prontas na prateleira atendem o pedido primeiro
  for (const line of o.lines) {
    let need = line.qty - line.delivered;
    if (need <= 0) continue;
    for (const k in s.jobs) {
      if (need <= 0) break;
      const j = s.jobs[k];
      if (j.location === 'prateleira' && j.recipe === line.recipe) {
        j.orderId = o.id;
        j.location = 'fila';
        j.station = 'balcao';
        j.step = stepIndex(j.recipe, 'balcao');
        j.queuedAt = s.t;
        s.stations.balcao.queue.push(j.id);
        need--;
      }
    }
  }
  s.notices.push({ type: 'order-accepted', order: o.id });
  return true;
}

function closeOrder(s: SimState, o: Order, status: Order['status']): void {
  o.status = status;
  o.closedAt = s.t;
  s.notices.push({ type: 'order-closed', order: o.id, status });
}

function updateOrders(s: SimState): void {
  for (const k in s.orders) {
    const o = s.orders[k];
    if (o.status === 'aguardando' && s.t >= o.acceptBy) {
      closeOrder(s, o, 'desistiu');
      s.stats.ordersExpired++;
      changeReputation(s, -3);
      addLog(s, 'ruim', `${o.client.name} cansou de esperar no balcão e foi embora.`);
    } else if (o.status === 'aceito' && s.t >= o.dueAt + s.graceTime) {
      closeOrder(s, o, 'cancelado');
      s.stats.ordersCanceled++;
      changeReputation(s, -10);
      addLog(s, 'ruim', `${o.client.name} cancelou o pedido #${o.id}: atraso demais.`);
      for (const j in s.jobs) if (s.jobs[j].orderId === o.id) s.jobs[j].orderId = null;
    }
  }
}

function changeReputation(s: SimState, d: number): void {
  s.reputation = Math.max(0, Math.min(100, s.reputation + d));
}

// ---------------------------------------------------------------- ingredientes

export function hasIngredients(s: SimState, recipe: RecipeId): boolean {
  for (const [i, q] of Object.entries(RECIPES[recipe].ingredients) as [IngredientId, number][]) {
    if (s.stock[i] < q) return false;
  }
  return true;
}

function consumeIngredients(s: SimState, recipe: RecipeId): number {
  let cost = 0;
  for (const [i, q] of Object.entries(RECIPES[recipe].ingredients) as [IngredientId, number][]) {
    const avg = s.stock[i] > 0 ? s.stockValue[i] / s.stock[i] : INGREDIENTS[i].unitCost;
    const c = avg * q;
    s.stock[i] -= q;
    s.stockValue[i] = s.stock[i] <= 0 ? 0 : s.stockValue[i] - c;
    cost += c;
  }
  return cost;
}

export function orderIngredient(s: SimState, ing: IngredientId, qty: number, mods: Mods = currentMods(s)): number {
  const cost = INGREDIENTS[ing].unitCost * qty * (mods.priceMult[ing] || 1);
  s.pending.push({ ingredient: ing, qty, arriveAt: s.t + s.supplierLeadTime * mods.leadMult, cost });
  return cost;
}

export function inbound(s: SimState, ing: IngredientId): number {
  return s.pending.filter((p) => p.ingredient === ing).reduce((a, p) => a + p.qty, 0);
}

export function ingredientsInUse(s: SimState): IngredientId[] {
  const set = new Set<IngredientId>();
  for (const r of s.recipes) for (const i of Object.keys(RECIPES[r].ingredients) as IngredientId[]) set.add(i);
  return INGREDIENT_ORDER.filter((i) => set.has(i));
}

function updateSupply(s: SimState, mods: Mods): void {
  for (let i = s.pending.length - 1; i >= 0; i--) {
    const p = s.pending[i];
    if (s.t >= p.arriveAt) {
      s.pending.splice(i, 1);
      s.stock[p.ingredient] += p.qty;
      s.stockValue[p.ingredient] += p.cost;
      s.cash -= p.cost;
      s.acct.materialsPurchased += p.cost;
      s.notices.push({ type: 'stock-arrived', ingredient: p.ingredient, qty: p.qty });
    }
  }
  if (s.policies.autoReorder) {
    for (const ing of ingredientsInUse(s)) {
      const d = INGREDIENTS[ing];
      if (s.stock[ing] + inbound(s, ing) < d.reorderPoint) orderIngredient(s, ing, d.reorderQty, mods);
    }
  }
}

// ---------------------------------------------------------------- liberação de trabalho

function drumKey(s: SimState, recipe: RecipeId): number {
  // ganho por segundo do tambor: quanto maior, mais prioridade
  const drum = s.policies.drum;
  const step = RECIPES[recipe].route.find((x) => x.station === drum);
  if (!step) return 1e9;
  const setup = s.policies.setupExternal[drum] ? 0 : s.stations[drum].setupTime;
  return unitThroughput(recipe) / (step.time + setup);
}

interface Candidate {
  order: Order;
  recipe: RecipeId;
}

function sortCandidates(s: SimState, list: Candidate[]): void {
  const rule = s.policies.priority;
  list.sort((a, b) => {
    if (rule === 'prazo') return a.order.dueAt - b.order.dueAt || a.order.id - b.order.id;
    if (rule === 'ganho') {
      const d = drumKey(s, b.recipe) - drumKey(s, a.recipe);
      if (Math.abs(d) > 1e-9) return d;
      return a.order.dueAt - b.order.dueAt;
    }
    return a.order.acceptedAt - b.order.acceptedAt || a.order.id - b.order.id;
  });
}

/** Poções liberadas que ainda não terminaram a etapa do tambor (a "corda"). */
export function ropeCount(s: SimState): number {
  const drum = s.policies.drum;
  let n = 0;
  for (const k in s.jobs) {
    const j = s.jobs[k];
    if (j.location === 'prateleira') continue;
    const idx = stepIndex(j.recipe, drum);
    if (idx < 0) continue;
    if (j.step < idx || (j.step === idx && j.station === drum)) n++;
  }
  return n;
}

function newJob(s: SimState, recipe: RecipeId, orderId: number | null, speculative: boolean, mods: Mods): Job {
  const cost = consumeIngredients(s, recipe);
  const defective = withRng(s, 'rngProc', (r) => r.chance(defectProb(s, recipe, mods)));
  const first = RECIPES[recipe].route[0].station;
  const j: Job = {
    id: s.nextJobId++,
    recipe,
    orderId,
    step: 0,
    location: 'fila',
    station: first,
    defect: defective ? 'ingrediente' : 'nenhum',
    releasedAt: s.t,
    queuedAt: s.t,
    speculative,
    materialCost: cost,
    spoiled: false,
    boosted: false,
  };
  s.jobs[j.id] = j;
  s.stations[first].queue.push(j.id);
  s.stats.released++;
  if (speculative) s.stats.speculativeMade++;
  s.notices.push({ type: 'job-move', job: j.id, recipe, from: null, to: first });
  return j;
}

function releaseWork(s: SimState, mods: Mods): void {
  // quantas poções de cada pedido/receita já estão no sistema
  const pegged = new Map<string, number>();
  for (const k in s.jobs) {
    const j = s.jobs[k];
    if (j.orderId == null) continue;
    const key = j.orderId + ':' + j.recipe;
    pegged.set(key, (pegged.get(key) || 0) + 1);
  }
  const cands: Candidate[] = [];
  for (const k in s.orders) {
    const o = s.orders[k];
    if (o.status !== 'aceito') continue;
    for (const l of o.lines) {
      const need = l.qty - l.delivered - (pegged.get(o.id + ':' + l.recipe) || 0);
      for (let i = 0; i < need; i++) cands.push({ order: o, recipe: l.recipe });
    }
  }
  sortCandidates(s, cands);
  let rope = s.policies.release === 'corda' ? ropeCount(s) : 0;
  let blocked = false;
  for (const c of cands) {
    const usesDrum = stepIndex(c.recipe, s.policies.drum) >= 0;
    if (s.policies.release === 'corda' && usesDrum && rope >= s.policies.bufferSize) continue;
    if (!hasIngredients(s, c.recipe)) {
      blocked = true;
      continue;
    }
    newJob(s, c.recipe, c.order.id, false, mods);
    if (usesDrum) rope++;
  }
  if (blocked) s.stats.starvedForIngredients += DT;

  // "Manter todo mundo ocupado": a bancada produz antecipadamente quando fica ociosa.
  if (s.policies.keepBusy) {
    const prep = s.stations.preparo;
    const free = effectiveSlots(s, 'preparo', mods) - prep.active.length;
    if (free > 0 && prep.queue.length === 0 && wipCount(s) < 60) {
      const mix = s.demand.mix;
      let best: RecipeId | null = null;
      let bw = -1;
      for (const r of s.recipes) {
        const w = mix[r] || 0;
        if (w > bw && hasIngredients(s, r)) {
          bw = w;
          best = r;
        }
      }
      if (best) newJob(s, best, null, true, mods);
    }
  }
}

// ---------------------------------------------------------------- estações

function pickFromQueue(s: SimState, st: StationState): number {
  const q = st.queue;
  if (q.length === 0) return -1;
  let best = -1;
  let bestKey = Number.NEGATIVE_INFINITY;
  const rule = s.policies.priority;
  for (let i = 0; i < q.length; i++) {
    const j = s.jobs[q[i]];
    let key: number;
    if (j.boosted) key = 1e12 - i;
    else if (rule === 'fifo') key = -i;
    else if (rule === 'prazo') {
      const o = j.orderId != null ? s.orders[j.orderId] : null;
      key = o ? -o.dueAt : -1e9 - i;
    } else {
      const o = j.orderId != null ? s.orders[j.orderId] : null;
      key = o ? drumKey(s, j.recipe) * 1e3 - o.dueAt * 1e-3 : -1e9 - i;
    }
    if (key > bestKey) {
      bestKey = key;
      best = i;
    }
  }
  return best;
}

function scrap(s: SimState, j: Job, station: StationId, reason: string, early: boolean): void {
  s.acct.scrapCost += j.materialCost;
  s.stats.failures++;
  if (early) s.stats.failuresCaughtEarly++;
  delete s.jobs[j.id];
  s.notices.push({ type: 'failure', station, recipe: j.recipe, reason });
}

function deliver(s: SimState, j: Job): void {
  let o = j.orderId != null ? s.orders[j.orderId] : null;
  const fits = (ord: Order | null) =>
    !!ord && ord.status === 'aceito' && ord.lines.some((l) => l.recipe === j.recipe && l.delivered < l.qty);
  if (!fits(o)) {
    o = null;
    let bestDue = Number.POSITIVE_INFINITY;
    for (const k in s.orders) {
      const c = s.orders[k];
      if (fits(c) && c.dueAt < bestDue) {
        bestDue = c.dueAt;
        o = c;
      }
    }
    if (o) {
      // libera uma poção menos avançada que estava reservada para este pedido
      const line = o.lines.find((l) => l.recipe === j.recipe)!;
      const mine = Object.values(s.jobs).filter((x) => x.orderId === o!.id && x.recipe === j.recipe && x.id !== j.id);
      if (line.delivered + 1 + mine.length > line.qty && mine.length) {
        mine.sort((a, b) => a.step - b.step);
        mine[0].orderId = null;
      }
    }
  }
  if (!o) {
    j.location = 'prateleira';
    j.station = null;
    j.orderId = null;
    s.notices.push({ type: 'job-move', job: j.id, recipe: j.recipe, from: 'balcao', to: 'prateleira' });
    return;
  }
  const line = o.lines.find((l) => l.recipe === j.recipe && l.delivered < l.qty)!;
  line.delivered++;
  const late = s.t > o.dueAt;
  const full = RECIPES[j.recipe].price * o.priceMult;
  const paid = late ? full * (1 - RECIPES[j.recipe].latePenalty) : full;
  s.cash += paid;
  s.acct.revenue += paid;
  s.acct.ctvSold += j.materialCost;
  if (late) s.acct.lostToLateness += full - paid;
  o.revenue += paid;
  if (late) o.late = true;
  s.stats.delivered++;
  if (late) s.stats.deliveredLate++;
  else s.stats.deliveredOnTime++;
  s.stats.leadTimeSum += s.t - j.releasedAt;
  s.stats.leadTimeCount++;
  s.deliveryTimes.push(s.t);
  delete s.jobs[j.id];
  s.notices.push({ type: 'delivered', order: o.id, recipe: j.recipe, amount: paid, late });
  if (orderNeeds(o) === 0) {
    closeOrder(s, o, 'concluido');
    s.stats.ordersCompleted++;
    s.stats.orderLeadSum += s.t - o.acceptedAt;
    s.stats.orderLeadCount++;
    changeReputation(s, o.late ? -4 : o.vip ? 6 : 2);
    addLog(s, o.late ? 'ruim' : 'bom', `Pedido #${o.id} de ${o.client.name} entregue${o.late ? ' com atraso' : ''}.`);
  }
}

function finishStep(s: SimState, j: Job, station: StationId): void {
  const recipe = RECIPES[j.recipe];
  s.stations[station].processed++;
  s.notices.push({ type: 'job-done', station, recipe: j.recipe });
  if (station === 'caldeirao' && j.defect === 'nenhum') {
    const fail = withRng(s, 'rngProc', (r) => r.chance(recipe.processFailRate));
    if (fail) j.defect = 'processo';
  }
  if (station === 'preparo' && s.policies.inspection === 'entrada' && j.defect === 'ingrediente') {
    scrap(s, j, station, 'Inspeção na entrada: ingredientes ruins descartados antes de gastar o caldeirão.', true);
    return;
  }
  if (station === 'resfriamento' && j.defect !== 'nenhum') {
    scrap(
      s,
      j,
      station,
      j.defect === 'processo'
        ? 'A mistura desandou: reprovada na verificação final.'
        : 'Ingrediente ruim: reprovada na verificação final.',
      false,
    );
    return;
  }
  j.step++;
  if (j.step >= recipe.route.length) {
    deliver(s, j);
    return;
  }
  const next = recipe.route[j.step].station;
  j.location = 'fila';
  j.station = next;
  j.queuedAt = s.t;
  s.stations[next].queue.push(j.id);
  s.notices.push({ type: 'job-move', job: j.id, recipe: j.recipe, from: station, to: next });
}

function processTime(s: SimState, station: StationId, j: Job): number {
  const step = RECIPES[j.recipe].route[j.step];
  let t = step.time;
  if (station === 'preparo' && s.policies.inspection === 'entrada') t += POLICY_COSTS.inspectionEntryExtra;
  return t;
}

function fillSlots(s: SimState, st: StationState, slots: number): void {
  while (st.active.length < slots && st.queue.length > 0) {
    const idx = pickFromQueue(s, st);
    if (idx < 0) break;
    const id = st.queue.splice(idx, 1)[0];
    const j = s.jobs[id];
    if (!j) continue;
    // ervas preparadas que murcharam na fila são percebidas antes de começar
    if (j.spoiled) {
      scrap(s, j, st.id, 'Os ingredientes preparados murcharam esperando na fila.', true);
      continue;
    }
    j.location = 'processo';
    j.boosted = false;
    const setup = s.policies.setupExternal[st.id] ? 0 : st.setupTime;
    const total = processTime(s, st.id, j);
    st.active.push({ job: id, setupLeft: setup, remaining: total, total });
    s.notices.push({ type: 'job-start', station: st.id, recipe: j.recipe });
  }
}

function updateStations(s: SimState, mods: Mods): void {
  for (const id of STATION_ORDER) {
    const st = s.stations[id];
    if (st.locked) continue;
    // pausas programadas (intervalos da equipe)
    if (st.breakEvery > 0 && s.t >= st.nextBreakAt) {
      st.nextBreakAt += st.breakEvery;
      if (!s.policies.breakCover[id]) st.breakUntil = s.t + st.breakDuration;
    }
    if (s.policies.breakCover[id] && st.breakUntil > s.t) st.breakUntil = s.t;
    const slots = effectiveSlots(s, id, mods);
    const stopped = st.paused || s.t < st.downUntil || s.t < st.breakUntil;
    st.maxQueue = Math.max(st.maxQueue, st.queue.length);
    if (stopped) {
      st.stoppedTime += DT * slots;
      continue;
    }
    fillSlots(s, st, slots);
    const speed = effectiveSpeed(s, id, mods);
    const done: number[] = [];
    for (const task of st.active) {
      st.busyTime += DT;
      if (task.setupLeft > 0) {
        task.setupLeft -= DT;
        st.setupSpent += DT;
        if (task.setupLeft < 0) {
          task.remaining += task.setupLeft * speed;
          task.setupLeft = 0;
        }
      } else {
        task.remaining -= DT * speed;
      }
      if (task.setupLeft <= 0 && task.remaining <= 1e-9) done.push(task.job);
    }
    if (done.length) {
      st.active = st.active.filter((t) => !done.includes(t.job));
      for (const jid of done) {
        const j = s.jobs[jid];
        if (j) finishStep(s, j, id);
      }
      fillSlots(s, st, slots);
    }
    const idle = Math.max(0, slots - st.active.length);
    if (idle > 0 && st.queue.length === 0) st.starvedTime += DT * idle;
  }
}

function updateSpoilage(s: SimState): void {
  if (s.spoilTime <= 0) return;
  for (const k in s.jobs) {
    const j = s.jobs[k];
    if (j.location !== 'fila' || j.step < 1 || j.spoiled) continue;
    // só os ingredientes preparados que ainda não foram fervidos/destilados estragam
    const prevStation = RECIPES[j.recipe].route[j.step - 1].station;
    if (prevStation !== 'preparo') continue;
    if (s.t - j.queuedAt > s.spoilTime) {
      j.spoiled = true;
      j.defect = 'ingrediente';
      s.stats.spoiled++;
    }
  }
}

// ---------------------------------------------------------------- melhorias

export function applyUpgradeEffect(s: SimState, id: string): void {
  const u = UPGRADES[id as keyof typeof UPGRADES];
  const st = s.stations[u.station];
  if (u.effect.slots) st.slots += u.effect.slots;
  if (u.effect.speedMult) st.speedMult *= u.effect.speedMult;
}

function updateUpgrades(s: SimState): void {
  for (const own of s.upgradesOwned) {
    if (!own.applied && s.t >= own.activeAt) {
      own.applied = true;
      const u = UPGRADES[own.id];
      applyUpgradeEffect(s, own.id);
      s.stations[u.station].costPerSec += u.opCostPerSec;
      s.stations[u.station].installing = null;
      addLog(s, 'bom', `${u.name} instalado(a). A capacidade da ${STATIONS[u.station].short} mudou.`);
      s.notices.push({ type: 'upgrade-ready', upgrade: own.id, station: u.station });
    }
  }
}

// ---------------------------------------------------------------- eventos

export function startEvent(s: SimState, ev: Omit<ScheduledEvent, 'at'>): ActiveEvent | null {
  const duration = ev.duration ?? EVENT_DURATIONS[ev.kind];
  const txt = describeEvent(ev.kind, { ...ev, duration });
  const active: ActiveEvent = {
    id: s.nextEventId++,
    kind: ev.kind,
    start: s.t,
    end: s.t + duration,
    station: ev.station,
    recipe: ev.recipe,
    ingredient: ev.ingredient,
    title: txt.title,
    text: ev.message || txt.text,
  };
  switch (ev.kind) {
    case 'manutencao':
      if (ev.station) {
        const st = s.stations[ev.station];
        st.downUntil = Math.max(st.downUntil, s.t + duration);
        st.downReason = 'manutenção';
      }
      break;
    case 'cliente_vip': {
      const recipe = ev.recipe || 'visao';
      const o = createOrder(s, { recipe, qty: 2, vip: true });
      if (!s.policies.autoAccept) {
        o.acceptBy = s.t + s.acceptWindow;
      }
      break;
    }
    case 'mudanca_demanda':
      if (ev.demand) {
        s.demand = { ...s.demand, ...ev.demand, mix: { ...(ev.demand.mix || s.demand.mix) } };
      }
      break;
    case 'cristal_temporario':
      if (!ev.station) s.pendingCrystal = active.id;
      break;
    default:
      break;
  }
  s.events.push(active);
  addLog(s, 'evento', `${active.title}: ${active.text}`);
  s.notices.push({ type: 'event', event: active });
  if (ev.kind === 'cristal_temporario' && !ev.station) {
    s.notices.push({ type: 'decision-needed', kind: 'cristal', eventId: active.id });
  }
  return active;
}

const DYNAMIC_POOL: { kind: EventKind; weight: number; negative: boolean }[] = [
  { kind: 'tempestade', weight: 2, negative: true },
  { kind: 'manutencao', weight: 2, negative: true },
  { kind: 'cliente_vip', weight: 2, negative: false },
  { kind: 'lote_ruim', weight: 2, negative: true },
  { kind: 'feira', weight: 2, negative: false },
  { kind: 'aprendiz_ausente', weight: 1.5, negative: true },
  { kind: 'desconto', weight: 1.5, negative: false },
  { kind: 'cristal_temporario', weight: 1.5, negative: false },
];

function updateEvents(s: SimState): void {
  while (s.scheduled.length && s.scheduled[0].at <= s.t) {
    const ev = s.scheduled.shift()!;
    startEvent(s, ev);
  }
  // eventos instantâneos (sem duração) ficam só no registro
  s.events = s.events.filter((e) => e.end > s.t);
  const dyn = s.dynamicEvents;
  if (dyn.enabled && s.t >= dyn.nextAt && s.t < s.duration - 30) {
    withRng(s, 'rngDemand', (r) => {
      const negativeActive = s.events.some((e) => DYNAMIC_POOL.find((p) => p.kind === e.kind)?.negative);
      const pool = DYNAMIC_POOL.filter((p) => !(negativeActive && p.negative));
      const w: Record<string, number> = {};
      for (const p of pool) w[p.kind] = p.weight;
      const kind = r.pickWeighted(w) as EventKind;
      const unlocked = STATION_ORDER.filter((x) => !s.stations[x].locked && x !== 'balcao');
      const ev: Omit<ScheduledEvent, 'at'> = { kind };
      if (kind === 'manutencao' || kind === 'aprendiz_ausente') ev.station = unlocked[r.int(0, unlocked.length - 1)];
      if (kind === 'feira' || kind === 'cliente_vip') ev.recipe = s.recipes[r.int(0, s.recipes.length - 1)];
      if (kind === 'lote_ruim' || kind === 'desconto') {
        const ings = ingredientsInUse(s);
        ev.ingredient = ings[r.int(0, ings.length - 1)];
      }
      dyn.nextAt = s.t + r.range(40, 65) / dyn.intensity;
      startEvent(s, ev);
    });
  }
}

// ---------------------------------------------------------------- amostragem

function sample(s: SimState): void {
  const ser = s.series;
  ser.t.push(s.t);
  ser.delivered.push(s.stats.delivered);
  ser.wip.push(wipCount(s));
  ser.cash.push(s.cash);
  ser.throughput.push(throughputGain(s));
  for (const id of STATION_ORDER) {
    ser.queues[id].push(s.stations[id].queue.length);
    ser.busy[id].push(s.stations[id].busyTime);
  }
  s.nextSampleAt = s.t + SAMPLE_EVERY;
}

function updateDecisions(s: SimState): void {
  for (const d of s.decisions) {
    if (d.deliveredAfter == null && s.t >= d.t + 60) {
      d.deliveredAfter = deliveredBetween(s, d.t, d.t + 60);
      d.wipAfter = wipCount(s);
    }
  }
  for (const h of s.hypotheses) {
    if (h.correct == null && s.t >= h.resolveAt) resolveHypothesis(s, h);
  }
}

export function resolveHypothesis(s: SimState, h: SimState['hypotheses'][number]): void {
  const a = analyzeCapacity(s);
  h.truth = a.constraint === 'mercado' && a.maxLoad >= 0.75 ? a.ranked[0] : a.constraint;
  h.correct = hypothesisMatches(a, h.station);
  const ev: string[] = [];
  const ranked = [...STATION_ORDER].filter((x) => !s.stations[x].locked);
  ranked.sort((x, y) => observedUtilization(s, y) - observedUtilization(s, x));
  for (const id of ranked.slice(0, 3)) {
    ev.push(
      `${STATIONS[id].short}: ocupada ${(observedUtilization(s, id) * 100).toFixed(0)}% do tempo, fila média ${averageQueue(s, id).toFixed(1)}, capacidade para o mix atual ≈ ${a.loads[id].mixCapacityPerMin.toFixed(1)} poções/min.`,
    );
  }
  ev.push(`Demanda atual ≈ ${a.demandPerMin.toFixed(1)} poções/min.`);
  h.evidence = ev;
  addLog(
    s,
    h.correct ? 'bom' : 'ruim',
    h.correct
      ? `Hipótese confirmada: ${h.station === 'mercado' ? 'a demanda' : STATIONS[h.station].short} limita a loja.`
      : `Hipótese não confirmada: ${h.station === 'mercado' ? 'a demanda' : STATIONS[h.station].short} não é o que limita a loja agora.`,
  );
  s.notices.push({ type: 'hypothesis', correct: h.correct, station: h.station });
}

// ---------------------------------------------------------------- passo principal

export function stepSim(s: SimState): void {
  if (s.finished) return;
  const mods = currentMods(s);

  updateEvents(s);
  updateUpgrades(s);
  updateSupply(s, mods);

  // chegada de clientes
  while (s.t >= s.nextArrivalAt && s.nextArrivalAt < s.duration - 20) {
    createOrder(s);
    const mean = 60 / Math.max(0.01, s.demand.ordersPerMin * mods.demandRateMult);
    const gap = withRng(s, 'rngDemand', (r) => mean * r.range(0.55, 1.45));
    s.nextArrivalAt += gap;
  }
  if (s.nextArrivalAt >= s.duration - 20 && s.nextArrivalAt < s.duration) s.nextArrivalAt = Number.POSITIVE_INFINITY;

  updateOrders(s);
  releaseWork(s, mods);
  updateStations(s, mods);
  updateSpoilage(s);

  // despesas operacionais
  let rate = s.rentPerSec;
  for (const id of STATION_ORDER) {
    const st = s.stations[id];
    if (st.locked) continue;
    rate += st.costPerSec;
    if (s.policies.setupExternal[id] && st.setupTime > 0) rate += POLICY_COSTS.setupExternal;
    if (s.policies.breakCover[id] && st.breakEvery > 0) rate += POLICY_COSTS.breakCover;
  }
  const inv = Object.keys(s.jobs).length;
  const holding = inv * s.wipHoldingCost;
  s.acct.opCash += (rate + holding) * DT;
  s.acct.wipHolding += holding * DT;
  s.cash -= (rate + holding) * DT;
  for (const own of s.upgradesOwned) {
    const u = UPGRADES[own.id];
    if (u.price > 0) s.acct.depreciation += (u.price / (u.lifeDays * DAY_REFERENCE)) * DT;
  }

  const wip = wipCount(s);
  s.stats.wipIntegral += wip * DT;
  s.stats.maxWip = Math.max(s.stats.maxWip, wip);

  s.t = Math.round((s.t + DT) * 1000) / 1000;
  if (s.t >= s.nextSampleAt) sample(s);
  updateDecisions(s);
  if (s.t >= s.duration) {
    s.finished = true;
    sample(s);
  }
}

/** Avança a simulação por `seconds` segundos de jogo (passos fixos). */
export function advance(s: SimState, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && !s.finished; i++) stepSim(s);
}

export function averageWip(s: SimState): number {
  return s.t > 0 ? s.stats.wipIntegral / s.t : 0;
}

export { effectiveTime };
