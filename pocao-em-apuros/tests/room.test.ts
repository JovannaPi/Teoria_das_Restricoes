import { describe, expect, it } from 'vitest';
import { debatePrompts, isRoomCode, summarize, type RoomEntry } from '../src/online/room';

const row = (o: Partial<RoomEntry>): RoomEntry => ({
  sala: 'ABCD', jogadorId: Math.random().toString(36), bruxa: 'B', passo: 0, erros: 0,
  preparo: false, ocupado: false, fora: false, capFim: 0, pontos: -1, ...o,
});

describe('sala da turma', () => {
  it('aceita só códigos curtos de letras e números', () => {
    expect(isRoomCode('K7QM')).toBe(true);
    expect(isRoomCode('k7qm')).toBe(false);
    expect(isRoomCode('ABC')).toBe(false);
    expect(isRoomCode('ABCD; drop')).toBe(false);
  });

  it('conta quem está em cada passo, quem acertou de primeira e as armadilhas', () => {
    const s = summarize([
      row({ passo: 0 }),
      row({ passo: 1 }),
      row({ passo: 2, erros: 0 }),
      row({ passo: 3, erros: 2, preparo: true }),
      row({ passo: 4, erros: 0, ocupado: true }),
      row({ passo: 7, erros: 1, fora: true, capFim: 98, pontos: 80, bruxa: 'Jade' }),
      row({ passo: 7, erros: 0, capFim: 75, pontos: 61, bruxa: 'Runa' }),
    ]);
    expect(s.total).toBe(7);
    expect(s.porPasso).toEqual([1, 1, 1, 1, 1, 0, 0, 2]);
    expect(s.identificaram).toBe(5);
    expect(s.dePrimeira).toBe(3);
    expect([s.preparo, s.ocupado, s.fora]).toEqual([1, 1, 1]);
    expect(s.terminaram).toBe(2);
    expect(s.capMedia).toBeCloseTo(8.65, 2);
    expect(s.ranking.map((r) => r.bruxa)).toEqual(['Jade', 'Runa']);
  });

  it('as perguntas do debate usam o que a turma fez, sem nomes', () => {
    const s = summarize([row({ passo: 3, erros: 1, preparo: true }), row({ passo: 7, pontos: 70, capFim: 90, bruxa: 'Ônix', ocupado: true })]);
    const p = debatePrompts(s);
    expect(p.join(' ')).toMatch(/1 pessoa de 2 errou o gargalo/);
    expect(p.join(' ')).toMatch(/1 pessoa ajudou o Preparo/);
    expect(p.join(' ')).not.toMatch(/Ônix/);
  });
});
