// Análise de capacidade: calcula, a partir dos parâmetros reais do estado,
// a carga que a demanda atual impõe a cada estação. A estação com maior carga
// é a restrição; se nenhuma estação estiver saturada, a restrição é o mercado.
import { RECIPES, unitThroughput } from '../data/recipes';
import { POLICY_COSTS, STATION_ORDER } from '../data/stations';
import type { IngredientId, RecipeId, SimState, StationId } from './types';
import { currentMods, effectiveSlots, effectiveSpeed, Mods } from './mods';

export const MARKET_THRESHOLD = 0.92; // abaixo disso nenhuma estação está saturada: a demanda limita
export const NEAR_CONSTRAINT = 0.75; // estação mais carregada, mesmo sem saturar, ainda é a "quase restrição"

/**
 * Uma hipótese é correta se aponta a estação mais carregada (quando ela está
 * perto da saturação) ou o mercado (quando nenhuma estação está saturada).
 * Na faixa intermediária, as duas leituras são aceitas.
 */
export function hypothesisMatches(a: CapacityAnalysis, guess: StationId | 'mercado'): boolean {
  if (guess === 'mercado') return a.maxLoad < MARKET_THRESHOLD;
  return guess === a.ranked[0] && a.maxLoad >= NEAR_CONSTRAINT;
}

export interface StationLoad {
  station: StationId;
  slots: number;
  speed: number;
  availability: number;
  effTime: Partial<Record<RecipeId, number>>; // segundos por poção (inclui preparação de lote)
  capacityPerMin: Partial<Record<RecipeId, number>>; // poções/min se só fizesse aquela receita
  demandSecPerSec: number; // segundos de trabalho exigidos por segundo
  load: number; // carga / capacidade disponível
  mixCapacityPerMin: number; // poções/min que a estação consegue com o mix atual
}

export interface CapacityAnalysis {
  loads: Record<StationId, StationLoad>;
  constraint: StationId | 'mercado';
  ranked: StationId[];
  maxLoad: number;
  demandPerMin: number;
  demandByRecipe: Partial<Record<RecipeId, number>>; // poções/min
  systemCapacityPerMin: number;
}

/** Composição atual da demanda, incluindo os efeitos de eventos. */
export function currentMix(s: SimState, mods: Mods = currentMods(s)): Partial<Record<RecipeId, number>> {
  const mix: Partial<Record<RecipeId, number>> = {};
  for (const r of s.recipes) {
    const w = (s.demand.mix[r] || 0) * (mods.mixBoost[r] || 1);
    if (w > 0) mix[r] = w;
  }
  return mix;
}

export function expectedPotionsPerOrder(s: SimState): number {
  const avgQty = (s.demand.qtyMin + s.demand.qtyMax) / 2;
  return avgQty * (s.demand.maxLines > 1 ? 1.3 : 1);
}

/** Demanda esperada em poções por segundo, por receita. */
export function demandRates(s: SimState, mods: Mods = currentMods(s)): Partial<Record<RecipeId, number>> {
  const mix = currentMix(s, mods);
  const total = Object.values(mix).reduce((a, b) => a + (b || 0), 0) || 1;
  const perOrder = expectedPotionsPerOrder(s);
  const ordersPerSec = (s.demand.ordersPerMin * mods.demandRateMult) / 60;
  const out: Partial<Record<RecipeId, number>> = {};
  for (const [r, w] of Object.entries(mix) as [RecipeId, number][]) {
    out[r] = (ordersPerSec * perOrder * w) / total;
  }
  return out;
}

export function defectProb(s: SimState, recipe: RecipeId, mods: Mods = currentMods(s)): number {
  const r = RECIPES[recipe];
  let p = r.defectRate;
  for (const ing of Object.keys(r.ingredients) as IngredientId[]) p += mods.defectAdd[ing] || 0;
  return Math.min(0.9, p);
}

/** Tempo efetivo (s) de uma poção da receita na estação, incluindo preparação de lote. */
export function effectiveTime(s: SimState, station: StationId, recipe: RecipeId, mods: Mods = currentMods(s)): number | null {
  const step = RECIPES[recipe].route.find((x) => x.station === station);
  if (!step) return null;
  const st = s.stations[station];
  let time = step.time;
  if (station === 'preparo' && s.policies.inspection === 'entrada') time += POLICY_COSTS.inspectionEntryExtra;
  const speed = effectiveSpeed(s, station, mods);
  const setup = s.policies.setupExternal[station] ? 0 : st.setupTime;
  return time / speed + setup;
}

export function availability(s: SimState, station: StationId): number {
  const st = s.stations[station];
  if (st.breakEvery > 0 && !s.policies.breakCover[station]) {
    return Math.max(0.05, 1 - st.breakDuration / st.breakEvery);
  }
  return 1;
}

