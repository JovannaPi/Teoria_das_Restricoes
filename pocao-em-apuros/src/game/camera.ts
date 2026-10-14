// Câmera da loja no celular.
//
// A cena é desenhada sempre em 480×270 px lógicos (16:9). No computador ela é encolhida para caber
// inteira na área disponível. No celular isso deixava cada pixel da arte com menos de 1 px de tela:
// personagens de ~16 px lógicos viravam ~14 px. Aqui, no celular, a cena é ampliada para PREENCHER a
// área da loja (escala "cobrir") e o jogador arrasta para ver o resto; tocar numa estação (na loja ou
// na faixa de estações) leva a câmera até ela. "Ver tudo" volta a mostrar a loja inteira.
import { LAYOUT, W, H } from '../render/layout';
import type { StationId } from '../sim/types';

export type CamMode = 'perto' | 'tudo';

const MAX_SCALE = 3.2;
const COMFORT = 1.6;
const DRAG_START = 9; // px de tela antes de um toque virar arrasto

export class Camera {
  active = false;
  mode: CamMode = 'perto';
  /** escala atual: px de CSS por px lógico da cena */
  s = 1;
  private x = W / 2;
  private y = H / 2;
  private target: { x: number; y: number } | null = null;
  private vw = 0;
  private vh = 0;
  private drag: { id: number; sx: number; sy: number; cx: number; cy: number; moving: boolean } | null = null;
  private suppressUntil = 0;
  private map: HTMLElement | null = null;
  private btn: HTMLButtonElement | null = null;
  private hinted = false;

  constructor(
    private wrap: HTMLElement,
    private stage: HTMLElement,
  ) {
    wrap.insertAdjacentHTML(
      'beforeend',
      `<div class="cam-ui"><button class="cam-btn mini" data-action="cam-mode" aria-label="Ver a loja inteira">Ver tudo</button></div><div class="cam-map" aria-hidden="true"><i></i></div>`,
    );
    this.map = wrap.querySelector('.cam-map i');
    this.btn = wrap.querySelector('.cam-btn');
    wrap.addEventListener('pointerdown', (e) => this.down(e));
    wrap.addEventListener('pointermove', (e) => this.move(e));
    wrap.addEventListener('pointerup', (e) => this.up(e));
    wrap.addEventListener('pointercancel', (e) => this.up(e));
  }

  /** Recalcula escala e posição. `on` = celular (em pé ou deitado). */
  layout(on: boolean): void {
    this.active = on;
    document.body.classList.toggle('cam', on);
    if (!on) {
      document.body.classList.remove('stage-capped');
      this.stage.style.transform = '';
      return;
    }
    const vw = this.wrap.clientWidth;
    let vh = this.wrap.clientHeight;
    if (!vw || !vh) return;
    // em pé, num celular comprido, ampliar até preencher toda a altura mostraria só um terço da loja.
    // A escala para quando ~45% da largura da loja está à vista; a altura que sobra vai para os pedidos.
    const body = document.body;
    const portrait = vh > vw;
    const extra = body.classList.contains('stage-capped') ? (document.getElementById('bottom')?.offsetHeight ?? 0) : 0;
    const avail = vh + extra;
    const sMax = Math.min(MAX_SCALE, vw / (W * 0.45));
    const capped = portrait && this.mode === 'perto' && Math.max(vw / W, avail / H) > sMax * 1.02 && avail - H * sMax > 90;
    if (capped !== body.classList.contains('stage-capped') || (capped && Math.abs(vh - Math.round(H * sMax)) > 1)) {
      body.classList.toggle('stage-capped', capped);
      document.getElementById('game-screen')?.style.setProperty('--stage-h', Math.round(H * sMax) + 'px');
      vh = this.wrap.clientHeight;
    }
    this.vw = vw;
    this.vh = vh;
    const fit = Math.min(vw / W, vh / H);
    const cover = Math.max(vw / W, vh / H);
    // Escala confortável para tocar e enxergar: pelo menos ~1,6 px de tela por pixel da arte (personagens
    // com ~26 px), mesmo que a loja então precise ser arrastada nas duas direções; nunca menos que
    // "cobrir" (sem faixas vazias). Sem o limite (sobra pequena demais para os pedidos), a loja
    // preenche a área inteira.
    const limit = capped || !portrait ? sMax : MAX_SCALE;
    this.s = this.mode === 'tudo' ? fit : Math.max(fit, Math.min(Math.max(cover, Math.min(COMFORT, sMax)), limit));
    this.stage.style.width = Math.round(W * this.s) + 'px';
    this.stage.style.height = Math.round(H * this.s) + 'px';
    if (this.btn) {
      // quando a loja inteira já cabe, não há o que alternar
      const zoomable = cover / fit > 1.15;
      this.btn.hidden = !zoomable;
      this.btn.textContent = this.mode === 'tudo' ? 'Aproximar' : 'Ver tudo';
      this.btn.setAttribute('aria-label', this.mode === 'tudo' ? 'Aproximar a loja' : 'Ver a loja inteira');
    }
    this.apply();
    if (!this.hinted && this.mode === 'perto' && (W * this.s > vw + 40 || H * this.s > vh + 40)) {
      this.hinted = true;
      this.wrap.classList.add('cam-hint');
      setTimeout(() => this.wrap.classList.remove('cam-hint'), 3200);
    }
  }

