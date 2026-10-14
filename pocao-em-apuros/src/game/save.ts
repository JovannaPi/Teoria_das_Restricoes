// Salvamento local (localStorage): progresso, configurações e partida em andamento.
// Tudo protegido por try/catch: o jogo funciona mesmo sem armazenamento disponível.
import type { AudioSettings } from '../audio/sfx';
import type { SimState } from '../sim/types';

const KEY = 'pocao-em-apuros:v1';

export interface PhaseProgress {
  completed: boolean;
  bestScore: number;
  stars: number;
  attempts: number;
}

export interface SaveData {
  version: 1;
  progress: Record<string, PhaseProgress>;
  teacherMode: boolean; // libera todas as fases (para aulas)
  settings: { audio: AudioSettings; defaultSpeed: number; reduceMotion: boolean };
  run: { phaseId: string; sim: SimState; tutorialStep: number; savedAt: number; helperPos?: { x: number; y: number } } | null;
  glossarySeen: boolean;
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    progress: {},
    teacherMode: false,
    settings: { audio: { master: 0.7, sfx: 0.8, ambience: 0.35, muted: false }, defaultSpeed: 1, reduceMotion: false },
    run: null,
    glossarySeen: false,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1) return defaultSave();
    return { ...defaultSave(), ...data, settings: { ...defaultSave().settings, ...data.settings } };
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento */
  }
}

export function phaseUnlocked(save: SaveData, order: string[], id: string): boolean {
  if (save.teacherMode) return true;
  const idx = order.indexOf(id);
  if (idx <= 0) return true;
  if (id === 'mestra') return !!save.progress['fase5']?.completed;
  if (id === 'fase1') return true; // o tutorial é recomendado, mas não obrigatório
  return !!save.progress[order[idx - 1]]?.completed;
}
