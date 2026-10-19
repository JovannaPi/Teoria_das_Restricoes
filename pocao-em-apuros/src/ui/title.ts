// Tela inicial, seleção de fases e créditos. Ao fundo, uma loja de verdade funcionando.
import { sfx } from '../audio/sfx';
import { PHASES } from '../data/phases';
import { toggleFullscreen, type Game } from '../game/game';
import { phaseUnlocked, writeSave } from '../game/save';
import { ShopScene } from '../render/scene';
import { iconImg, LOOKS, portraitUrl } from '../render/sprites';
import * as A from '../sim/actions';
import { createSim, stepSim } from '../sim/engine';
import type { SimState } from '../sim/types';
import { $, esc } from './dom';
import { glossaryHtml, howToHtml, tocHtml } from './modals';
import { showPresenter } from './presenter';
import { heroCreator } from './online';

// convite de instalação do navegador (Android/Chrome); no iPhone o caminho é "Compartilhar → Tela de Início"
let installPrompt: (Event & { prompt: () => Promise<void> }) | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as Event & { prompt: () => Promise<void> };
  document.querySelectorAll('[data-action="title-install"]').forEach((b) => ((b as HTMLElement).hidden = false));
});

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
}

let demo: { sim: SimState; scene: ShopScene; raf: number; last: number } | null = null;

export function showTitle(g: Game): void {
  renderTitle(g);
  startDemo();
}

function startDemo(): void {
  const canvas = document.getElementById('title-bg') as HTMLCanvasElement | null;
  if (!canvas) return;
  if (demo) cancelAnimationFrame(demo.raf);
  const phase = PHASES.find((p) => p.id === 'mestra')!;
  const sim = createSim({ ...phase.scenario, dynamicEvents: { enabled: false, intensity: 1 }, duration: 100000 });
  A.setPolicy(sim, 'release', 'corda');
  A.setPolicy(sim, 'drum', 'caldeirao');
  const scene = new ShopScene(canvas);
  demo = { sim, scene, raf: 0, last: performance.now() };
  const loop = (ts: number) => {
    if (!demo) return;
    // durante a partida a loja de fundo para de vez (não gasta bateria)
    if (document.body.dataset.screen === 'game') {
      demo.raf = 0;
      return;
    }
    demo.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (ts - demo.last) / 1000);
    demo.last = ts;
    let steps = Math.round(dt / 0.1) || 1;
    while (steps-- > 0) stepSim(demo.sim);
    for (const n of demo.sim.notices) demo.scene.handleNotice(n, demo.sim);
    demo.sim.notices.length = 0;
    demo.scene.update(dt, demo.sim, dt);
    demo.scene.draw(demo.sim, { selected: null, hover: null, showDrum: false, highlight: null });
  };
  demo.raf = requestAnimationFrame(loop);
}

export function renderTitle(g: Game): void {
  const s = g.save;
  const run = s.run;
  const runPhase = run ? PHASES.find((p) => p.id === run.phaseId) : null;
  const muted = s.settings.audio.muted;
  $('#title-menu').innerHTML = `
    <div class="title-top">
      <span class="edu-tag">Jogo educativo · Teoria das Restrições</span>
      <button class="icon-btn" data-action="title-sound" aria-label="${muted ? 'Ativar som' : 'Silenciar'}" aria-pressed="${muted}">${iconImg(muted ? 'mute' : 'sound')}<span>${muted ? 'Som desligado' : 'Som ligado'}</span></button>
    </div>
    <div class="logo"><img src="${portraitUrl(LOOKS.lina, 'cast')}" alt="" class="logo-lina"><div><h1>Poção em Apuros</h1>
      <p>Sua loja de poções está atrasada. Descubra o que trava a produção e salve o dia.</p>${s.hero ? `<p class="hero-tag">${esc(s.hero.name)}</p>` : ''}</div></div>
    <div class="menu-list main-actions">
      ${runPhase ? `<button class="primary" data-action="title-continue">${iconImg('play')} Continuar: ${esc(runPhase.title)}</button>` : ''}
      <button class="${runPhase ? '' : 'primary'} play-btn" data-action="title-start" data-v="turma">${iconImg('play')} Modo rápido — 6 a 10 minutos <small>Guiado, ideal para a aula: os cinco passos da TOC na prática</small></button>
      <button class="play-btn full-btn" data-action="title-more">${iconImg('book')} Modo completo <small>A experiência original: tutorial, 5 fases e a Bruxa Mestra</small></button>
      <div class="row2">
        <button data-action="title-howto">${iconImg('scroll')} Como jogar</button>
        <button data-action="title-toc">${iconImg('eye')} O que é a TOC?</button>
      </div>
      <button data-action="board-open">${iconImg('star')} Placar da turma</button>
    </div>`;
  $('#title-panel').innerHTML = '';
  $('#title-panel').hidden = true;
}