  toggleMode(): void {
    this.mode = this.mode === 'perto' ? 'tudo' : 'perto';
    this.layout(this.active);
  }

  /** Leva a câmera (com animação) até uma estação. */
  focusStation(id: StationId): void {
    const L = LAYOUT[id];
    this.focus(L.hit.x + L.hit.w / 2, L.hit.y + L.hit.h / 2 + 8);
  }

  focus(x: number, y: number): void {
    if (!this.active) return;
    this.target = { x, y };
  }

  /** Centraliza sem animação (início de fase). */
  center(x = W * 0.45, y = H * 0.55): void {
    this.x = x;
    this.y = y;
    this.target = null;
    this.apply();
  }

  /** O clique que encerra um arrasto não deve selecionar nada na loja. */
  consumeClick(): boolean {
    return performance.now() < this.suppressUntil;
  }

  update(dt: number): void {
    if (!this.active || !this.target || this.drag?.moving) return;
    const k = 1 - Math.pow(0.0015, dt);
    this.x += (this.target.x - this.x) * k;
    this.y += (this.target.y - this.y) * k;
    if (Math.abs(this.target.x - this.x) < 0.3 && Math.abs(this.target.y - this.y) < 0.3) {
      this.x = this.target.x;
      this.y = this.target.y;
      this.target = null;
    }
    this.apply();
  }

  private clamp(): void {
    const hw = this.vw / this.s / 2;
    const hh = this.vh / this.s / 2;
    this.x = hw * 2 >= W ? W / 2 : Math.min(W - hw, Math.max(hw, this.x));
    this.y = hh * 2 >= H ? H / 2 : Math.min(H - hh, Math.max(hh, this.y));
  }

  private apply(): void {
    if (!this.active) return;
    this.clamp();
    const tx = Math.round(this.vw / 2 - this.x * this.s);
    const ty = Math.round(this.vh / 2 - this.y * this.s);
    this.stage.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    if (this.map) {
      // barrinha que mostra que parte da loja está à vista
      const fw = Math.min(1, this.vw / (W * this.s));
      const left = W * this.s > this.vw ? (-tx / (W * this.s)) * 100 : 0;
      this.map.style.width = fw * 100 + '%';
      this.map.style.left = left + '%';
      this.map.parentElement!.hidden = fw >= 0.98;
    }
  }

  private down(e: PointerEvent): void {
    if (!this.active || this.mode === 'tudo' || e.button > 0) return;
    if ((e.target as HTMLElement).closest('.cam-ui')) return;
    this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: this.x, cy: this.y, moving: false };
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moving) {
      if (Math.hypot(dx, dy) < DRAG_START) return;
      d.moving = true;
      this.target = null;
      this.wrap.classList.add('cam-drag');
      try {
        this.wrap.setPointerCapture(e.pointerId);
      } catch {
        /* ponteiro já liberado */
      }
    }
    // clientX está no mesmo sistema de px da tela que a escala usa (com ou sem zoom de página)
    const z = this.wrap.getBoundingClientRect().width / (this.wrap.clientWidth || 1);
    this.x = d.cx - dx / (this.s * z);
    this.y = d.cy - dy / (this.s * z);
    this.apply();
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (d.moving) this.suppressUntil = performance.now() + 120;
    this.drag = null;
    this.wrap.classList.remove('cam-drag');
  }
}
