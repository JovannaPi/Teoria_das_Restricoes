// Estratégias automáticas usadas para validar o balanceamento das fases.
// Elas só usam as mesmas ações disponíveis ao jogador e respeitam os bloqueios da fase.
import { getPhase, PhaseDef } from '../src/data/phases';
import { UPGRADES, UPGRADE_ORDER } from '../src/data/upgrades';
import { analyzeCapacity } from '../src/sim/analysis';
import * as A from '../src/sim/actions';
import { averageWip, createSim, netProfit, stepSim } from '../src/sim/engine';
import type { Policies, SimState, StationId } from '../src/sim/types';
import { evaluateAll, immediateDefeat } from '../src/game/objectives';

export type Lever = 'ajuda' | 'limpeza' | 'intervalo' | 'inspecao' | 'prioridade' | 'pulmao';

export interface Plan {
  levers: Lever[];
  sync: boolean; // corda + sem produção antecipada
  push: boolean; // força empurrar + produção antecipada
  invest: 'nenhum' | 'antecipado' | 'restricao';
  identify: 'certo' | 'ingenuo';
  retie: boolean; // passo 5: reamarrar ao novo gargalo depois de investir
}

const ALL: Lever[] = ['ajuda', 'limpeza', 'intervalo', 'inspecao', 'prioridade', 'pulmao'];

export const STRATEGY_PLANS = {
  passiva: { levers: [], sync: false, push: false, invest: 'nenhum', identify: 'ingenuo', retie: false },
  indiscriminada: { levers: [], sync: false, push: true, invest: 'nenhum', identify: 'ingenuo', retie: false },
  foco: { levers: ALL, sync: false, push: false, invest: 'nenhum', identify: 'certo', retie: false },
  sincronizada: { levers: ALL, sync: true, push: false, invest: 'nenhum', identify: 'certo', retie: false },
  investe_antecipado: { levers: [], sync: false, push: true, invest: 'antecipado', identify: 'ingenuo', retie: false },
  investe_gargalo: { levers: ALL, sync: true, push: false, invest: 'restricao', identify: 'certo', retie: true },
} satisfies Record<string, Plan>;

export type StrategyId = keyof typeof STRATEGY_PLANS;
export const STRATEGIES = Object.keys(STRATEGY_PLANS) as StrategyId[];

type Lockable = PhaseDef['lockedPolicies'][number];

function can(phase: PhaseDef, k: Lockable) {
  return !phase.lockedPolicies.includes(k);
}

function setP<K extends 'release' | 'drum' | 'bufferSize' | 'priority' | 'inspection' | 'keepBusy'>(
  s: SimState,
  phase: PhaseDef,
  k: K,
  v: Policies[K],
) {
  if (can(phase, k)) A.setPolicy(s, k, v);
}

function exploit(s: SimState, phase: PhaseDef, c: StationId, levers: Lever[]) {
  if (levers.includes('ajuda')) A.setHelper(s, c);
  if (levers.includes('limpeza') && can(phase, 'setupExternal')) A.setStationPolicy(s, 'setupExternal', c, true);
  if (levers.includes('intervalo') && can(phase, 'breakCover')) A.setStationPolicy(s, 'breakCover', c, true);
  if (levers.includes('inspecao')) setP(s, phase, 'inspection', 'entrada');
  if (levers.includes('prioridade')) setP(s, phase, 'priority', 'ganho');
  if (levers.includes('pulmao')) setP(s, phase, 'bufferSize', 4);
  setP(s, phase, 'drum', c);
}

/** A restrição como o jogador a enxergaria: a estação mais carregada. */
export function constraintNow(s: SimState): StationId {
  return analyzeCapacity(s).ranked[0];
}

export interface RunResult {
  strategy: string;
  phase: string;
  delivered: number;
  netProfit: number;
  cash: number;
  avgWip: number;
  canceled: number;
  late: number;
  reputation: number;
  won: boolean;
  defeat: string | null;
  finalConstraint: string;
  objectives: string;
}

