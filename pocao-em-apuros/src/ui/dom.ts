// Pequenos utilitários de DOM e formatação (pt-BR).
import type { StationId } from '../sim/types';

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error('Elemento não encontrado: ' + sel);
  return el as HTMLElement;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function money(v: number): string {
  return (v < 0 ? '−' : '') + nf0.format(Math.abs(Math.round(v)));
}
export function n1(v: number): string {
  return nf1.format(v);
}
export function pct(v: number): string {
  return nf0.format(Math.round(v * 100)) + '%';
}

/** 1 segundo de simulação = 2 minutos no relógio da loja, que abre às 08:00. */
export function clock(t: number): string {
  const mins = 8 * 60 + Math.floor(t * 2);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Duração em minutos da loja (para prazos). */
export function shopMinutes(sec: number): string {
  const m = Math.round(sec * 2);
  if (Math.abs(m) >= 60) {
    const h = Math.floor(Math.abs(m) / 60);
    const r = Math.abs(m) % 60;
    return `${m < 0 ? '−' : ''}${h}h${r ? String(r).padStart(2, '0') : ''}`;
  }
  return `${m} min`;
}

// Cores categóricas das estações nos gráficos (validadas para daltonismo e contraste
// sobre a superfície escura #1c1424; sempre acompanhadas de rótulo direto/legenda).
export const STATION_COLORS: Record<StationId, string> = {
  preparo: '#3e9a5e',
  caldeirao: '#c27a16',
  destilacao: '#3c8fd0',
  resfriamento: '#d9404f',
  embalagem: '#9a5fd8',
  balcao: '#2aa3a3',
};
