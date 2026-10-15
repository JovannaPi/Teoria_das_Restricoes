// Controlador do jogo: liga simulação, cena, interface, áudio, tutorial e salvamento.
import { sfx } from '../audio/sfx';
import { getPhase, PHASES, PhaseDef } from '../data/phases';
import { STATIONS } from '../data/stations';
import { UPGRADES } from '../data/upgrades';
import * as A from '../sim/actions';
import { createSim, DT, stepSim } from '../sim/engine';
import type { IngredientId, Policies, SimNotice, SimState, StationId, UpgradeId } from '../sim/types';
import { LAYOUT } from '../render/layout';
import { ShopScene } from '../render/scene';
import { renderBottom } from '../ui/bottom';
import { $, esc } from '../ui/dom';
import { buildHud, updateHud } from '../ui/hud';
import * as M from '../ui/modals';
import { renderOverlay } from '../ui/overlay';
import { renderSide, SideView } from '../ui/side';
import { toast } from '../ui/toast';
import { heroCreator, reportResult } from '../ui/online';
import { applyHero, DEFAULT_HERO, randomHero, randomWitchName } from './hero';
import { netProfit } from '../sim/engine';
import { computeScore, evaluateAll, immediateDefeat } from './objectives';
import { loadSave, SaveData, writeSave } from './save';
import { Tutorial } from './tutorial';
import { TurmaGuide } from './turma';
import { mq } from '../ui/fit';
import { Camera } from './camera';
import { struggle, talkKey, talkLines, tocStage, type TalkLine } from './talk';
import { renderTalk } from '../ui/talk';
import { nearestFree } from '../render/walk';
import { TALK_RANGE } from '../render/scene';

export type ActionHandler = (el: HTMLElement) => void;

export class Game {
  save: SaveData = loadSave();
  phase: PhaseDef | null = null;
  sim: SimState | null = null;
  scene!: ShopScene;
  speed = 1;
  paused = true;
  private modalPauses = 0;
  selected: StationId | null = null;
  hover: StationId | null = null;
  side: SideView = 'estacao';
  selectedOrder: number | null = null;
  tutorial: Tutorial | null = null;
  guide: TurmaGuide | null = null;
  private lastAction = { name: '', el: null as HTMLElement | null, at: 0 };
  ended = false;
  private lastFrame = 0;
  private acc = 0;
  private uiTimer = 0;
  private saveTimer = 0;
  private pointerHeld = false;
  private raf = 0;
  camera!: Camera;
  /** Conversa aberta: quem fala, as falas desta conversa e em qual está. */
  talk: { npc: string; lines: TalkLine[]; i: number } | null = null;
  /** Quantas vezes cada personagem já deu dica sobre o mesmo assunto (nível da dica). */
  private talkLevels = new Map<string, number>();
  talkHeard = new Set<string>();
  /** Personagem com uma dica nova esperando (balão "!"). */
  talkAlert: string | null = null;
  private alertSeen = { stage: '', struggle: 0 };
  private keys = new Set<string>();
  private linaDrag: { id: number; sx: number; sy: number; moving: boolean } | null = null;
  readonly actions: Record<string, ActionHandler> = {};

