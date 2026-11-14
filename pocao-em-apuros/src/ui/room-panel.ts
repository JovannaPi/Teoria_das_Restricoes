// Painel da sala no projetor: QR para entrar na sala e o que a turma está fazendo, ao vivo.
// Só contagens (ninguém é exposto por ter errado); o ranking usa o nome da bruxa.
import type { Game } from '../game/game';
import { drawQr, isLocalUrl } from '../online/qr';
import { debatePrompts, hostedRoom, newRoomCode, rememberHostedRoom, roomOpen, roomPlayers, roomUrl, setRoomOpen, STEP_NAMES, summarize, watchRoom, type RoomEntry } from '../online/room';
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
  const names = rows.map((r) => `<span>${esc(r.bruxa)}</span>`).join('');
  return `<div class="rp-gate closed"><div><b>Sala fechada</b> · ${quem} esperando</div>
      <button class="primary big" data-action="room-gate">Liberar a turma</button>
      <small>Quando todo mundo aparecer aqui, libere: todos começam ao mesmo tempo.</small>
      ${names ? `<div class="rp-waiting">${names}</div>` : ''}</div>`;
}

const fmt = (x: number) => x.toFixed(1).replace('.', ',');
const pretty = (u: string) => u.replace(/^https?:\/\//, '');

function liveHtml(): string {
  const s = summarize(rows);
  const max = Math.max(1, ...s.porPasso);
  const steps = STEP_NAMES.map(
    (name, i) =>
      `<li><span>${esc(name)}</span><i class="bar"><i style="width:${(s.porPasso[i] / max) * 100}%"></i></i><b>${s.porPasso[i]}</b></li>`,
  ).join('');
  const fact = (n: string, label: string, sub = '') => `<div class="rp-fact"><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const facts = [
    fact(s.identificaram ? `${s.dePrimeira} de ${s.identificaram}` : '—', 'acharam o gargalo de primeira'),
    fact(String(s.preparo), 'ajudaram o Preparo', 'e nada mudou'),
    fact(String(s.ocupado), 'deixaram todo mundo ocupado', 'filas e poções estragadas'),
    fact(String(s.fora), 'investiram fora do gargalo', 'dinheiro sem resultado'),
    fact(s.capMedia != null ? fmt(s.capMedia) : '—', 'poções por minuto no fim', 'média de quem terminou · começo: 4,4'),
  ].join('');
  const rank = s.ranking.length
    ? `<ol class="rp-rank">${s.ranking.map((r) => `<li><span>${esc(r.bruxa)}</span><b>${r.pontos}</b></li>`).join('')}</ol>`
    : '<p class="muted">O ranking aparece quando alguém terminar.</p>';
  const debate = debatePrompts(s);
  const msg =
    status === 'negado'
      ? '<p class="warnbox">A sala ainda não foi liberada no Firebase: falta colar a regra da sala (veja docs/placar-online.md).</p>'
      : status === 'offline' || status === 'erro'
        ? '<p class="warnbox">Sem conexão com o servidor agora. O painel volta sozinho quando a rede voltar.</p>'
        : '';
  return `${msg}${gateHtml()}
    <div class="rp-count"><b>${s.total}</b> ${s.total === 1 ? 'pessoa entrou' : 'pessoas entraram'} · <b>${s.terminaram}</b> terminaram</div>
    <h2>Onde a turma está</h2><ul class="rp-steps">${steps}</ul>
    <h2>O que a turma fez</h2><div class="rp-facts">${facts}</div>
    <div class="rp-bottom">
      <div><h2>Ranking da sala</h2>${rank}</div>
      <div><h2>Para o debate</h2>${debate.length ? `<ol class="rp-debate">${debate.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>` : '<p class="muted">As perguntas aparecem conforme a turma joga.</p>'}</div>
    </div>`;
}

function render(root: HTMLElement): void {
  const url = roomUrl(code);
  const local = isLocalUrl(url);
  root.innerHTML = `
    <header class="rp-head">
      <div><h1>Sala <b data-room-code>${esc(code)}</b></h1><p>Poção em Apuros · Modo rápido</p></div>
      <div class="rp-tools"><button data-action="room-new">Nova sala</button><button class="primary" data-action="room-close">Fechar</button></div>
    </header>
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
  const live = document.querySelector('.room-panel .rp-live');
  if (live) live.innerHTML = liveHtml();
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
    el.className = 'room-panel';
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
