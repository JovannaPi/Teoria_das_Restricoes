import { describe, expect, it } from 'vitest';
import { computeRanking, decodeVisual, encodeVisual } from '../src/online/leaderboard';
import { DEFAULT_HERO } from '../src/game/hero';

const base = { bruxa: 'B', visual: '', estrelas: 2, lucro: 0, entregas: 0 };

describe('placar', () => {
  it('soma a melhor pontuação de cada fase vencida e ignora derrotas e o tutorial', () => {
    const r = computeRanking([
      { ...base, jogadorId: 'a', jogador: 'Ana', fase: 'fase1', pontos: 70, venceu: true, criadoMs: 1 },
      { ...base, jogadorId: 'a', jogador: 'Ana', fase: 'fase1', pontos: 85, venceu: true, criadoMs: 2 },
      { ...base, jogadorId: 'a', jogador: 'Ana', fase: 'fase2', pontos: 99, venceu: false, criadoMs: 3 },
      { ...base, jogadorId: 'a', jogador: 'Ana', fase: 'tutorial', pontos: 100, venceu: true, criadoMs: 4 },
      { ...base, jogadorId: 'b', jogador: 'Bia', fase: 'fase1', pontos: 60, venceu: true, criadoMs: 1 },
      { ...base, jogadorId: 'b', jogador: 'Bia', fase: 'fase2', pontos: 50, venceu: true, criadoMs: 2 },
      { ...base, jogadorId: 'c', jogador: 'Caio', fase: 'fase1', pontos: 90, venceu: false, criadoMs: 1 },
    ]);
    expect(r.geral.map((p) => [p.jogador, p.total])).toEqual([
      ['Bia', 110],
      ['Ana', 85],
    ]);
    expect(r.porFase.fase1.map((p) => p.jogador)).toEqual(['Ana', 'Bia']);
    expect(r.porFase.fase2.map((p) => p.jogador)).toEqual(['Bia']);
  });

  it('empate: quem venceu mais fases fica na frente; usa o nome mais recente do jogador', () => {
    const r = computeRanking([
      { ...base, jogadorId: 'a', jogador: 'Ana', fase: 'fase1', pontos: 100, venceu: true, criadoMs: 1 },
      { ...base, jogadorId: 'b', jogador: 'Bia', fase: 'fase1', pontos: 50, venceu: true, criadoMs: 1 },
      { ...base, jogadorId: 'b', jogador: 'Beatriz', fase: 'fase2', pontos: 50, venceu: true, criadoMs: 5 },
    ]);
    expect(r.geral[0].jogador).toBe('Beatriz');
    expect(r.geral[0].vencidas).toBe(2);
  });

  it('aparência da bruxa vai e volta pelo texto compacto', () => {
    const h = { ...DEFAULT_HERO, skin: '#7a4e32', hairStyle: 'coque' as const, hat: 'capuz' as const };
    expect(decodeVisual(encodeVisual(h))).toMatchObject({ skin: '#7a4e32', hairStyle: 'coque', hat: 'capuz' });
  });
});
