// Painel da sala no projetor: QR para entrar na sala e o que a turma está fazendo, ao vivo.
// Só contagens (ninguém é exposto por ter errado); o ranking usa o nome da bruxa.
import type { Game } from '../game/game';
import { drawQr, isLocalUrl } from '../online/qr';
import { debatePrompts, hostedRoom, newRoomCode, rememberHostedRoom, roomOpen, roomPlayers, roomUrl, setRoomOpen, summarize, watchRoom, type RoomEntry } from '../online/room';
import { esc } from './dom';

let stop: (() => void) | null = null;
let code = '';
let rows: RoomEntry[] = [];
let status: 'carregando' | 'ok' | 'offline' | 'negado' | 'erro' = 'carregando';
let open = false; // a sala já foi liberada?

/** Porta da sala: fechada (todos esperando) ou liberada (quem chega entra direto). */
function gateHtml(): string {
  const n = rows.length;
  const quem = n === 1 ? '1 bruxa na sala' : `${n} bruxas na sala`;
  if (open)
    return `<div class="rp-gate open"><b>Sala liberada</b> · ${quem}. Quem escanear agora cria a bruxa e entra direto.
      <button class="mini" data-action="room-gate">Fechar a sala</button></div>`;
  // com muita gente, só os primeiros nomes (o painel cabe numa tela, sem rolar)
  const shown = rows.slice(0, 14);
  const names = shown.map((r) => `<span>${esc(r.bruxa)}</span>`).join('') + (rows.length > shown.length ? `<span>+${rows.length - shown.length}</span>` : '');
  return `<div class="rp-gate closed"><div><b>Sala fechada</b> · ${quem} esperando</div>
      <button class="primary big" data-action="room-gate">Liberar a turma</button>
      <small>Quando todo mundo aparecer aqui, libere: todos começam ao mesmo tempo.</small>
      ${names ? `<div class="rp-waiting">${names}</div>` : ''}</div>`;
}

