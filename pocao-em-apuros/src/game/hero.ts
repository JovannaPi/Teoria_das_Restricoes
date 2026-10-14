// A bruxa do jogador: nome e aparência escolhidos na criação de personagem.
// O nome substitui "Lina" em todos os textos exibidos; a aparência substitui o sprite padrão.
import type { HairStyle, HatKind, Look } from '../render/sprites';
import { LOOKS } from '../render/sprites';

export interface HeroConfig {
  name: string; // nome da bruxa
  player: string; // nome do aluno (aparece no placar)
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  cloth: string;
  accent: string;
  hat: HatKind;
  hatColor: string;
}

export const SKIN_OPTIONS = ['#f6d7b8', '#f3cfa6', '#e0aa7a', '#c68c5e', '#a8704a', '#7a4e32', '#5a3624', '#88b860'];
export const HAIR_OPTIONS = ['#2a1810', '#5a3218', '#8a4a22', '#c47a2a', '#e8d070', '#d8d8e0', '#c0405a', '#5a3a9a', '#2e7a6e', '#e88ab0'];
export const CLOTH_OPTIONS = ['#1f2c52', '#46286a', '#6a3f9a', '#2e7a4e', '#a02a36', '#3d6e6a', '#8a6a2a', '#2a2a35', '#b8693a', '#c05a8a'];
export const ACCENT_OPTIONS = ['#46b06e', '#f5b84a', '#9a6ad0', '#e0485a', '#6ab4e0', '#f2e2c4'];
export const HATCOLOR_OPTIONS = ['#121a33', '#2a1840', '#46286a', '#1d4a32', '#5a1620', '#3a3846', '#8a4a12', '#c9a4f0'];
export const HAIRSTYLE_OPTIONS: [HairStyle, string][] = [
  ['longo', 'Longo'],
  ['curto', 'Curto'],
  ['coque', 'Coque'],
  ['tranca', 'Trança'],
  ['espetado', 'Espetado'],
  ['careca', 'Raspado'],
];
export const HAT_OPTIONS: [HatKind, string][] = [
  ['bruxa', 'Chapéu de bruxa'],
  ['bruxa_velha', 'Chapéu torto'],
  ['capuz', 'Capuz'],
  ['boina', 'Boina'],
  ['flor', 'Flor no cabelo'],
  ['tiara', 'Tiara'],
  ['nenhum', 'Sem chapéu'],
];

export const DEFAULT_HERO: HeroConfig = {
  name: 'Lina',
  player: '',
  skin: '#f3cfa6',
  hair: '#8a4a22',
  hairStyle: 'longo',
  cloth: '#1f2c52',
  accent: '#46b06e',
  hat: 'bruxa',
  hatColor: '#121a33',
};

let current: HeroConfig = { ...DEFAULT_HERO };

export function heroName(): string {
  return current.name || 'Lina';
}

export function hero(): HeroConfig {
  return current;
}

export function cleanName(v: string, max = 18): string {
  return v.replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function lookFromHero(h: HeroConfig): Look {
  const id = 'hero-' + [h.skin, h.hair, h.hairStyle, h.cloth, h.accent, h.hat, h.hatColor].join('-');
  return {
    id,
    skin: h.skin,
    hair: h.hair,
    cloth: h.cloth,
    cloth2: h.accent,
    hat: h.hat,
    hatColor: h.hatColor,
    hairStyle: h.hairStyle,
    species: h.skin === '#88b860' ? 'goblin' : 'humana',
    height: 18,
  };
}

/** Aplica a configuração: o sprite da protagonista passa a ser a bruxa criada. */
export function applyHero(h: HeroConfig): void {
  current = { ...DEFAULT_HERO, ...h };
  Object.assign(LOOKS.lina, lookFromHero(current));
}

/** Troca o nome padrão pelo nome escolhido em qualquer texto exibido. */
export function personalize(text: string): string {
  const n = heroName();
  return n === 'Lina' ? text : text.replace(/\bLina\b/g, n);
}

const FIRST = ['Ametista', 'Brisa', 'Cinza', 'Dália', 'Esmeralda', 'Faísca', 'Gaia', 'Hera', 'Íris', 'Jade', 'Lua', 'Malva', 'Névoa', 'Ônix', 'Pétala', 'Quartzo', 'Runa', 'Sálvia', 'Tília', 'Urze', 'Vesper', 'Zinnia'];
const LAST = ['do Caldeirão', 'Fumacenta', 'das Ervas', 'Lunar', 'Borbulhante', 'do Vale', 'Estrelada', 'Ventania', 'do Pântano', 'Cintilante'];

/** Nome mágico aleatório (não pede o nome real de ninguém). */
export function randomWitchName(): string {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  for (let i = 0; i < 20; i++) {
    const n = `${pick(FIRST)} ${pick(LAST)}`;
    if (n.length <= 18) return n;
  }
  return pick(FIRST);
}

export function randomHero(base: HeroConfig): HeroConfig {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return {
    ...base,
    skin: pick(SKIN_OPTIONS),
    hair: pick(HAIR_OPTIONS),
    hairStyle: pick(HAIRSTYLE_OPTIONS)[0],
    cloth: pick(CLOTH_OPTIONS),
    accent: pick(ACCENT_OPTIONS),
    hat: pick(HAT_OPTIONS.slice(0, 6))[0],
    hatColor: pick(HATCOLOR_OPTIONS),
  };
}
