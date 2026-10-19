import { describe, expect, it } from 'vitest';
import { getPhase, TURMA_SURGE, TURMA_UPGRADES } from '../src/data/phases';
import * as A from '../src/sim/actions';
import { analyzeCapacity } from '../src/sim/analysis';
import { advance, averageWip, createSim, deliveredBetween, netProfit, startEvent, wipCount } from '../src/sim/engine';
import type { SimState, StationId, UpgradeId } from '../src/sim/types';

// Mesma sequência de etapas que o guia do modo rápido aplica (src/game/turma.ts).
function surge(s: SimState) {
  startEvent(s, { kind: 'mudanca_demanda', demand: TURMA_SURGE });
  s.upgradesAvailable = [...TURMA_UPGRADES];
}

function sim(seed?: number) {
  const ph = getPhase('turma');
  return createSim(seed != null ? { ...ph.scenario, seed } : ph.scenario);
}

function play(smart: boolean, seed?: number) {
  const s = sim(seed);
  const first = analyzeCapacity(s).ranked[0];
  advance(s, 60);
  if (smart) {
    A.registerHypothesis(s, 'caldeirao', 0);
    A.setStationPolicy(s, 'setupExternal', 'caldeirao', true);
    A.setPolicy(s, 'drum', 'caldeirao');
    A.setPolicy(s, 'release', 'corda');
    A.setPolicy(s, 'keepBusy', false);
  }
  advance(s, 120); // t = 180
  surge(s);
  if (smart) A.buyUpgrade(s, 'caldeirao_extra');
  advance(s, 40); // t = 220
  const after = analyzeCapacity(s);
  if (smart) A.setPolicy(s, 'drum', after.ranked[0]);
  advance(s, 260); // t = 480
  return { s, first, after: after.ranked[0], delivered: s.stats.delivered, np: netProfit(s), wip: averageWip(s) };
}

/** Entregas num intervalo depois de uma decisão (mesma janela para comparar). */
function deliveredAfter(decide: (s: SimState) => void, seed?: number, extra = 0) {
  const s = sim(seed);
  advance(s, 60);
  decide(s);
  advance(s, 30 + extra);
  const t0 = s.t;
  advance(s, 180);
  return { s, n: deliveredBetween(s, t0, s.t), wip: averageWip(s) };
}

