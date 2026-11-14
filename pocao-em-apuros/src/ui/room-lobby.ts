// Entrada do aluno pela sala da turma (link ?sala=CODIGO, o QR do telão):
// cria a bruxa (nome e visual), fica na sala de espera e começa quando a professora libera no telão.
// Quem chega depois da liberação cria a bruxa e entra direto.
import type { Game } from '../game/game';
import { hero, heroName, lookFromHero } from '../game/hero';
import { writeSave } from '../game/save';
import { currentRoom, leaveRoom, reportRoom, roomOpen, watchRoom } from '../online/room';
import { portraitUrl } from '../render/sprites';
import { esc } from './dom';
import { heroCreator } from './online';
import { renderTitle } from './title';

const SOLO_AFTER_MS = 8000;

export async function roomLobby(g: Game): Promise<void> {
  const code = currentRoom();
  if (!code) return;
  await heroCreator(g, true, 'Entrar na sala');
  if (!g.save.hero) return;

  document.querySelector('.room-wait')?.remove();
  const el = document.createElement('div');
  el.className = 'room-wait';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Sala de espera da turma');
  el.innerHTML = `
    <div class="rw-card">
      <img class="hero-portrait" src="${portraitUrl(lookFromHero(hero()), 'cast')}" alt="">
      <h2>${esc(heroName())}</h2>
      <p class="rw-room">Sala <b>${esc(code)}</b></p>
      <div data-rw-body>
        <p class="rw-msg">Você está na sala!<br>O jogo começa quando a professora liberar no telão.</p>
        <p class="rw-dots" aria-hidden="true"><i></i><i></i><i></i></p>
      </div>
      <div class="rw-tools">
        <button data-rw="edit">Mudar a bruxa</button>
        <button data-rw="solo" hidden>Sem conexão com a sala — jogar assim mesmo</button>
        <button data-rw="leave" class="mini">Sair da sala</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  let done = false;
  let counting = false;
  let timer = 0;
  const solo = el.querySelector('[data-rw="solo"]') as HTMLElement;
  const fallback = window.setTimeout(() => (solo.hidden = false), SOLO_AFTER_MS);
  const finish = (): void => {
    done = true;
    stop();
    clearTimeout(fallback);
    clearInterval(timer);
    el.remove();
  };
  const play = (): void => {
    finish();
    if (g.save.run && g.save.run.phaseId !== 'turma') {
      g.save.run = null;
      writeSave(g.save);
    }
    void g.startPhase('turma', false);
  };
  const countdown = (): void => {
    if (counting || done) return;
    counting = true;
    (el.querySelector('.rw-tools') as HTMLElement).hidden = true;
    const body = el.querySelector('[data-rw-body]') as HTMLElement;
    let n = 3;
    const show = (): void => {
      body.innerHTML = `<p class="rw-msg">Preparar…</p><p class="rw-count">${n}</p>`;
    };
    show();
    timer = window.setInterval(() => {
      n--;
      if (n > 0) show();
      else play();
    }, 900);
  };

  // avisa o telão que esta bruxa está na sala (passo 0, ainda sem jogar)
  reportRoom({ jogadorId: g.save.playerId, bruxa: heroName(), passo: 0, erros: 0, preparo: false, ocupado: false, fora: false, capFim: 0, pontos: -1 }, true);
  const stop = watchRoom(
    code,
    (rows) => {
      if (done) return;
      clearTimeout(fallback);
      solo.hidden = true;
      if (roomOpen(rows)) countdown();
    },
    (st) => {
      if (st !== 'ok' && !done) solo.hidden = false;
    },
  );

  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('[data-rw]') as HTMLElement | null;
    if (!b) return;
    if (b.dataset.rw === 'solo') play();
    if (b.dataset.rw === 'edit') {
      finish();
      void roomLobby(g);
    }
    if (b.dataset.rw === 'leave') {
      finish();
      leaveRoom();
      renderTitle(g);
    }
  });
}
