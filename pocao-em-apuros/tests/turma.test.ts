import { describe, expect, it } from 'vitest';
import { getPhase, TURMA_SURGE, TURMA_UPGRADES } from '../src/data/phases';
import * as A from '../src/sim/actions';
import { analyzeCapacity } from '../src/sim/analysis';
import { advance, averageWip, createSim, netProfit, startEvent } from '../src/sim/engine';
import type { SimState } from '../src/sim/types';

// Mesma sequência de etapas que o guia do Desafio da Turma aplica (src/game/turma.ts).
function surge(s: SimState) {
  startEvent(s, { kind: 'mudanca_demanda', demand: TURMA_SURGE });
  s.upgradesAvailable = [...TURMA_UPGRADES];
}

function play(smart: boolean, seed?: number) {
  const ph = getPhase('turma');
  const s = createSim(seed != null ? { ...ph.scenario, seed } : ph.scenario);
  const first = analyzeCapacity(s).ranked[0];
  advance(s, 40);
  if (smart) {
    A.registerHypothesis(s, 'caldeirao', 0);
    A.setHelper(s, 'caldeirao');
    A.setStationPolicy(s, 'setupExternal', 'caldeirao', true);
    A.setStationPolicy(s, 'breakCover', 'caldeirao', true);
    A.setPolicy(s, 'release', 'corda');
  }
  advance(s, 100); // t = 140
  surge(s);
  if (smart) A.buyUpgrade(s, 'caldeirao_extra');
  advance(s, 30); // t = 170
  const after = analyzeCapacity(s);
  if (smart) {
    A.setPolicy(s, 'drum', after.ranked[0]);
    A.setHelper(s, after.ranked[0]);
    A.setPolicy(s, 'priority', 'ganho');
  }
  advance(s, 400);
  return { s, first, after: after.ranked[0], delivered: s.stats.delivered, np: netProfit(s), wip: averageWip(s) };
}

describe('Desafio da Turma', () => {
  it('a restrição começa no caldeirão e passa para a destilação depois do segundo caldeirão', () => {
    const r = play(true);
    expect(r.first).toBe('caldeirao');
    expect(r.after).toBe('destilacao');
  });
  it('decidir pela TOC entrega mais, lucra mais e tem menos estoque em processo que não decidir', () => {
    for (const seed of [undefined, 7, 99]) {
      const smart = play(true, seed);
      const passive = play(false, seed);
      console.log(`seed ${seed}: esperto ${smart.delivered} ent, LL ${Math.round(smart.np)}, EP ${smart.wip.toFixed(1)} | passivo ${passive.delivered} ent, LL ${Math.round(passive.np)}, EP ${passive.wip.toFixed(1)}, rep ${passive.s.reputation}`);
      expect(smart.delivered).toBeGreaterThan(passive.delivered);
      expect(smart.np).toBeGreaterThan(passive.np + 200);
      expect(smart.wip).toBeLessThan(passive.wip);
      expect(passive.s.finished).toBe(true);
    }
  });
});