const fmt = (x: number) => x.toFixed(1).replace('.', ',');
const pretty = (u: string) => u.replace(/^https?:\/\//, '');

function liveHtml(): string {
  const s = summarize(rows);
  const fact = (n: string, label: string, sub = '') => `<div class="rp-fact"><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const facts = [
    fact(s.identificaram ? `${s.dePrimeira} de ${s.identificaram}` : '—', 'acharam o gargalo de primeira'),
    fact(String(s.preparo), 'ajudaram o Preparo', 'e nada mudou'),
    fact(String(s.ocupado), 'deixaram todo mundo ocupado', 'filas e poções estragadas'),
    fact(String(s.fora), 'investiram fora do gargalo', 'dinheiro sem resultado'),
    fact(s.capMedia != null ? fmt(s.capMedia) : '—', 'poções por minuto no fim', 'média de quem terminou · começo: 4,4'),
  ].join('');
  const rank = s.ranking.length
    ? `<ol class="rp-rank">${s.ranking.slice(0, 6).map((r) => `<li><span>${esc(r.bruxa)}</span><b>${r.pontos}</b></li>`).join('')}</ol>`
    : '<p class="muted">O ranking aparece quando alguém terminar.</p>';
  const debate = debatePrompts(s);
  const msg =
    status === 'negado'
      ? '<p class="warnbox">A sala ainda não foi liberada no Firebase: falta colar a regra da sala (veja docs/placar-online.md).</p>'
      : status === 'offline' || status === 'erro'
        ? '<p class="warnbox">Sem conexão com o servidor agora. O painel volta sozinho quando a rede voltar.</p>'
        : '';
  if (s.terminaram === 0) {
    const n = s.total;
    const quem = n === 0 ? 'Ninguém entrou ainda.' : n === 1 ? '1 pessoa na sala.' : `${n} pessoas na sala.`;
    return `${msg}<p class="rp-wait">${quem} O resumo da turma (onde cada um está, o que a turma fez, o ranking e as perguntas para o debate) aparece quando a primeira pessoa terminar.</p>`;
  }
  return `${msg}
    <div class="rp-count"><b>${s.total}</b> ${s.total === 1 ? 'pessoa entrou' : 'pessoas entraram'} · <b>${s.terminaram}</b> terminaram</div>
    <h2>O que a turma fez</h2><div class="rp-facts">${facts}</div>
    <div class="rp-bottom">
      <div><h2>Ranking da sala</h2>${rank}</div>
      <div><h2>Para o debate</h2>${debate.length ? `<ol class="rp-debate">${debate.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>` : '<p class="muted">As perguntas aparecem conforme a turma joga.</p>'}</div>
    </div>`;
}


/* ---------- painel dentro dos slides (?painel&slide): dois cartões, no estilo da apresentação ---------- */
const CORNER = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M4 62 V30 Q4 5 30 5 H62 M4 46 Q12 22 40 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M10 10 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="currentColor"/></svg>';
const HOURGLASS = '<svg class="dk-ico" viewBox="0 0 40 52" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 H33 M7 48 H33 M10 4 C10 20 20 22 20 26 C20 30 10 32 10 48 M30 4 C30 20 20 22 20 26 C20 30 30 32 30 48"/><path d="M14 40 H26" /></svg>';
const CHECK = '<svg class="dk-ico" viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="20" r="16"/><path d="M12 21 L18 27 L29 14"/></svg>';
const PEOPLE = '<svg class="dk-people" viewBox="0 0 220 120" aria-hidden="true" fill="currentColor"><g opacity=".7"><circle cx="45" cy="52" r="17"/><path d="M14 112 q4 -40 31 -40 q27 0 31 40z"/><circle cx="175" cy="52" r="17"/><path d="M144 112 q4 -40 31 -40 q27 0 31 40z"/></g><circle cx="110" cy="40" r="22"/><path d="M70 114 q5 -52 40 -52 q35 0 40 52z"/><path d="M110 4 v8 M82 12 l5 7 M138 12 l-5 7" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/></svg>';

function renderDeck(root: HTMLElement): void {
  const url = roomUrl(code);
  const local = isLocalUrl(url);
  root.classList.add('dk');
  root.innerHTML = `
    <span class="dk-corner tl">${CORNER}</span><span class="dk-corner tr">${CORNER}</span><span class="dk-corner bl">${CORNER}</span><span class="dk-corner br">${CORNER}</span>
    <header class="dk-head">
      <div><h1>Sala <b data-room-code>${esc(code)}</b></h1><p class="dk-sub">Poção em Apuros · Modo rápido</p></div>
      <span class="dk-pill" data-pill></span>
    </header>
    <div class="dk-status" data-status></div>
    <div class="dk-grid">
      <section class="dk-card">
        <h2 class="dk-title">Entre na partida</h2>
        <div class="dk-qr">${local ? '<p class="warnbox">Este endereço só funciona neste computador. Abra o jogo pelo link público (https) para a turma conseguir entrar.</p>' : '<canvas aria-label="QR Code da sala"></canvas>'}</div>
        <p class="dk-cap">Escaneie com a câmera do celular, crie sua bruxa e espere a liberação</p>
        <p class="dk-url">${esc(pretty(url))}</p>
      </section>
      <section class="dk-card">
        <h2 class="dk-title">Sua turma</h2>
        <div class="dk-live" data-live aria-live="polite"></div>
      </section>
    </div>
    <div class="dk-cta" data-cta></div>`;
  const c = root.querySelector('canvas');
  if (c) drawQr(c, url, 520);
  refreshDeck();
}

/** Resumo compacto para o cartão "Sua turma" depois que alguém termina. */
function deckSummary(): string {
  const s = summarize(rows);
  const fact = (n: string, label: string) => `<div class="dk-fact"><b>${n}</b><span>${label}</span></div>`;
  const facts = [
    fact(s.identificaram ? `${s.dePrimeira}/${s.identificaram}` : '—', 'acharam o gargalo de primeira'),
    fact(String(s.preparo), 'ajudaram o Preparo e nada mudou'),
    fact(String(s.ocupado), 'deixaram todo mundo ocupado'),
    fact(String(s.fora), 'investiram fora do gargalo'),
    fact(s.capMedia != null ? fmt(s.capMedia) : '—', 'poções por minuto no fim'),
  ].join('');
  const rank = s.ranking.length
    ? `<ol class="dk-rank">${s.ranking.slice(0, 5).map((r) => `<li><span>${esc(r.bruxa)}</span><b>${r.pontos}</b></li>`).join('')}</ol>`
    : '<p class="muted">O ranking aparece quando alguém terminar.</p>';
  const debate = debatePrompts(s).slice(0, 3);
  const msg = status === 'negado' ? '<p class="warnbox">A sala ainda não foi liberada no Firebase.</p>' : status === 'offline' || status === 'erro' ? '<p class="warnbox">Sem conexão com o servidor agora. O painel volta sozinho quando a rede voltar.</p>' : '';
  return `${msg}<div class="dk-sum"><div class="dk-sumhead"><b>${s.terminaram}</b> terminaram · <b>${s.total}</b> entraram</div>
    <div class="dk-facts">${facts}</div>
    <div class="dk-two"><div><h3>Ranking</h3>${rank}</div><div><h3>Para o debate</h3>${debate.length ? `<ol class="dk-deb">${debate.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>` : '<p class="muted">Aparece conforme a turma joga.</p>'}</div></div></div>`;
}

function refreshDeck(): void {
  const panel = document.querySelector('.room-panel');
  if (!panel) return;
  const n = rows.length;
  const people = n === 1 ? '1 participante' : `${n} participantes`;
  const pill = panel.querySelector('[data-pill]') as HTMLElement | null;
  if (pill) {
    pill.textContent = open ? 'Sala liberada' : 'Sala fechada';
    pill.className = 'dk-pill ' + (open ? 'on' : 'off');
  }
  const st = panel.querySelector('[data-status]');
  if (st)
    st.innerHTML = `<div class="dk-st-l">${open ? CHECK : HOURGLASS}<div><b>${open ? 'Sala liberada' : 'Aguardando jogadores...'}</b><small>${open ? 'Quem escanear agora entra direto na partida.' : 'Compartilhe o código para reunir sua turma.'}</small></div></div><div class="dk-count">${people}</div>`;
  const live = panel.querySelector('[data-live]');
  if (live) {
    const s = summarize(rows);
    if (s.terminaram > 0) live.innerHTML = deckSummary();
    else if (n === 0) live.innerHTML = `<div class="dk-empty">${PEOPLE}<p>Os personagens aparecerão aqui quando entrarem.</p></div>`;
    else {
      const shown = rows.slice(0, 30);
      live.innerHTML = `<div class="dk-names">${shown.map((r) => `<span>${esc(r.bruxa)}</span>`).join('')}${rows.length > shown.length ? `<span>+${rows.length - shown.length}</span>` : ''}</div>`;
    }
  }
  const cta = panel.querySelector('[data-cta]');
  if (cta)
    cta.innerHTML = open
      ? '<button class="dk-btn ghost" data-action="room-gate">Fechar a sala</button>'
      : '<button class="dk-btn" data-action="room-gate">Liberar a turma</button>';
}

function render(root: HTMLElement): void {
  if (root.classList.contains('deck')) {
    renderDeck(root);
    return;
  }
  const url = roomUrl(code);
  const local = isLocalUrl(url);
  root.innerHTML = `
    <header class="rp-head">
      <div><h1>Sala <b data-room-code>${esc(code)}</b></h1><p>Poção em Apuros · Modo rápido</p></div>
      <div class="rp-tools"><button data-action="room-new">Nova sala</button><button class="primary" data-action="room-close">Fechar</button></div>
    </header>
    <div class="rp-gatebar" data-gatebar>${gateHtml()}</div>
    <div class="rp-grid">
      <section class="rp-join">
        ${local ? `<p class="warnbox">Este endereço só funciona neste computador. Abra o jogo pelo link público (https) para a turma conseguir entrar.</p>` : '<canvas aria-label="QR Code da sala"></canvas>'}
        <p class="rp-big">Aponte a câmera, <b>crie sua bruxa</b> e espere a liberação</p>
        <p class="rp-url">${esc(pretty(url))}</p>
      </section>
      <section class="rp-live" aria-live="polite">${liveHtml()}</section>
    </div>`;
  const c = root.querySelector('canvas');
  if (c) drawQr(c, url, 520);
}

function refreshLive(): void {
  if (document.querySelector('.room-panel.deck')) {
    refreshDeck();
    return;
  }
  const live = document.querySelector('.room-panel .rp-live');
  if (live) live.innerHTML = liveHtml();
  const bar = document.querySelector('.room-panel [data-gatebar]');
  if (bar) bar.innerHTML = gateHtml();
}

function startWatching(): void {
  stop?.();
  rows = [];
  open = false;
  status = 'carregando';
  stop = watchRoom(
    code,
    (r) => {
      rows = roomPlayers(r);
      open = roomOpen(r);
      refreshLive();
    },
    (st) => {
      status = st;
      refreshLive();
    },
  );
}

export function showRoomPanel(g: Game, fresh = false): void {
  code = (!fresh && hostedRoom()) || newRoomCode();
  rememberHostedRoom(code);
  document.querySelector('.presenter')?.remove();
  let el = document.querySelector('.room-panel') as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.className = 'room-panel' + (new URLSearchParams(location.search).has('slide') ? ' deck' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Sala da turma');
    document.body.appendChild(el);
  }
  render(el);
  startWatching();
  const a = g.actions;
  a['room-close'] = () => {
    stop?.();
    stop = null;
    document.querySelector('.room-panel')?.remove();
  };
  a['room-new'] = () => showRoomPanel(g, true);
  a['room-gate'] = () => {
    open = !open; // já mostra o novo estado; o servidor confirma em seguida
    refreshLive();
    void setRoomOpen(code, open);
  };
}

export function registerRoomActions(g: Game): void {
  g.actions['room-open'] = () => showRoomPanel(g);
}
