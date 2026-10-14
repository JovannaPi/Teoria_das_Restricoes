// Gerador pseudoaleatório determinístico (mulberry32). O estado é um número,
// guardado dentro do SimState para que salvar/carregar reproduza a partida.

export function rngNext(state: { value: number }): number {
  let t = (state.value = (state.value + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export class Rng {
  constructor(public value: number) {}
  next(): number {
    return rngNext(this);
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pickWeighted<T extends string>(weights: Partial<Record<T, number>>): T {
    const entries = Object.entries(weights) as [T, number][];
    const total = entries.reduce((s, [, w]) => s + (w || 0), 0);
    let r = this.next() * total;
    for (const [k, w] of entries) {
      r -= w || 0;
      if (r <= 0) return k;
    }
    return entries[entries.length - 1][0];
  }
}
