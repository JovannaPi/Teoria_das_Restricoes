// Modificadores temporários derivados dos eventos ativos.
import { POLICY_COSTS, STATION_ORDER } from '../data/stations';
import type { IngredientId, RecipeId, SimState, StationId } from './types';

export interface Mods {
  speed: Record<StationId, number>;
  slotsDelta: Record<StationId, number>;
  leadMult: number;
  defectAdd: Partial<Record<IngredientId, number>>;
  priceMult: Partial<Record<IngredientId, number>>;
  demandRateMult: number;
  mixBoost: Partial<Record<RecipeId, number>>;
}

export function currentMods(s: SimState): Mods {
  const speed = {} as Record<StationId, number>;
  const slotsDelta = {} as Record<StationId, number>;
  for (const id of STATION_ORDER) {
    speed[id] = 1;
    slotsDelta[id] = 0;
  }
  const m: Mods = { speed, slotsDelta, leadMult: 1, defectAdd: {}, priceMult: {}, demandRateMult: 1, mixBoost: {} };
  for (const e of s.events) {
    if (s.t < e.start || s.t >= e.end) continue;
    switch (e.kind) {
      case 'tempestade':
        m.leadMult *= 3;
        break;
      case 'lote_ruim':
        if (e.ingredient) m.defectAdd[e.ingredient] = (m.defectAdd[e.ingredient] || 0) + 0.3;
        break;
      case 'feira':
        m.demandRateMult *= 1.3;
        if (e.recipe) m.mixBoost[e.recipe] = (m.mixBoost[e.recipe] || 1) * 2;
        break;
      case 'aprendiz_ausente':
        if (e.station) m.slotsDelta[e.station] -= 1;
        break;
      case 'desconto':
        if (e.ingredient) m.priceMult[e.ingredient] = (m.priceMult[e.ingredient] || 1) * 0.6;
        break;
      case 'cristal_temporario':
        if (e.station) m.speed[e.station] *= 1.5;
        break;
      default:
        break;
    }
  }
  return m;
}

export function effectiveSlots(s: SimState, id: StationId, mods: Mods): number {
  return Math.max(1, s.stations[id].slots + mods.slotsDelta[id]);
}

export function effectiveSpeed(s: SimState, id: StationId, mods: Mods): number {
  const st = s.stations[id];
  let v = st.speedMult * mods.speed[id];
  // estação com uma só pessoa que perde a aprendiz trabalha pela metade
  if (st.slots + mods.slotsDelta[id] < 1) v *= 0.5;
  if (s.helper === id) v *= POLICY_COSTS.helperBonus;
  return v;
}
