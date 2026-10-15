import { describe, expect, it } from 'vitest';
import { getPhase } from '../src/data/phases';
import { STATION_ORDER } from '../src/data/stations';
import { LAYOUT, LINA_HOME, MENTOR_SPOT } from '../src/render/layout';
import { findPath, free, nearestFree, OBSTACLES } from '../src/render/walk';
import * as A from '../src/sim/actions';
import { advance, createSim } from '../src/sim/engine';
import type { Game } from '../src/game/game';
import { struggle, talkLines, tocStage } from '../src/game/talk';

function pathOk(ax: number, ay: number, pts: { x: number; y: number }[]) {
  let x = ax;
  let y = ay;
  for (const p of pts) {
    const n = Math.ceil(Math.hypot(p.x - x, p.y - y));
    for (let k = 1; k <= n; k++) if (!free(x + ((p.x - x) * k) / n, y + ((p.y - y) * k) / n)) return false;
    x = p.x;
    y = p.y;
  }
  return true;
}

describe('andar pela loja', () => {
  it('móveis bloqueiam e o chão livre não', () => {
    for (const r of OBSTACLES) expect(free(r.x + r.w / 2, r.y + r.h / 2, false)).toBe(false);
    expect(free(LINA_HOME.x, LINA_HOME.y)).toBe(true);
    expect(free(240, 60)).toBe(false); // parede do fundo
  });
  it('os lugares onde a bruxa ajuda cada estação são alcançáveis a partir de casa', () => {
    for (const id of STATION_ORDER) {
      const h = LAYOUT[id].help;
      const p = findPath(LINA_HOME.x, LINA_HOME.y, h.x, h.y);
      const end = p[p.length - 1];
      expect(Math.hypot(end.x - h.x, end.y - h.y)).toBeLessThan(10);
      expect(pathOk(LINA_HOME.x, LINA_HOME.y, p)).toBe(true);
    }
  });
  it('o caminho contorna o caldeirão em vez de atravessá-lo', () => {
    const p = findPath(150, 150, 260, 150);
    expect(p.length).toBeGreaterThan(1);
    expect(pathOk(150, 150, p)).toBe(true);
  });
  it('dá para chegar perto da mentora e de cada aprendiz para conversar', () => {
    const spots = [MENTOR_SPOT, ...STATION_ORDER.flatMap((id) => LAYOUT[id].workers)];
    for (const w of spots) {
      const near = nearestFree(w.x + 12, w.y + 8);
      expect(Math.hypot(near.x - w.x, near.y - w.y)).toBeLessThan(34);
      const p = findPath(LINA_HOME.x, LINA_HOME.y, near.x, near.y);
      expect(pathOk(LINA_HOME.x, LINA_HOME.y, p)).toBe(true);
    }
  });
});

function fakeGame(phaseId: string) {
  const phase = getPhase(phaseId);
  const sim = createSim(phase.scenario);
  return { sim, phase, guide: null, talkHeard: new Set<string>() } as unknown as Game & { sim: ReturnType<typeof createSim> };
}

describe('conversas e dicas', () => {
  it('o passo da TOC acompanha as decisões do jogador (fase 1 → identificar → explorar → subordinar)', () => {
    const g = fakeGame('mestra');
    advance(g.sim, 60);
    expect(tocStage(g)).toBe('identificar');
    const c = 'caldeirao';
    g.sim.hypotheses.push({ t: g.sim.t, station: c, resolveAt: g.sim.t, correct: true, truth: c, evidence: [] });
    const st = tocStage(g);
    expect(['explorar', 'subordinar', 'manter', 'repetir', 'elevar']).toContain(st);
  });
  it('a mentora começa com uma pergunta, depois explica e só no fim dá a orientação com números', () => {
    const g = fakeGame('turma');
    advance(g.sim, 60);
    const l0 = talkLines(g, 'mentora', 0)[0].text;
    const l1 = talkLines(g, 'mentora', 1)[0].text;
    const l2 = talkLines(g, 'mentora', 2)[0].text;
    expect(l0).toMatch(/\?/);
    expect(l0).not.toMatch(/Caldeirão/);
    expect(l1).not.toMatch(/Caldeirão/);
    expect(l2).toMatch(/Caldeirão faz só [\d,]+\/min/);
  });
  it('cada estação aberta tem alguém com nome, que fala da própria estação', () => {
    const g = fakeGame('turma');
    advance(g.sim, 90);
    const names = new Set<string>();
    for (const id of STATION_ORDER) {
      if (g.sim.stations[id].locked) continue;
      const lines = talkLines(g, `aprendiz:${id}`, 0);
      names.add(lines[0].who);
      expect(lines[lines.length - 1].text.length).toBeGreaterThan(30);
    }
    expect(names.size).toBe(4);
  });
  it('a dificuldade (erros seguidos) aprofunda a primeira dica', () => {
    const g = fakeGame('fase1');
    expect(struggle(g)).toBe(0);
    for (let i = 0; i < 2; i++) A.registerHypothesis(g.sim, 'balcao', 0);
    advance(g.sim, 30);
    expect(g.sim.hypotheses.filter((h) => h.correct === false).length).toBeGreaterThanOrEqual(2);
    expect(struggle(g)).toBe(1);
  });
});