export function runPlan(phaseId: string, plan: Plan, name: string, seedOverride?: number): RunResult {
  const phase: PhaseDef = getPhase(phaseId);
  const sc = seedOverride != null ? { ...phase.scenario, seed: seedOverride } : phase.scenario;
  const s = createSim(sc);
  let lastTick = -1;
  let identified = false;
  let invested = false;
  let reTied = false;
  let defeat: string | null = null;
  const smart = plan.identify === 'certo';
  while (!s.finished) {
    const sec = Math.floor(s.t);
    if (sec !== lastTick) {
      lastTick = sec;
      if (s.pendingCrystal != null) A.chooseCrystal(s, smart ? constraintNow(s) : 'preparo');
      if (plan.push && sec === 1) {
        setP(s, phase, 'release', 'empurrar');
        setP(s, phase, 'keepBusy', true);
        setP(s, phase, 'priority', 'fifo');
      }
      if (phase.hypothesisEnabled && !identified && sec >= 40 && sec % 20 === 0 && !s.hypotheses.some((h) => h.correct == null)) {
        if (!smart && s.hypotheses.length === 0) A.registerHypothesis(s, 'embalagem');
        else A.registerHypothesis(s, analyzeCapacity(s).maxLoad < 0.75 ? 'mercado' : constraintNow(s));
      }
      if (s.hypotheses.some((h) => h.correct)) identified = true;
      // o jogador esperto explora assim que sabe qual é a restrição
      const knows = phase.revealConstraint != null || identified || !phase.hypothesisEnabled;
      if (smart && knows && sec >= 5 && !s.decisions.some((d) => d.kind === 'helper')) {
        exploit(s, phase, constraintNow(s), plan.levers);
      }
      if (plan.sync && smart && knows && sec >= 6 && !s.decisions.some((d) => d.kind === 'release') && s.policies.release !== 'corda') {
        setP(s, phase, 'release', 'corda');
        setP(s, phase, 'keepBusy', false);
      }
      if (plan.sync && sec === 6) setP(s, phase, 'keepBusy', false);
      if (plan.invest === 'antecipado' && sec === 2) {
        const c = constraintNow(s);
        for (const id of [...UPGRADE_ORDER].sort((a, b) => UPGRADES[b].price - UPGRADES[a].price)) {
          if (UPGRADES[id].station !== c) A.buyUpgrade(s, id);
        }
      }
      if (plan.invest === 'restricao' && sec >= 25 && !invested && s.upgradesAvailable.length) {
        const c = constraintNow(s);
        const opts = s.upgradesAvailable.filter((u) => UPGRADES[u].station === c && !s.upgradesOwned.some((o) => o.id === u));
        opts.sort((a, b) => (UPGRADES[b].effect.slots ? 1 : 0) - (UPGRADES[a].effect.slots ? 1 : 0));
        if (opts[0]) A.buyUpgrade(s, opts[0]);
        invested = true;
      }
      if (plan.retie && invested && !reTied && s.upgradesOwned.every((u) => u.applied) && sec > 30) {
        const c = constraintNow(s);
        if (c !== s.policies.drum) exploit(s, phase, c, plan.levers);
        reTied = true;
      }
    }
    stepSim(s);
    defeat = immediateDefeat(s);
    if (defeat) break;
  }
  const obj = evaluateAll(s, phase);
  const won = !defeat && obj.every((o) => o.done);
  return {
    strategy: name,
    phase: phaseId,
    delivered: s.stats.delivered,
    netProfit: Math.round(netProfit(s)),
    cash: Math.round(s.cash),
    avgWip: +averageWip(s).toFixed(1),
    canceled: s.stats.ordersCanceled,
    late: s.stats.deliveredLate,
    reputation: Math.round(s.reputation),
    won,
    defeat,
    finalConstraint: analyzeCapacity(s).constraint,
    objectives: obj.map((o) => `${o.done ? '✓' : '✗'}${o.text}`).join(' '),
  };
}

export function runStrategy(phaseId: string, strat: StrategyId, seedOverride?: number): RunResult {
  return runPlan(phaseId, STRATEGY_PLANS[strat] as Plan, strat, seedOverride);
}