export function analyzeCapacity(s: SimState): CapacityAnalysis {
  const mods = currentMods(s);
  const rates = demandRates(s, mods);
  const loads = {} as Record<StationId, StationLoad>;
  let totalRate = 0;
  for (const r of Object.values(rates)) totalRate += r || 0;

  for (const id of STATION_ORDER) {
    const st = s.stations[id];
    const slots = effectiveSlots(s, id, mods);
    const speed = effectiveSpeed(s, id, mods);
    const avail = availability(s, id);
    const effTime: Partial<Record<RecipeId, number>> = {};
    const capacityPerMin: Partial<Record<RecipeId, number>> = {};
    let demandSec = 0;
    let weightedTime = 0;
    let weight = 0;
    for (const r of s.recipes) {
      const et = effectiveTime(s, id, r, mods);
      if (et == null) continue;
      effTime[r] = et;
      capacityPerMin[r] = (60 / et) * slots * avail;
      const rate = rates[r] || 0;
      // retrabalho esperado: refugos voltam a consumir as etapas anteriores à detecção
      const d = defectProb(s, r, mods);
      const early = s.policies.inspection === 'entrada' ? d : 0;
      const late = (s.policies.inspection === 'final' ? d : 0) + RECIPES[r].processFailRate;
      const attempts = 1 / Math.max(0.05, 1 - early - late);
      const route = RECIPES[r].route;
      const idx = route.findIndex((x) => x.station === id);
      const checkIdx = route.findIndex((x) => x.station === 'resfriamento');
      let passes = 1;
      if (idx === 0) passes = attempts;
      else if (idx <= checkIdx) passes = attempts * (1 - early);
      demandSec += rate * passes * et;
      weightedTime += rate * passes * et;
      weight += rate;
    }
    const capSec = slots * avail;
    const load = st.locked ? 0 : demandSec / capSec;
    const avgTime = weight > 0 ? weightedTime / weight : 0;
    const mixCap = avgTime > 0 ? (60 * capSec) / avgTime : Infinity;
    loads[id] = {
      station: id,
      slots,
      speed,
      availability: avail,
      effTime,
      capacityPerMin,
      demandSecPerSec: demandSec,
      load,
      mixCapacityPerMin: mixCap,
    };
  }
  const ranked = [...STATION_ORDER].sort((a, b) => loads[b].load - loads[a].load);
  const maxLoad = loads[ranked[0]].load;
  const constraint = maxLoad >= MARKET_THRESHOLD ? ranked[0] : 'mercado';
  const demandPerMin = totalRate * 60;
  const systemCapacityPerMin = maxLoad > 0 ? demandPerMin / Math.max(1, maxLoad) : demandPerMin;
  const demandByRecipe: Partial<Record<RecipeId, number>> = {};
  for (const [r, v] of Object.entries(rates) as [RecipeId, number][]) demandByRecipe[r] = v * 60;
  return { loads, constraint, ranked, maxLoad, demandPerMin, demandByRecipe, systemCapacityPerMin };
}

/** Ganho por segundo de uso de uma estação — critério de prioridade "ganho por minuto do gargalo". */
export function throughputPerStationSecond(s: SimState, recipe: RecipeId, station: StationId): number {
  const step = RECIPES[recipe].route.find((x) => x.station === station);
  if (!step) return Number.POSITIVE_INFINITY; // não consome a estação
  const setup = s.policies.setupExternal[station] ? 0 : s.stations[station].setupTime;
  return unitThroughput(recipe) / (step.time + setup);
}

/** Utilização observada (busy / tempo disponível) desde o início. */
export function observedUtilization(s: SimState, station: StationId): number {
  const st = s.stations[station];
  if (s.t <= 0) return 0;
  return Math.min(1, st.busyTime / (st.slots * s.t));
}

/** Utilização observada em uma janela recente usando as séries amostradas. */
export function recentUtilization(s: SimState, station: StationId, window = 60): number {
  const ser = s.series;
  const n = ser.t.length;
  if (n < 2) return observedUtilization(s, station);
  const tEnd = ser.t[n - 1];
  let i = n - 1;
  while (i > 0 && tEnd - ser.t[i] < window) i--;
  const dt = tEnd - ser.t[i];
  if (dt <= 0) return 0;
  const busy = ser.busy[station][n - 1] - ser.busy[station][i];
  return Math.min(1, busy / (s.stations[station].slots * dt));
}

export function averageQueue(s: SimState, station: StationId, window = 9999): number {
  const ser = s.series;
  const n = ser.t.length;
  if (n === 0) return s.stations[station].queue.length;
  const tEnd = ser.t[n - 1];
  let sum = 0;
  let c = 0;
  for (let i = n - 1; i >= 0 && tEnd - ser.t[i] <= window; i--) {
    sum += ser.queues[station][i];
    c++;
  }
  return c ? sum / c : 0;
}
