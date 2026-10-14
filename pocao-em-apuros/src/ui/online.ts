// Criação da bruxa, placar online e modo projeção (para mostrar o placar na sala).
import { PHASES } from '../data/phases';
import type { Game } from '../game/game';
import {
  ACCENT_OPTIONS,
  applyHero,
  cleanName,
  CLOTH_OPTIONS,
  DEFAULT_HERO,
  HAIR_OPTIONS,
  HAIRSTYLE_OPTIONS,
  HAT_OPTIONS,
  HATCOLOR_OPTIONS,
  HeroConfig,
  lookFromHero,
  randomHero,
  randomWitchName,
  SKIN_OPTIONS,
} from '../game/hero';
import { writeSave } from '../game/save';
import { decodeVisual, encodeVisual, Ranking, RankRow, submitScore, watchBoard } from '../online/leaderboard';
import { RANKED_PHASES } from '../online/config';
import { iconImg, portraitUrl } from '../render/sprites';
import { esc } from './dom';
import { closeTop, openModal } from './modals';
import { toast } from './toast';

// ------------------------------------------------------------------ criação da bruxa

let draft: HeroConfig = { ...DEFAULT_HERO };
let creatorResolve: ((ok: boolean) => void) | null = null;

function swatches(k: keyof HeroConfig, opts: string[]): string {
  return `<div class="swatches" role="radiogroup">${opts
    .map(
      (c) =>
        `<button class="sw ${draft[k] === c ? 'on' : ''}" role="radio" aria-checked="${draft[k] === c}" aria-label="${c}" data-action="hero-pick" data-k="${k}" data-v="${c}" style="background:${c}"></button>`,
    )
    .join('')}</div>`;
}

function choices(k: keyof HeroConfig, opts: [string, string][]): string {
  return `<div class="chips" role="radiogroup">${opts
    .map(([v, label]) => `<button class="${draft[k] === v ? 'on' : ''}" role="radio" aria-checked="${draft[k] === v}" data-action="hero-pick" data-k="${k}" data-v="${v}">${esc(label)}</button>`)
    .join('')}</div>`;
}

function creatorBody(): string {
  return `<div class="creator">
    <div class="creator-preview"><img class="hero-portrait" src="${portraitUrl(lookFromHero(draft), 'cast')}" alt="Prévia da sua bruxa">
      <button data-action="hero-random">${iconImg('crystal')} Aleatória</button></div>
    <div class="creator-form">
      <label class="field">Nome da sua bruxa <small class="muted">(aparece no placar; não use seu nome completo)</small><input type="text" maxlength="18" data-hero-field="name" value="${esc(draft.name)}" placeholder="Ex.: Ametista Lunar" autocomplete="off" autocapitalize="words" enterkeyhint="done"></label>
      <p class="muted small">Visual opcional — toque para mudar ou use "Aleatória".</p>
      <h3>Pele</h3>${swatches('skin', SKIN_OPTIONS)}
      <h3>Cabelo</h3>${swatches('hair', HAIR_OPTIONS)}${choices('hairStyle', HAIRSTYLE_OPTIONS)}
      <h3>Roupa</h3>${swatches('cloth', CLOTH_OPTIONS)}
      <h3>Detalhe da roupa</h3>${swatches('accent', ACCENT_OPTIONS)}
      <h3>Chapéu</h3>${choices('hat', HAT_OPTIONS)}${swatches('hatColor', HATCOLOR_OPTIONS)}
      <p class="muted small" data-hero-msg></p>
    </div></div>`;
}

function refreshCreator(): void {
  const body = document.querySelector('.modal .creator')?.parentElement;
  if (!body) return;
  const keepScroll = body.scrollTop;
  body.innerHTML = creatorBody();
  body.scrollTop = keepScroll;
  bindFields();
}

function bindFields(): void {
  document.querySelectorAll<HTMLInputElement>('[data-hero-field]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const k = inp.dataset.heroField as 'name' | 'player';
      draft = { ...draft, [k]: inp.value };
    });
  });
}