  init(): void {
    sfx.settings = { ...this.save.settings.audio };
    const canvas = $('#shop') as HTMLCanvasElement;
    this.scene = new ShopScene(canvas);
    this.camera = new Camera($('#stage-wrap'), $('#stage'));
    // a área da loja muda de tamanho quando painéis abrem ou o cartão da mentora cresce
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.layoutStage()).observe($('#stage-wrap'));
    this.registerActions();
    this.bindInput(canvas);
    window.addEventListener('resize', () => this.layoutStage());
    window.addEventListener('pocao:fit', () => this.layoutStage());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layoutStage(), 200));
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.layoutStage(), 100));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.sim && !this.ended) {
        // ao trocar de app ou bloquear o celular, a partida pausa e é salva
        this.paused = true;
        this.persistRun();
        this.refreshUi(true);
      }
    });
  }

  // ---------------------------------------------------------------- estado de pausa

  get running(): boolean {
    return !!this.sim && !this.paused && this.modalPauses === 0 && !this.ended;
  }

  /** Eventos de interação para o tutorial e o guia do Desafio da Turma. */
  emit(kind: string, data: unknown): void {
    this.tutorial?.onEvent(kind, data);
    this.guide?.onEvent(kind, data);
  }

  pushModalPause(): void {
    this.modalPauses++;
  }
  popModalPause(): void {
    this.modalPauses = Math.max(0, this.modalPauses - 1);
  }

  setSpeed(v: number): void {
    if (!this.phase) return;
    if (!this.phase.speedOptions.includes(v)) return;
    this.speed = v;
    this.paused = false;
    this.emit('speed', v);
    this.refreshUi(true);
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.refreshUi(true);
  }

  // ---------------------------------------------------------------- fases

  async startPhase(id: string, resume = false): Promise<void> {
    // modo rápido: nada de telas antes de jogar — a bruxa ganha nome e visual sorteados
    // (dá para trocar depois em "Minha bruxa"); no modo completo, o jogador cria a sua bruxa
    if (!this.save.hero && id === 'turma') {
      this.save.hero = { ...randomHero(DEFAULT_HERO), name: randomWitchName() };
      applyHero(this.save.hero);
      writeSave(this.save);
    }
    if (!this.save.hero) {
      const ok = await heroCreator(this, true);
      if (!ok) return;
    }
    const phase = getPhase(id);
    this.phase = phase;
    document.body.classList.toggle('quick', phase.mode === 'turma');
    document.body.classList.remove('guide-free');
    this.ended = false;
    this.selected = phase.revealConstraint;
    this.side = phase.mode === 'tutorial' ? 'estacao' : 'estacao';
    this.selectedOrder = null;
    this.modalPauses = 0;
    this.scene.reset();
    this.closeTalk();
    this.talkLevels.clear();
    this.talkHeard.clear();
    this.talkAlert = null;
    this.alertSeen = { stage: '', struggle: 0 };
    let tutorialStep = 0;
    if (resume && this.save.run && this.save.run.phaseId === id) {
      this.sim = this.save.run.sim;
      this.sim.notices = [];
      tutorialStep = this.save.run.tutorialStep;
      if (this.sim.helper) {
        const h = LAYOUT[this.sim.helper].help;
        this.scene.lina.x = this.scene.lina.tx = h.x;
        this.scene.lina.y = this.scene.lina.ty = h.y;
      }
    } else {
      this.sim = createSim(phase.scenario);
    }
    const p = (this.save.progress[id] ||= { completed: false, bestScore: 0, stars: 0, attempts: 0 });
    if (!resume) p.attempts++;
    writeSave(this.save);
    this.speed = Math.min(this.save.settings.defaultSpeed, Math.max(...phase.speedOptions));
    this.paused = true;
    document.body.dataset.screen = 'game';
    $('#title-screen').classList.add('hidden');
    $('#game-screen').classList.remove('hidden');
    buildHud(this);
    this.layoutStage();
    this.camera.center();
    this.refreshUi(true);
    this.startLoop();
    this.guide?.dispose();
    this.guide = null;
    if (phase.mode === 'tutorial') {
      this.tutorial = new Tutorial(this, tutorialStep);
      await this.tutorial.start(resume);
    } else if (phase.mode === 'turma') {
      this.tutorial = null;
      if (!resume) await M.dialogue(this, phase.intro);
      this.guide = new TurmaGuide(this);
      const saved = resume ? this.save.run?.guide : null;
      if (saved) {
        this.guide.index = saved.index;
        this.guide.marks = saved.marks;
      }
      this.guide.start();
    } else {
      this.tutorial = null;
      if (!resume) {
        await M.dialogue(this, phase.intro);
        // os objetivos ficam na barra "Agora" (sem outra janela em sequência); no celular essa barra
        // já está sempre à vista, e o aviso cobriria a loja
        if (layoutMode() === 'desktop') toast(`Objetivo: ${phase.goalText}`, 'info');
      }
    }
    // partida retomada começa pausada, para o jogador se situar
    this.paused = resume;
    if (resume) toast('Partida carregada. Está pausada: pressione continuar quando quiser.', 'info');
    this.refreshUi(true);
  }

  restartPhase(): void {
    if (!this.phase) return;
    const id = this.phase.id;
    this.save.run = null;
    writeSave(this.save);
    void this.startPhase(id);
  }

  exitToMenu(): void {
    this.persistRun();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.sim = null;
    this.phase = null;
    this.tutorial?.dispose();
    this.tutorial = null;
    this.guide?.dispose();
    this.guide = null;
    M.closeAll(this);
    document.body.dataset.screen = 'title';
    $('#game-screen').classList.add('hidden');
    $('#title-screen').classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('pocao:menu'));
  }

  persistRun(): void {
    if (!this.sim || !this.phase || this.ended) return;
    const notices = this.sim.notices;
    this.sim.notices = [];
    this.save.run = {
      phaseId: this.phase.id,
      sim: this.sim,
      tutorialStep: this.tutorial?.index ?? 0,
      savedAt: Date.now(),
      guide: this.guide ? { index: this.guide.index, marks: this.guide.marks } : undefined,
    };
    writeSave(this.save);
    this.sim.notices = notices;
  }

  // ---------------------------------------------------------------- laço principal

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.lastFrame = performance.now();
    this.acc = 0;
    const frame = (ts: number) => {
      this.raf = requestAnimationFrame(frame);
      const dtReal = Math.min(0.1, (ts - this.lastFrame) / 1000);
      this.lastFrame = ts;
      this.tick(dtReal);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Avança a simulação em passos fixos: a velocidade não depende da taxa de quadros. */
  tick(dtReal: number): void {
    const s = this.sim;
    if (!s) return;
    let gameDt = 0;
    if (this.running) {
      this.acc += dtReal * this.speed;
      let steps = 0;
      while (this.acc >= DT && steps < 80 && !s.finished) {
        stepSim(s);
        this.acc -= DT;
        gameDt += DT;
        steps++;
      }
      this.handleNotices();
      this.emit('tick', s.t);
      if (!this.ended) this.checkEnd();
    } else {
      this.acc = 0;
    }
    // setas do teclado (computador): a bruxa anda enquanto a tecla estiver pressionada
    if (this.keys.size) {
      const dx = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
      const dy = (this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('ArrowUp') ? 1 : 0);
      const l = this.scene.lina;
      if (dx || dy) this.scene.steerLina(l.x + dx * 12, l.y + dy * 12);
    }
    this.scene.update(dtReal, s, gameDt);
    // a câmera acompanha a bruxa quando o jogador a leva para perto da borda
    const l = this.scene.lina;
    if (l.steering || (!l.arrived && l.realTime)) this.camera.keepInView(l.x, l.y - 12);
    this.camera.update(dtReal);
    this.scene.draw(s, {
      selected: this.selected,
      hover: this.hover,
      showDrum: true,
      highlight: this.tutorial?.highlight ?? null,
      talkAlert: this.talkAlert,
    });
    this.uiTimer += dtReal;
    if (this.uiTimer > 0.2) {
      this.uiTimer = 0;
      this.refreshUi(false);
    }
    this.saveTimer += dtReal;
    if (this.saveTimer > 10 && this.running) {
      this.saveTimer = 0;
      this.persistRun();
    }
  }

  private handleNotices(): void {
    const s = this.sim!;
    if (!s.notices.length) return;
    const list = s.notices.splice(0, s.notices.length);
    for (const n of list) {
      this.scene.handleNotice(n, s);
      this.noticeFeedback(n);
      this.tutorial?.onNotice(n);
      this.guide?.onNotice(n);
    }
  }

  private noticeFeedback(n: SimNotice): void {
    const s = this.sim!;
    switch (n.type) {
      case 'job-start':
        if (n.station === 'caldeirao') sfx.bubble();
        else if (n.station === 'preparo') sfx.chop();
        else if (n.station === 'embalagem' || n.station === 'resfriamento') sfx.clink();
        break;
      case 'delivered':
        sfx.coin();
        break;
      case 'order-arrived':
        sfx.door();
        if (!s.policies.autoAccept) toast(`Novo cliente no balcão: pedido #${n.order}`, 'info');
        break;
      case 'failure':
        sfx.fail();
        // no modo rápido o refugo fica só no registro, para não cobrir as decisões
        if (!this.guide) toast(`${STATIONS[n.station].short}: ${n.reason}`, 'bad');
        break;
      case 'event':
        sfx.event();
        M.eventBanner(this, n.event);
        break;
      case 'upgrade-ready':
        sfx.upgrade();
        toast(`${UPGRADES[n.upgrade].name} pronto(a)! A loja mudou — vale olhar a Análise de novo.`, 'good');
        break;
      case 'hypothesis':
        if (n.correct) sfx.success();
        else sfx.error();
        // no modo rápido o resultado aparece no próprio cartão da mentora (sem janela extra)
        if (!this.guide || this.guide.skipped) void M.hypothesisResult(this, s.hypotheses[s.hypotheses.length - 1]);
        break;
      case 'decision-needed':
        void M.crystalChoice(this);
        break;
      case 'order-closed':
        if (n.status === 'cancelado') toast(`Pedido #${n.order} cancelado pelo cliente (atraso).`, 'bad');
        break;
      default:
        break;
    }
  }

  private checkEnd(): void {
    const s = this.sim!;
    const phase = this.phase!;
    if (phase.mode === 'tutorial') return; // o tutorial termina pelas lições
    // no Desafio da Turma a partida sempre chega ao fim, para a turma ver a análise
    const defeat = phase.mode === 'turma' ? null : immediateDefeat(s);
    if (defeat) {
      void this.endPhase(false, defeat);
      return;
    }
    if (s.finished) {
      // hipótese ainda em verificação no fim do dia é resolvida agora
      for (const h of s.hypotheses) if (h.correct == null) {
        h.resolveAt = s.t;
      }
      const ok = evaluateAll(s, phase).every((o) => o.done);
      void this.endPhase(ok, ok ? null : 'Nem todos os objetivos foram cumpridos.');
    }
  }

  async endPhase(won: boolean, reason: string | null): Promise<void> {
    if (this.ended || !this.sim || !this.phase) return;
    this.ended = true;
    const s = this.sim;
    const phase = this.phase;
    // resolve hipóteses pendentes com os dados atuais
    for (const h of s.hypotheses) if (h.correct == null) {
      const { resolveHypothesis } = await import('../sim/engine');
      resolveHypothesis(s, h);
    }
    s.notices.length = 0;
    const score = computeScore(s, phase, won);
    const prog = (this.save.progress[phase.id] ||= { completed: false, bestScore: 0, stars: 0, attempts: 1 });
    if (won) {
      prog.completed = true;
      prog.bestScore = Math.max(prog.bestScore, score.total);
      prog.stars = Math.max(prog.stars, score.stars);
    }
    this.save.run = null;
    writeSave(this.save);
    if (won) sfx.victory();
    else sfx.defeat();
    await M.dialogue(this, won ? phase.outroWin : phase.outroLose);
    const online = reportResult(this, {
      fase: phase.id,
      pontos: score.total,
      estrelas: score.stars,
      venceu: won,
      lucro: netProfit(s),
      entregas: s.stats.delivered,
    });
    await M.debrief(this, won, reason, score, online);
  }

  nextPhaseId(): string | null {
    if (!this.phase) return null;
    const order = PHASES.map((p) => p.id);
    const i = order.indexOf(this.phase.id);
    return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
  }

  // ---------------------------------------------------------------- interface

  layoutStage(): void {
    const wrap = document.getElementById('stage-wrap');
    const stage = document.getElementById('stage');
    if (!wrap || !stage || !this.camera) return;
    // celular (em pé ou deitado): a loja é ampliada e a câmera mostra uma parte dela
    if (layoutMode() !== 'desktop') {
      this.camera.layout(true);
      return;
    }
    this.camera.layout(false);
    // computador: a loja inteira cabe na área (tamanhos no próprio sistema de coordenadas do elemento)
    // descontando o respiro interno (antes a loja passava 8 px para baixo do painel lateral)
    const cs = getComputedStyle(wrap);
    const availW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    let w = availW;
    let h = (w * 9) / 16;
    if (h > availH) {
      h = availH;
      w = (h * 16) / 9;
    }
    stage.style.width = Math.floor(w) + 'px';
    stage.style.height = Math.floor(h) + 'px';
  }

  refreshUi(force: boolean): void {
    if (!this.sim || !this.phase) return;
    document.body.classList.toggle('has-coach', !!document.querySelector('#game-screen > .coach'));
    this.updateTalkAlert();
    updateHud(this);
    renderOverlay(this);
    this.guide?.render();
    if (!this.pointerHeld || force) {
      renderSide(this, force);
      renderBottom(this, force);
    }
  }

  select(id: StationId | null): void {
    this.selected = id;
    this.side = 'estacao';
    if (id) this.camera.focusStation(id);
    if (id) this.emit('select-station', id);
    this.refreshUi(true);
  }

  openSide(view: SideView): void {
    // no celular deitado o painel é uma gaveta: tocar de novo na mesma aba fecha
    if (layoutMode() !== 'desktop' && document.body.classList.contains('side-open') && this.side === view) {
      document.body.classList.remove('side-open');
      this.refreshUi(true);
      return;
    }
    this.side = view;
    document.body.classList.add('side-open');
    this.refreshUi(true);
    this.emit('open-side', view);
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    const toLogical = (ev: PointerEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((ev.clientX - r.left) / r.width) * 480, y: ((ev.clientY - r.top) / r.height) * 270 };
    };
    canvas.addEventListener('pointermove', (ev) => {
      if (!this.sim) return;
      const p = toLogical(ev);
      const pick = this.scene.pick(p.x, p.y, this.sim);
      this.hover = pick.kind === 'station' ? pick.id : null;
      canvas.style.cursor = pick.kind === 'floor' ? 'crosshair' : 'pointer';
    });
    canvas.addEventListener('pointerleave', () => (this.hover = null));
    // arrastar a bruxa com o dedo (ou o mouse): ela anda na direção do ponteiro, sem atravessar móveis
    const tolOf = () => (this.camera.active ? (14 * 480) / canvas.getBoundingClientRect().width : 0);
    canvas.addEventListener('pointerdown', (ev) => {
      if (!this.sim || ev.button > 0) return;
      const p = toLogical(ev);
      if (this.scene.pick(p.x, p.y, this.sim, tolOf()).kind !== 'lina') return;
      this.linaDrag = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, moving: false };
      this.camera.blockPointer(ev.pointerId);
    });
    canvas.addEventListener('pointermove', (ev) => {
      const d = this.linaDrag;
      if (!d || d.id !== ev.pointerId || !this.sim) return;
      if (!d.moving) {
        if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 8) return;
        d.moving = true;
        try {
          canvas.setPointerCapture(ev.pointerId);
        } catch {
          /* ponteiro já solto */
        }
        if (this.sim.helper) A.setHelper(this.sim, null);
        this.emit('lina-drag', null);
      }
      const p = toLogical(ev);
      // o ponto fica um pouco abaixo do dedo, para o dedo não cobrir a bruxa
      this.scene.steerLina(p.x, p.y + 6);
    });
    const endDrag = (ev: PointerEvent) => {
      const d = this.linaDrag;
      if (!d || d.id !== ev.pointerId) return;
      this.linaDrag = null;
      if (d.moving) {
        this.camera.suppressClicks();
        this.scene.steerLina(null);
      }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('click', (ev) => {
      sfx.unlock();
      if (!this.sim || this.camera.consumeClick()) return;
      const p = toLogical(ev);
      // no toque, a área de acerto cresce ~14 px de tela em volta de cada estação e pessoa
      const pick = this.scene.pick(p.x, p.y, this.sim, tolOf());
      if (pick.kind === 'station') {
        sfx.click();
        this.select(pick.id);
        document.body.classList.add('side-open');
      } else if (pick.kind === 'client') {
        this.selectedOrder = pick.order;
        this.openSide('pedidos');
      } else if (pick.kind === 'npc') {
        sfx.click();
        this.talkTo(pick.id);
      } else if (pick.kind === 'lina') {
        sfx.click();
        this.openTalk('lina');
      } else {
        // tocar no chão leva a bruxa até lá (contornando os móveis); se ela ajudava uma estação, deixa de ajudar
        if (this.sim.helper) A.setHelper(this.sim, null);
        this.scene.walkLina(p.x, p.y, null, null, true);
        this.emit('lina-walk', null);
        sfx.step();
      }
    });
    // ações por delegação: todo botão com data-action precisa ter um handler registrado
    document.addEventListener('click', (ev) => {
      sfx.unlock();
      const el = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled) return;
      const name = el.dataset.action!;
      // evita que um toque duplo dispare a mesma ação duas vezes
      const now = performance.now();
      const repeatable = name === 'pause' || name === 'speed' || name === 'buffer-step' || name === 'dialogue-next' || name === 'hero-pick';
      if (!repeatable && this.lastAction.el === el && this.lastAction.name === name && now - this.lastAction.at < 300) {
        ev.preventDefault();
        return;
      }
      this.lastAction = { name, el, at: now };
      const fn = this.actions[name];
      if (!fn) {
        console.error('Ação sem handler:', name);
        return;
      }
      ev.preventDefault();
      fn(el);
    });
    document.addEventListener('change', (ev) => {
      const el = ev.target as HTMLElement;
      const name = el.dataset?.change;
      if (name && this.actions[name]) this.actions[name](el);
    });
    document.addEventListener('pointerdown', (ev) => {
      if ((ev.target as HTMLElement).closest('#side, #bottom')) this.pointerHeld = true;
    });
    document.addEventListener('pointerup', () => {
      this.pointerHeld = false;
    });
    const keyUp = (ev: KeyboardEvent) => {
      if (!this.keys.delete(ev.key)) return;
      if (!this.keys.size) this.scene.steerLina(null);
    };
    document.addEventListener('keyup', keyUp);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.scene.steerLina(null);
    });
    document.addEventListener('keydown', (ev) => {
      sfx.unlock();
      if (!this.sim || this.ended) return;
      if ((ev.target as HTMLElement).closest('input, select, textarea')) return;
      if (M.isOpen()) {
        if (ev.key === 'Escape') M.closeTop(this);
        return;
      }
      if (ev.key.startsWith('Arrow')) {
        ev.preventDefault();
        this.keys.add(ev.key);
        if (this.sim.helper && !ev.repeat) A.setHelper(this.sim, null);
        return;
      }
      if (ev.key.toLowerCase() === 'e' || ev.key === 'Enter') {
        // conversar com quem estiver perto da bruxa
        const n = this.scene.nearNpc(this.sim);
        if (n) {
          ev.preventDefault();
          this.openTalk(n.id);
        }
        return;
      }
      if (ev.key === ' ') {
        ev.preventDefault();
        this.togglePause();
      } else if (ev.key === '1' || ev.key === '2' || ev.key === '4') this.setSpeed(Number(ev.key));
      else if (ev.key.toLowerCase() === 'a') this.actions['open-analysis'](document.body);
      else if (ev.key === 'Escape' && this.talk) this.closeTalk();
      else if (ev.key === 'Escape') {
        this.selected = null;
        document.body.classList.remove('side-open');
        this.refreshUi(true);
      }
    });
  }

  // ---------------------------------------------------------------- conversas

  /** Tocar num personagem: se a bruxa está perto, conversa; senão ela anda até ele e conversa. */
  talkTo(npc: string): void {
    const s = this.sim;
    if (!s) return;
    const spots = this.scene.npcs(s).filter((n) => n.id === npc);
    if (!spots.length) return;
    const l = this.scene.lina;
    const near = spots.find((n) => Math.hypot(n.x - l.x, (n.y - l.y) * 1.3) <= TALK_RANGE);
    if (near) {
      this.openTalk(npc);
      return;
    }
    // a pessoa mais perto da bruxa; ela para logo à frente (pés um pouco abaixo)
    const n = spots.sort((a, b) => Math.hypot(a.x - l.x, a.y - l.y) - Math.hypot(b.x - l.x, b.y - l.y))[0];
    const spot = nearestFree(n.x + (l.x < n.x ? -12 : 12), n.y + 8);
    if (s.helper) A.setHelper(s, null);
    this.scene.walkLina(spot.x, spot.y, () => this.openTalk(npc), null, true);
  }

  openTalk(npc: string, deeper = false): void {
    if (!this.sim) return;
    const key = talkKey(this, npc);
    const heard = this.talkLevels.get(key) ?? -1;
    // primeira conversa: nível 0 (mais o empurrão de quem está com dificuldade); voltar a perguntar aprofunda
    const level = Math.min(2, deeper || heard >= 0 ? heard + 1 : struggle(this));
    this.talkLevels.set(key, level);
    const lines = talkLines(this, npc, level);
    this.talkHeard.add(npc);
    this.talk = { npc, lines, i: 0 };
    if (npc === 'mentora') {
      this.talkAlert = null;
      this.alertSeen = { stage: tocStage(this), struggle: this.strugglePoints() };
    }
    this.emit('talk', npc);
    this.renderTalkBox();
  }

  closeTalk(): void {
    this.talk = null;
    renderTalk(null, { more: false, next: false });
  }

  private renderTalkBox(): void {
    const t = this.talk;
    if (!t) return renderTalk(null, { more: false, next: false });
    const key = talkKey(this, t.npc);
    const canDeeper = t.npc !== 'lina' && (this.talkLevels.get(key) ?? 0) < (t.npc === 'mentora' ? 2 : 1);
    renderTalk(t.lines[t.i], { next: t.i < t.lines.length - 1, more: canDeeper });
  }

  /** A mentora acena ("!") quando o jogador começa a errar ou (modo completo) muda de passo da TOC. */
  private updateTalkAlert(): void {
    if (!this.sim || this.phase?.mode === 'tutorial') return;
    const st = this.strugglePoints();
    const stage = tocStage(this);
    const seen = this.alertSeen;
    if (!seen.stage) {
      this.alertSeen = { stage, struggle: st };
      return;
    }
    if (st < seen.struggle) seen.struggle = st;
    if (st > seen.struggle || (!this.guide && stage !== seen.stage)) this.talkAlert = 'mentora';
  }

  private strugglePoints(): number {
    return struggle(this) + (this.guide?.wrongTries ?? 0);
  }

  /** Executa uma ação da simulação com feedback visual/sonoro. */
  run(result: A.ActionResult, silentOk = false): boolean {
    if (result.ok) {
      if (!silentOk && result.message) toast(result.message, 'good');
      sfx.click();
    } else {
      toast(result.message, 'bad');
      sfx.error();
    }
    this.refreshUi(true);
    return result.ok;
  }

  policyLocked(k: PhaseDef['lockedPolicies'][number]): boolean {
    if (this.guide) return this.guide.locked(k);
    return !!this.phase?.lockedPolicies.includes(k);
  }

  private registerActions(): void {
    const a = this.actions;
    const sim = () => this.sim!;
    a['pause'] = () => this.togglePause();
    a['cam-mode'] = () => this.camera.toggleMode();
    a['talk-next'] = () => {
      if (!this.talk) return;
      this.talk.i = Math.min(this.talk.lines.length - 1, this.talk.i + 1);
      this.renderTalkBox();
    };
    a['talk-more'] = () => this.talk && this.openTalk(this.talk.npc, true);
    a['talk-close'] = () => this.closeTalk();
    a['speed'] = (el) => this.setSpeed(Number(el.dataset.v));
    a['side'] = (el) => this.openSide(el.dataset.v as SideView);
    a['close-side'] = () => {
      document.body.classList.remove('side-open');
      this.selected = null;
      this.refreshUi(true);
    };
    a['select-station'] = (el) => {
      this.select(el.dataset.v as StationId);
      document.body.classList.add('side-open');
    };
    a['select-order'] = (el) => {
      this.selectedOrder = Number(el.dataset.v);
      this.openSide('pedidos');
    };
    a['accept'] = (el) => {
      if (this.run(A.acceptOrder(sim(), Number(el.dataset.v)), true)) this.emit('accept-order', Number(el.dataset.v));
    };
    a['reject'] = async (el) => {
      const ok = await M.confirm(this, 'Recusar este pedido? O cliente vai embora e a reputação cai um pouco.', 'Recusar');
      if (ok) this.run(A.rejectOrder(sim(), Number(el.dataset.v)));
    };
    a['buy'] = (el) => {
      const ing = el.dataset.v as IngredientId;
      const q = Number(el.dataset.q);
      if (this.run(A.buyIngredient(sim(), ing, q))) this.emit('buy', ing);
    };
    a['policy'] = (el) => {
      const k = el.dataset.k as keyof Policies;
      let v: unknown = el.dataset.v;
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      if (k === 'bufferSize') v = Number(v);
      if (this.policyLocked(k as PhaseDef['lockedPolicies'][number])) {
        toast('Esta decisão ainda não está disponível nesta fase.', 'bad');
        return;
      }
      this.run(A.setPolicy(sim(), k as 'release', v as Policies['release']));
      this.emit('policy', { k, v });
    };
    a['policy-check'] = (el) => {
      const k = el.dataset.k as 'autoAccept' | 'autoReorder';
      this.run(A.setPolicy(sim(), k, (el as HTMLInputElement).checked));
      this.emit('policy', { k, v: (el as HTMLInputElement).checked });
    };
    a['buffer-step'] = (el) => {
      if (this.policyLocked('bufferSize')) return;
      const v = Math.max(1, Math.min(12, sim().policies.bufferSize + Number(el.dataset.d)));
      this.run(A.setPolicy(sim(), 'bufferSize', v), true);
    };
    a['drum-select'] = (el) => {
      const v = (el as HTMLSelectElement).value as StationId;
      if (this.policyLocked('drum')) return;
      this.run(A.setPolicy(sim(), 'drum', v));
    };
    a['station-policy'] = (el) => {
      const kind = el.dataset.k as 'setupExternal' | 'breakCover';
      if (this.policyLocked(kind)) {
        toast('Esta decisão ainda não está disponível nesta fase.', 'bad');
        return;
      }
      this.run(A.setStationPolicy(sim(), kind, el.dataset.v as StationId, el.dataset.on === 'true'));
    };
    a['toggle-station'] = (el) => this.run(A.toggleStationPause(sim(), el.dataset.v as StationId));
    a['prioritize'] = (el) => this.run(A.prioritizeJob(sim(), Number(el.dataset.v)));
    a['help-here'] = (el) => {
      const id = el.dataset.v as StationId;
      const s = sim();
      if (s.helper && s.helper !== id) A.setHelper(s, null);
      const spot = LAYOUT[id].help;
      toast(`Lina está indo até a estação ${STATIONS[id].short}…`, 'info');
      this.scene.walkLina(spot.x, spot.y, () => {
        if (!this.sim) return;
        this.run(A.setHelper(this.sim, id));
        this.emit('helper', id);
      });
      this.refreshUi(true);
    };
    a['stop-help'] = () => {
      this.run(A.setHelper(sim(), null));
      this.scene.walkLina(196, 214);
    };
    a['drum-here'] = (el) => {
      if (this.policyLocked('drum')) return;
      this.run(A.setPolicy(sim(), 'drum', el.dataset.v as StationId));
    };
    a['hypothesis'] = (el) => void M.hypothesisPicker(this, (el.dataset.v as StationId) || null);
    a['hypothesis-confirm'] = (el) => {
      const v = el.dataset.v as StationId | 'mercado';
      M.closeTop(this);
      this.run(A.registerHypothesis(sim(), v));
    };
    a['upgrade'] = async (el) => {
      const id = el.dataset.v as UpgradeId;
      const u = UPGRADES[id];
      const check = A.canBuyUpgrade(sim(), id);
      if (!check.ok) {
        this.run(check);
        return;
      }
      const ok = await M.confirm(
        this,
        `Investir <b>${u.price} moedas</b> em <b>${esc(u.name)}</b>? A despesa operacional sobe ${(u.opCostPerSec * 30).toFixed(0)} moedas por hora da loja${u.stopsStation ? ' e a estação para durante a instalação' : ''}. Esta decisão não pode ser desfeita.`,
        'Investir',
      );
      if (ok && this.sim) {
        this.run(A.buyUpgrade(this.sim, id));
        this.emit('upgrade', id);
      }
    };
    a['crystal'] = (el) => {
      M.closeTop(this);
      this.run(A.chooseCrystal(sim(), el.dataset.v as StationId));
    };
    a['open-analysis'] = () => {
      void M.analysis(this);
      this.emit('open-analysis', null);
    };
    a['open-recipes'] = () => void M.recipes(this);
    a['open-glossary'] = () => void M.glossary(this);
    a['open-objectives'] = () => void M.objectivesIntro(this);
    a['open-howto'] = () => M.howTo(this);
    a['hud-expand'] = () => {
      document.body.classList.toggle('hud-expanded');
    };
    a['quick-choice'] = (el) => this.guide?.choose(el.dataset.v!);
    a['quick-skip'] = () => this.guide?.skip();
    a['quick-unskip'] = () => this.guide?.unskip();
    a['quick-restart'] = async () => {
      const ok = await M.confirm(this, 'Recomeçar a demonstração do zero?', 'Recomeçar');
      if (!ok) return;
      this.save.run = null;
      writeSave(this.save);
      void this.startPhase('turma');
    };
    a['open-toc'] = () => M.whatIsToc(this);
    a['open-settings'] = () => void M.settings(this);
    a['open-menu'] = () => void M.gameMenu(this);
    a['open-more'] = () => void M.moreMenu(this);
    a['fullscreen'] = () => {
      M.closeAll(this);
      toggleFullscreen();
    };
    a['modal-close'] = () => M.closeTop(this);
    a['modal-tab'] = (el) => M.switchTab(el);
    a['restart'] = async () => {
      const ok = await M.confirm(this, 'Reiniciar esta fase? O progresso deste dia será perdido.', 'Reiniciar');
      if (ok) {
        M.closeAll(this);
        this.restartPhase();
      }
    };
    a['exit'] = () => this.exitToMenu();
    a['next-phase'] = () => {
      const n = this.nextPhaseId();
      M.closeAll(this);
      if (n) void this.startPhase(n);
      else this.exitToMenu();
    };
    a['retry'] = () => {
      M.closeAll(this);
      this.restartPhase();
    };
    a['quiz'] = (el) => M.answerQuiz(this, el);
    a['dialogue-next'] = () => M.dialogueNext();
    a['settings-mute'] = () => {
      this.save.settings.audio.muted = !this.save.settings.audio.muted;
      sfx.settings = { ...this.save.settings.audio };
      sfx.apply();
      writeSave(this.save);
      this.refreshUi(true);
      M.refreshSettings(this);
    };
    a['settings-volume'] = (el) => {
      const k = (el as HTMLInputElement).dataset.k as 'master' | 'sfx' | 'ambience';
      this.save.settings.audio[k] = Number((el as HTMLInputElement).value) / 100;
      sfx.settings = { ...this.save.settings.audio };
      sfx.apply();
      writeSave(this.save);
    };
    a['settings-motion'] = (el) => {
      this.save.settings.reduceMotion = (el as HTMLInputElement).checked;
      document.body.classList.toggle('reduce-motion', this.save.settings.reduceMotion);
      if (this.save.settings.reduceMotion) this.scene.lowFx = true;
      writeSave(this.save);
    };
    a['tutorial-skip'] = async () => {
      const ok = await M.confirm(this, 'Pular o restante do tutorial?', 'Pular');
      if (ok) this.tutorial?.finish();
    };
    a['tutorial-next'] = () => this.emit('next', null);
  }
}

export type LayoutMode = 'desktop' | 'em-pe' | 'deitado';

/** Mesmas condições das media queries de styles.css. */
export function layoutMode(): LayoutMode {
  if (mq('(orientation: landscape) and (max-height: 540px)')) return 'deitado';
  if (mq('(orientation: portrait) and (max-width: 1024px)')) return 'em-pe';
  return 'desktop';
}

/** Tela cheia e, no celular, tentativa de travar em paisagem (onde a loja aparece maior). */
export function toggleFullscreen(): void {
  const d = document as Document & { webkitFullscreenElement?: Element };
  if (d.fullscreenElement || d.webkitFullscreenElement) {
    void document.exitFullscreen?.();
    return;
  }
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : (el.webkitRequestFullscreen?.(), Promise.resolve());
  void Promise.resolve(p)
    .then(() => {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      return o?.lock?.('landscape').catch(() => undefined);
    })
    .catch(() => undefined);
}

export const game = new Game();