describe('Modo rápido (aula)', () => {
  it('é enxuto: 4 estações, 1 poção, sem eventos aleatórios', () => {
    const s = sim();
    const open = (Object.keys(s.stations) as StationId[]).filter((id) => !s.stations[id].locked);
    expect(open.sort()).toEqual(['balcao', 'caldeirao', 'destilacao', 'preparo']);
    expect(s.recipes).toEqual(['brilho']);
    expect(getPhase('turma').scenario.events.length).toBe(0);
  });

  it('a restrição começa no caldeirão e passa para a destilação depois do segundo caldeirão', () => {
    const r = play(true);
    expect(r.first).toBe('caldeirao');
    expect(r.after).toBe('destilacao');
  });

  it('decidir pela TOC entrega mais, lucra mais e tem menos estoque em processo que não decidir', () => {
    for (const seed of [undefined, 7, 99]) {
      const smart = play(true, seed);
      const passive = play(false, seed);
      console.log(`seed ${seed}: TOC ${smart.delivered} ent, LL ${Math.round(smart.np)}, EP ${smart.wip.toFixed(1)} | passivo ${passive.delivered} ent, LL ${Math.round(passive.np)}, EP ${passive.wip.toFixed(1)}`);
      expect(smart.delivered).toBeGreaterThan(passive.delivered * 1.2);
      expect(smart.np).toBeGreaterThan(passive.np);
      expect(smart.wip).toBeLessThan(passive.wip);
    }
  });

  it('melhorar uma estação que não é a restrição não aumenta as entregas; melhorar a restrição aumenta', () => {
    for (const seed of [undefined, 7, 99]) {
      const base = deliveredAfter(() => {}, seed).n;
      const helpPrep = deliveredAfter((s) => A.setHelper(s, 'preparo'), seed).n;
      const helpCald = deliveredAfter((s) => A.setHelper(s, 'caldeirao'), seed).n;
      const setup = deliveredAfter((s) => A.setStationPolicy(s, 'setupExternal', 'caldeirao', true), seed).n;
      console.log(`seed ${seed}: base ${base} | ajuda no preparo ${helpPrep} | ajuda no caldeirão ${helpCald} | limpeza em paralelo ${setup}`);
      expect(helpPrep).toBeLessThanOrEqual(base + 1);
      expect(helpCald).toBeGreaterThan(base);
      expect(setup).toBeGreaterThan(base + 1);
    }
  });

  it('com a procura maior, investir fora da restrição não aumenta as entregas; investir nela aumenta', () => {
    const buy = (u: UpgradeId | null) =>
      deliveredAfter(
        (s) => {
          surge(s);
          s.cash = 2000;
          if (u) expect(A.buyUpgrade(s, u).ok).toBe(true);
        },
        undefined,
        25,
      ).n;
    const none = buy(null);
    const cald = buy('caldeirao_extra');
    const dest = buy('alambique_duplo');
    const prep = buy('bancada_extra');
    console.log(`depois da procura maior: nada ${none} | 2º caldeirão ${cald} | alambique ${dest} | bancada ${prep}`);
    expect(cald).toBeGreaterThan(none * 1.3);
    expect(dest).toBeLessThanOrEqual(none + 1);
    expect(prep).toBeLessThanOrEqual(none + 1);
  });

  it('trocar "todo mundo ocupado" pelo ritmo da restrição (corda) diminui o estoque em processo sem perder entregas', () => {
    for (const seed of [undefined, 7, 99]) {
      const run = (rope: boolean) => {
        const s = sim(seed);
        advance(s, 60);
        if (rope) {
          A.setPolicy(s, 'drum', 'caldeirao');
          A.setPolicy(s, 'release', 'corda');
          A.setPolicy(s, 'keepBusy', false);
        }
        // estoque em processo médio na janela depois da decisão (amostra a cada 5 s)
        let sum = 0;
        let n = 0;
        const t0 = s.t;
        for (let k = 0; k < 36; k++) {
          advance(s, 5);
          sum += wipCount(s);
          n++;
        }
        return { wip: sum / n, n: deliveredBetween(s, t0, s.t) };
      };
      const push = run(false);
      const rope = run(true);
      console.log(`seed ${seed}: empurrar ${push.n} ent, EP ${push.wip.toFixed(1)} | corda ${rope.n} ent, EP ${rope.wip.toFixed(1)}`);
      expect(rope.wip).toBeLessThan(push.wip * 0.7);
      expect(rope.n).toBeGreaterThanOrEqual(push.n - 1);
    }
  });
  it('depois do 2º caldeirão a Destilação fica claramente sobrecarregada, qualquer que tenha sido a melhoria do passo 2', () => {
    for (const ex of ['setupExternal', 'breakCover', 'helper'] as const) {
      const s = sim();
      advance(s, 60);
      if (ex === 'helper') A.setHelper(s, 'caldeirao');
      else A.setStationPolicy(s, ex, 'caldeirao', true);
      surge(s);
      s.cash = 2000;
      A.buyUpgrade(s, 'caldeirao_extra');
      advance(s, 30);
      const a = analyzeCapacity(s);
      expect(a.constraint).toBe('destilacao');
      expect(a.loads.destilacao.load).toBeGreaterThan(1.3);
    }
  });

  it('se comprar também o alambique, nenhuma estação fica sobrecarregada (o passo 5 não pede uma restrição)', () => {
    const s = sim();
    advance(s, 60);
    A.setStationPolicy(s, 'setupExternal', 'caldeirao', true);
    surge(s);
    s.cash = 2000;
    A.buyUpgrade(s, 'alambique_duplo');
    A.buyUpgrade(s, 'caldeirao_extra');
    advance(s, 30);
    const a = analyzeCapacity(s);
    expect(a.constraint === 'mercado' || a.loads[a.constraint].load < 1).toBe(true);
  });
});