/** Abre a criação da bruxa. Resolve true quando salva. */
export function heroCreator(g: Game, firstTime = false): Promise<boolean> {
  draft = { ...DEFAULT_HERO, ...(g.save.hero || {}) };
  if (!g.save.hero) draft = { ...randomHero(draft), name: randomWitchName() };
  const { promise } = openModal(g, {
    title: firstTime ? 'Crie a sua bruxa' : 'Minha bruxa',
    body: creatorBody(),
    cls: 'wide creator-modal',
    closable: !firstTime,
    footer: `${firstTime ? '' : '<button data-action="modal-close">Cancelar</button>'}<button class="primary big" data-action="hero-save">${firstTime ? 'Jogar' : 'Salvar bruxa'}</button>`,
  });
  bindFields();
  return new Promise((resolve) => {
    creatorResolve = resolve;
    void promise.then(() => {
      if (creatorResolve) {
        creatorResolve(false);
        creatorResolve = null;
      }
    });
  });
}

export function registerOnlineActions(g: Game): void {
  const a = g.actions;
  a['hero-pick'] = (el) => {
    draft = { ...draft, [el.dataset.k as keyof HeroConfig]: el.dataset.v };
    refreshCreator();
  };
  a['hero-random'] = () => {
    draft = randomHero(draft);
    refreshCreator();
  };
  a['hero-save'] = () => {
    const name = cleanName(draft.name);
    const player = name;
    const msg = document.querySelector('[data-hero-msg]') as HTMLElement | null;
    if (!name) {
      if (msg) {
        msg.textContent = 'Dê um nome à sua bruxa (ele aparece no placar da turma).';
        msg.classList.add('neg');
      }
      return;
    }
    g.save.hero = { ...draft, name, player };
    writeSave(g.save);
    applyHero(g.save.hero);
    const r = creatorResolve;
    creatorResolve = null;
    closeTop(g);
    r?.(true);
    toast(`${name} está pronta para abrir a loja!`, 'good');
    window.dispatchEvent(new CustomEvent('pocao:hero'));
  };
  a['board-open'] = () => leaderboard(g);
  a['board-tab'] = (el) => {
    boardTab = el.dataset.v || 'geral';
    renderBoard();
  };
  a['board-project'] = () => projection(g);
  a['board-close-projection'] = () => closeProjection();
}

// ------------------------------------------------------------------ envio de resultados

/** Envia (ou guarda para enviar depois) o resultado de uma fase que conta para o placar. */
export async function reportResult(
  g: Game,
  r: { fase: string; pontos: number; estrelas: number; venceu: boolean; lucro: number; entregas: number },
): Promise<'enviado' | 'pendente' | 'negado' | 'ignorado'> {
  if (!RANKED_PHASES.includes(r.fase as (typeof RANKED_PHASES)[number]) || !g.save.hero) return 'ignorado';
  const h = g.save.hero;
  const entry = { jogadorId: g.save.playerId, jogador: h.player, bruxa: h.name, visual: encodeVisual(h), ...r };
  const res = await submitScore(entry);
  if (res !== 'ok') {
    g.save.pendingScores.push(entry);
    writeSave(g.save);
    return res === 'negado' ? 'negado' : 'pendente';
  }
  await flushPending(g);
  return 'enviado';
}

/** Tenta enviar resultados que ficaram guardados sem internet. */
export async function flushPending(g: Game): Promise<void> {
  const list = [...g.save.pendingScores];
  if (!list.length) return;
  const left = [];
  for (const e of list) if ((await submitScore(e)) !== 'ok') left.push(e);
  g.save.pendingScores = left;
  writeSave(g.save);
}

// ------------------------------------------------------------------ placar

let boardTab = 'geral';
let lastRanking: Ranking | null = null;
let boardStatus: { s: string; msg?: string } = { s: 'carregando' };
let stopWatch: (() => void) | null = null;
let myId = '';

const PHASE_LABEL: Record<string, string> = Object.fromEntries(
  PHASES.filter((p) => RANKED_PHASES.includes(p.id as (typeof RANKED_PHASES)[number])).map((p) => [p.id, p.mode === 'mestra' ? 'Mestra' : p.mode === 'turma' ? 'Desafio da Turma' : `Fase ${p.number}`]),
);

