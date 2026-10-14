// Etiquetas HTML sobre a cena: nome da estação, fila e estado — texto nítido em qualquer escala.
import { STATION_ORDER, STATIONS } from '../data/stations';
import type { Game } from '../game/game';
import { H, LAYOUT, W } from '../render/layout';
import { esc, STATION_COLORS } from './dom';

let built = false;

export function renderOverlay(g: Game): void {
  const root = document.getElementById('overlay');
  const s = g.sim;
  if (!root || !s) return;
  if (!built || root.childElementCount === 0) {
    root.innerHTML =
      STATION_ORDER.map((id) => {
        const L = LAYOUT[id].label;
        return `<button class="tag" data-action="select-station" data-v="${id}" data-tag="${id}" style="left:${(L.x / W) * 100}%;top:${(L.y / H) * 100}%"><span class="tn">${esc(STATIONS[id].short)}</span><span class="tq"></span></button>`;
      }).join('') + '<div class="floats"></div><div class="paused-badge">PAUSADO</div>';
    built = true;
  }
  for (const id of STATION_ORDER) {
    const el = root.querySelector(`[data-tag="${id}"]`) as HTMLElement;
    const st = s.stations[id];
    el.hidden = st.locked;
    const q = el.querySelector('.tq') as HTMLElement;
    let state = '';
    if (st.paused) state = 'interrompida';
    else if (s.t < st.downUntil) state = st.downReason || 'parada';
    else if (s.t < st.breakUntil) state = 'intervalo';
    else if (st.active.length === 0) state = 'ociosa';
    const txt = (st.queue.length ? `fila ${st.queue.length}` : '') + (state ? (st.queue.length ? ' · ' : '') + state : '');
    if (q.textContent !== txt) q.textContent = txt;
    el.classList.toggle('sel', g.selected === id);
    el.classList.toggle('warn', st.queue.length >= 6);
    el.classList.toggle('stop', !!state && state !== 'ociosa');
    el.classList.toggle('drum', s.policies.release === 'corda' && s.policies.drum === id);
  }
  renderStrip(g);
  const floats = root.querySelector('.floats') as HTMLElement;
  const html = g.scene.floatTexts
    .map((f) => {
      const age = performance.now() / 1000;
      void age;
      return `<span class="float ${f.cls}" style="left:${(f.x / W) * 100}%;top:${(f.y / H) * 100}%">${esc(f.text)}</span>`;
    })
    .join('');
  if (floats.dataset.h !== html) {
    floats.dataset.h = html;
    floats.innerHTML = html;
  }
}

let stripBuilt = false;

/** Faixa de estações para telas pequenas: alvos grandes de toque com fila e estado. */
function renderStrip(g: Game): void {
  const strip = document.getElementById('station-strip');
  const s = g.sim;
  if (!strip || !s) return;
  if (!stripBuilt || strip.childElementCount === 0) {
    strip.innerHTML = STATION_ORDER.map(
      (id) =>
        `<button data-action="select-station" data-v="${id}" data-strip="${id}"><i class="dot" style="background:${STATION_COLORS[id]}"></i><span class="sn">${esc(STATIONS[id].short)}</span><span class="sq"></span><i class="sbar"><i></i></i></button>`,
    ).join('');
    stripBuilt = true;
  }
  for (const id of STATION_ORDER) {
    const el = strip.querySelector(`[data-strip="${id}"]`) as HTMLElement;
    const st = s.stations[id];
    el.hidden = st.locked;
    let state = 'ociosa';
    if (st.paused) state = 'interrompida';
    else if (s.t < st.downUntil) state = st.downReason || 'parada';
    else if (s.t < st.breakUntil) state = 'intervalo';
    else if (st.active.length) state = `${st.active.length}/${st.slots} em produção`;
    const txt = `fila ${st.queue.length} · ${state}`;
    const q = el.querySelector('.sq') as HTMLElement;
    if (q.textContent !== txt) q.textContent = txt;
    const bar = el.querySelector('.sbar > i') as HTMLElement;
    const task = st.active[0];
    bar.style.width = task ? `${Math.round((1 - Math.max(0, task.remaining) / task.total) * 100)}%` : '0%';
    el.classList.toggle('sel', g.selected === id);
    el.classList.toggle('warn', st.queue.length >= 6);
    el.classList.toggle('drum', s.policies.release === 'corda' && s.policies.drum === id);
  }
}

export function resetOverlay(): void {
  built = false;
  stripBuilt = false;
}
