import { describe, expect, it } from 'vitest';
import { report } from '../scripts/balance-report';
import { runStrategy } from './strategies';

const SEEDS = [11, 22, 33];

describe('relatório de balanceamento', () => {
  it('imprime resultados das estratégias', () => {
    const out = report(['fase1', 'fase2', 'fase3', 'fase4', 'fase5', 'mestra'], SEEDS);
    console.log(out);
    expect(out.length).toBeGreaterThan(0);
  });
});

// Validação pedagógica: a estratégia ingênua perde e a estratégia que aplica o
// passo da TOC daquela fase vence — em várias sementes.
describe('cada fase ensina o passo certo', () => {
  const winsAll = (phase: string, strat: Parameters<typeof runStrategy>[1]) =>
    [undefined, ...SEEDS].every((sd) => runStrategy(phase, strat, sd).won);
  const losesAll = (phase: string, strat: Parameters<typeof runStrategy>[1]) =>
    [undefined, ...SEEDS].every((sd) => !runStrategy(phase, strat, sd).won);

  it('fase 1: identificar corretamente vence', () => {
    expect(winsAll('fase1', 'foco')).toBe(true);
  });
  it('fase 2: sem explorar perde; explorando vence', () => {
    expect(losesAll('fase2', 'passiva')).toBe(true);
    expect(winsAll('fase2', 'foco')).toBe(true);
  });
  it('fase 3: produção indiscriminada perde; sincronizar vence', () => {
    expect(losesAll('fase3', 'passiva')).toBe(true);
    expect(losesAll('fase3', 'indiscriminada')).toBe(true);
    expect(winsAll('fase3', 'sincronizada')).toBe(true);
  });
  it('fase 4: não investir ou investir fora da restrição perde; investir na restrição vence', () => {
    expect(losesAll('fase4', 'sincronizada')).toBe(true);
    expect(losesAll('fase4', 'investe_antecipado')).toBe(true);
    expect(winsAll('fase4', 'investe_gargalo')).toBe(true);
  });
  it('fase 5: manter a corda antiga perde; reidentificar vence', () => {
    expect(losesAll('fase5', 'passiva')).toBe(true);
    expect(winsAll('fase5', 'sincronizada')).toBe(true);
  });
  it('bruxa mestra: é possível vencer gerenciando pela restrição', () => {
    expect(runStrategy('mestra', 'investe_gargalo').won || runStrategy('mestra', 'sincronizada').won).toBe(true);
    expect(runStrategy('mestra', 'indiscriminada').won).toBe(false);
  });
});