function rowPortrait(r: RankRow): string {
  const look = lookFromHero({ ...DEFAULT_HERO, ...decodeVisual(r.visual) });
  return `<img class="rk-face" src="${portraitUrl(look)}" alt="">`;
}

function rowsHtml(rows: RankRow[], tab: string, max = 50): string {
  if (!rows.length) return '<p class="muted">Ninguém no placar ainda. Vença uma fase para aparecer aqui!</p>';
  return `<ol class="ranking">${rows
    .slice(0, max)
    .map((r, i) => {
      const pts = tab === 'geral' ? r.total : r.fases[tab];
      const detail = tab === 'geral' ? `${r.vencidas} fase${r.vencidas === 1 ? '' : 's'} vencida${r.vencidas === 1 ? '' : 's'}` : '';
      return `<li class="${r.jogadorId === myId ? 'me' : ''} ${i < 3 ? 'top top' + (i + 1) : ''}"><span class="rk-pos">${i + 1}º</span>${rowPortrait(r)}
        <span class="rk-name"><b>${esc(r.bruxa)}</b><small>${detail || '&nbsp;'}</small></span><span class="rk-pts">${pts}<small>pts</small></span></li>`;
    })
    .join('')}</ol>`;
}

function renderBoard(): void {
  document.querySelectorAll('[data-board-body]').forEach((el) => {
    const proj = (el as HTMLElement).dataset.boardBody === 'proj';
    const tab = proj ? 'geral' : boardTab;
    let html = '';
    if (boardStatus.s !== 'ok') html = `<p class="${boardStatus.s === 'erro' ? 'warnbox' : 'muted'}">${esc(boardStatus.msg || 'Carregando o placar…')}</p>`;
    if (lastRanking) html += rowsHtml(tab === 'geral' ? lastRanking.geral : lastRanking.porFase[tab] || [], tab, proj ? 12 : 60);
    el.innerHTML = html;
  });
  document.querySelectorAll('[data-board-tabs] button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.v === boardTab));
}

function startWatch(): void {
  if (stopWatch) return;
  stopWatch = watchBoard(
    (r) => {
      lastRanking = r;
      renderBoard();
    },
    (s, msg) => {
      boardStatus = { s, msg };
      renderBoard();
    },
  );
}

function stopWatching(): void {
  if (document.querySelector('[data-board-body]')) return; // ainda há alguém mostrando o placar
  stopWatch?.();
  stopWatch = null;
}

export function leaderboard(g: Game): void {
  myId = g.save.playerId;
  const tabs = ['geral', ...RANKED_PHASES]
    .map((t) => `<button data-action="board-tab" data-v="${t}" class="${t === boardTab ? 'on' : ''}">${t === 'geral' ? 'Geral' : PHASE_LABEL[t]}</button>`)
    .join('');
  openModal(g, {
    title: 'Placar da turma',
    body: `<p class="muted small">Conta a melhor pontuação de cada fase <b>vencida</b>. O Geral soma as fases (até 700 pontos). No seminário, use a aba Desafio da Turma. Atualiza sozinho.</p>
      <div class="tabs" data-board-tabs>${tabs}</div><div data-board-body="modal"></div>`,
    footer: `<button data-action="board-project">${iconImg('chart')} Projetar na sala</button><button class="primary" data-action="modal-close">Fechar</button>`,
    cls: 'wide',
    onClose: () => setTimeout(stopWatching, 0),
  });
  renderBoard();
  startWatch();
  void flushPending(g);
}

// ------------------------------------------------------------------ modo projeção

function projection(g: Game): void {
  closeTop(g);
  myId = '';
  const el = document.createElement('div');
  el.className = 'projection';
  el.innerHTML = `<header><h1>Poção em Apuros — Placar</h1><button class="x" data-action="board-close-projection" aria-label="Fechar">×</button></header><div data-board-body="proj"></div>`;
  document.body.appendChild(el);
  document.documentElement.requestFullscreen?.().catch(() => undefined);
  renderBoard();
  startWatch();
}

function closeProjection(): void {
  document.querySelector('.projection')?.remove();
  if (document.fullscreenElement) void document.exitFullscreen?.();
  stopWatching();
}
