// Ranking da sala de aula: quem terminou o modo sala de aula, por pontos. Atualiza ao vivo.
import type { Game } from '../game/game';
import { heroName } from '../game/hero';
import { currentRoom, roomPlayers, summarize, watchRoom } from '../online/room';
import { esc } from './dom';
import { openModal } from './modals';

const fmt = (x: number) => x.toFixed(1).replace('.', ',');

function rankHtml(rows: ReturnType<typeof roomPlayers>): string {
  const s = summarize(rows);
  const me = heroName();
  const total = s.total === 1 ? '1 pessoa na sala' : `${s.total} pessoas na sala`;
  if (!s.ranking.length) return `<p class="muted">${total}. O ranking aparece quando alguém terminar.</p>`;
  const list = s.ranking
    .map((r, i) => `<li class="${r.bruxa === me ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm">${esc(r.bruxa)}${r.bruxa === me ? ' (você)' : ''}</span><b>${r.pontos}</b><small>${fmt(r.capFim)} poções/min</small></li>`)
    .join('');
  return `<p class="muted small">${total} · ${s.terminaram} terminaram</p><ol class="room-rank">${list}</ol>`;
}

export function showRoomRanking(g: Game): void {
  const code = currentRoom();
  if (!code) return;
  let stop: (() => void) | null = null;
  const { el, promise } = openModal(g, {
    title: `Ranking da sala ${esc(code)}`,
    body: '<div data-room-rank><p class="muted">Carregando o ranking…</p></div>',
    cls: 'small',
    footer: '<button class="primary" data-action="modal-close">Fechar</button>',
    onClose: () => stop?.(),
  });
  stop = watchRoom(
    code,
    (rows) => {
      const box = el.querySelector('[data-room-rank]');
      if (box) box.innerHTML = rankHtml(roomPlayers(rows));
    },
    (st) => {
      const box = el.querySelector('[data-room-rank]');
      if (box && st !== 'ok') box.innerHTML = '<p class="muted">Sem conexão com a sala agora. O ranking volta quando a rede voltar.</p>';
    },
  );
  void promise.then(() => stop?.());
}