function phaseCards(g: Game): string {
  const order = PHASES.map((p) => p.id);
  return PHASES.filter((p) => p.mode === 'desafio')
    .map((p) => {
      const pr = g.save.progress[p.id];
      const unlocked = phaseUnlocked(g.save, order, p.id);
      const stars = [1, 2, 3].map((i) => `<span class="star ${pr && i <= pr.stars ? 'on' : ''}">${iconImg('star')}</span>`).join('');
      return `<button class="phase-card ${unlocked ? '' : 'locked'} ${pr?.completed ? 'done' : ''}" data-action="title-start" data-v="${p.id}" ${unlocked ? '' : 'disabled'}>
        <span class="pc-n">${p.number}</span><span class="pc-t"><b>${esc(p.title)}</b><small>${esc(p.tocStep)}</small></span>
        <span class="pc-s">${unlocked ? stars : iconImg('lock')}${pr?.bestScore ? `<small>${pr.bestScore} pts</small>` : ''}</span></button>`;
    })
    .join('');
}

export function registerTitleActions(g: Game): void {
  const a = g.actions;
  const panel = (html: string) => {
    const p = $('#title-panel');
    p.innerHTML = `<button class="x" data-action="title-back" aria-label="Voltar">×</button>${html}`;
    p.hidden = false;
  };
  a['title-continue'] = () => {
    sfx.click();
    if (g.save.run) void g.startPhase(g.save.run.phaseId, true);
  };
  a['title-start'] = (el) => {
    sfx.click();
    const id = el.dataset.v!;
    if (g.save.run && g.save.run.phaseId !== id) {
      g.save.run = null;
      writeSave(g.save);
    }
    void g.startPhase(id, false);
  };
  a['title-more'] = () => {
    const ids = PHASES.map((p) => p.id);
    const mestra = phaseUnlocked(g.save, ids, 'mestra');
    panel(`<h2>Modo completo</h2><p class="muted small">Para quem quer aprender mais: todas as decisões, finanças e análises.</p><div class="menu-list">
      <button data-action="title-start" data-v="tutorial">${iconImg('hat')} Aprendiz de Bruxa <small>controles · 5 min</small></button>
      <button data-action="title-phases">${iconImg('star')} Desafio dos Cinco Círculos <small>15 a 25 min</small></button>
      <button data-action="title-start" data-v="mestra" ${mestra ? '' : 'disabled'}>${iconImg('crystal')} Bruxa Mestra <small>${mestra ? 'imprevisível' : 'conclua o 5º círculo'}</small></button>
      <button data-action="title-hero">${iconImg('hat')} ${g.save.hero ? 'Minha bruxa' : 'Criar minha bruxa'} <small>nome e visual</small></button>
      <button data-action="title-present">${iconImg('chart')} Apresentar: QR Code da turma <small>para o projetor</small></button>
      <button data-action="title-glossary">${iconImg('book')} Os cinco passos e o glossário</button>
      <button data-action="title-install" ${installPrompt ? '' : 'hidden'}>${iconImg('door')} Instalar no celular <small>opcional</small></button>
      ${!isStandalone() && document.fullscreenEnabled ? `<button data-action="title-fullscreen" class="mobile-only">${iconImg('eye')} Tela cheia</button>` : ''}
      <button data-action="title-settings">${iconImg('gear')} Configurações</button>
      <button data-action="title-about">${iconImg('scroll')} Sobre o jogo</button></div>`);
  };
  a['title-howto'] = () => panel(`<h2>Como jogar</h2>${howToHtml(true)}<button class="primary" data-action="title-start" data-v="turma">Jogar</button>`);
  a['title-toc'] = () => panel(`<h2>O que é a TOC?</h2>${tocHtml()}<button class="primary" data-action="title-start" data-v="turma">Jogar</button>`);
  a['title-sound'] = () => {
    a['settings-mute'](document.body);
    renderTitle(g);
  };
  a['title-present'] = () => showPresenter(g);
  a['title-phases'] = () => {
    panel(`<h2>Desafio dos Cinco Círculos</h2><p class="muted">Cada círculo é um dia na loja e um passo da Teoria das Restrições.</p>
      <div class="phase-list">${phaseCards(g)}</div>
      <label class="toggle"><input type="checkbox" data-change="title-teacher" ${g.save.teacherMode ? 'checked' : ''}> Modo professor: liberar todas as fases</label>`);
  };
  a['title-teacher'] = (el) => {
    g.save.teacherMode = (el as HTMLInputElement).checked;
    writeSave(g.save);
    a['title-phases'](el);
    renderTitleMenuOnly(g);
  };
  a['title-glossary'] = () => panel(`<h2>A Teoria das Restrições na loja</h2>${glossaryHtml()}`);
  a['title-settings'] = () => {
    const au = g.save.settings.audio;
    panel(`<h2>Configurações</h2><div class="settings">
      ${(['master', 'sfx', 'ambience'] as const).map((k) => `<label class="slider">${{ master: 'Volume geral', sfx: 'Efeitos', ambience: 'Ambiente e música' }[k]}<input type="range" min="0" max="100" value="${Math.round(au[k] * 100)}" data-k="${k}" data-change="settings-volume"></label>`).join('')}
      <button data-action="settings-mute-title">${au.muted ? 'Ativar som' : 'Silenciar'}</button>
      <label class="toggle"><input type="checkbox" data-change="settings-motion" ${g.save.settings.reduceMotion ? 'checked' : ''}> Reduzir animações da interface</label>
      <label class="slider">Velocidade inicial das fases <select data-change="title-speed">${[1, 2, 4].map((v) => `<option value="${v}" ${g.save.settings.defaultSpeed === v ? 'selected' : ''}>${v}×</option>`).join('')}</select></label>
      <button data-action="title-reset">Apagar progresso salvo</button></div>`);
  };
  a['settings-mute-title'] = () => {
    a['settings-mute'](document.body);
    a['title-settings'](document.body);
  };
  a['title-speed'] = (el) => {
    g.save.settings.defaultSpeed = Number((el as HTMLSelectElement).value);
    writeSave(g.save);
  };
  a['title-reset'] = () => {
    if (!window.confirm('Apagar todo o progresso salvo deste navegador?')) return;
    const keepSettings = g.save.settings;
    g.save.progress = {};
    g.save.run = null;
    g.save.teacherMode = false;
    g.save.settings = keepSettings;
    writeSave(g.save);
    renderTitle(g);
  };
  a['title-about'] = () =>
    panel(`<h2>Sobre o jogo</h2>
      <p><b>Poção em Apuros</b> é um jogo de gerenciamento para estudantes de Engenharia de Produção aprenderem, jogando, a Teoria das Restrições (TOC) de Eliyahu Goldratt e seus cinco passos de focalização.</p>
      <p>Tudo o que acontece na loja é calculado por uma simulação de verdade: capacidades, filas, tempos, falhas, estoques e dinheiro. Nada é decorativo.</p>
      <p class="muted small">Arte em pixel art e sons gerados por código, feitos para este jogo. Funciona offline; o progresso fica salvo neste navegador.</p>
      <h3>No celular</h3><p>Funciona em pé e deitado (deitado a loja fica maior). Para instalar: no Android, use "Instalar no celular"; no iPhone, toque em Compartilhar → "Adicionar à Tela de Início". Depois de instalado, joga sem internet.</p>
      <h3>Controles</h3><ul class="list"><li>Toque/clique numa estação para ver dados e decisões.</li><li>Clique no chão para mover a Lina.</li><li>Espaço pausa; 1, 2 e 4 mudam a velocidade; A abre a Análise; Esc fecha janelas.</li></ul>`);
  a['title-install'] = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    installPrompt = null;
    renderTitle(g);
  };
  a['title-fullscreen'] = () => toggleFullscreen();
  a['title-hero'] = async () => {
    await heroCreator(g, !g.save.hero);
    renderTitle(g);
  };
  a['title-back'] = () => {
    $('#title-panel').hidden = true;
  };
}

function renderTitleMenuOnly(g: Game): void {
  const panelHtml = $('#title-panel').innerHTML;
  const hidden = $('#title-panel').hidden;
  renderTitle(g);
  $('#title-panel').innerHTML = panelHtml;
  $('#title-panel').hidden = hidden;
}
