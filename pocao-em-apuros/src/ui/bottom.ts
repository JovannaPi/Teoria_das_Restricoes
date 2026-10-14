// Faixa inferior: fila de pedidos (com prazos) e eventos recentes.
import { RECIPES } from '../data/recipes';
import type { Game } from '../game/game';
import { flaskUrl } from '../render/sprites';
import { clock, esc } from './dom';
import { personalize } from '../game/hero';

let lastHtml = '';

export function renderBottom(g: Game, force: boolean): void {
  const root = document.getElementById('bottom');
  const s = g.sim;
  if (!root || !s) return;
  const orders = Object.values(s.orders)
    .filter((o) => o.status === 'aguardando' || o.status === 'aceito')
    .sort((a, b) => (a.status === b.status ? (a.dueAt || a.acceptBy) - (b.dueAt || b.acceptBy) : a.status === 'aguardando' ? -1 : 1));
  const cards = orders
    .slice(0, 14)
    .map((o) => {
      const total = o.status === 'aguardando' ? s.acceptWindow : Math.max(1, o.dueAt - o.acceptedAt);
      const left = o.status === 'aguardando' ? o.acceptBy - s.t : o.dueAt - s.t;
      const ratio = Math.max(0, Math.min(1, left / total));
      const late = left < 0;
      const flasks = o.lines
        .map((l) => `<span class="ol"><img src="${flaskUrl(RECIPES[l.recipe].color)}" alt="${esc(RECIPES[l.recipe].short)}">${l.delivered}/${l.qty}</span>`)
        .join('');
      return `<button class="ocard ${o.status} ${late ? 'late' : ''} ${o.vip ? 'vip' : ''} ${g.selectedOrder === o.id ? 'sel' : ''}" data-action="select-order" data-v="${o.id}" title="Pedido #${o.id} — ${esc(o.client.name)}">
        <span class="oid">#${o.id}${o.status === 'aguardando' ? ' · aceitar?' : late ? ' · atrasado' : ''}</span>${flasks}<i class="meter"><i style="width:${(late ? 1 : ratio) * 100}%"></i></i></button>`;
    })
    .join('');
  const more = orders.length > 14 ? `<span class="more">+${orders.length - 14}</span>` : '';
  const log = s.log
    .slice(-5)
    .reverse()
    .map((e) => `<li class="${e.kind}"><time>${clock(e.t)}</time> ${esc(e.text)}</li>`)
    .join('');
  const html = `<div class="orders-strip" aria-label="Pedidos em andamento">${cards || '<span class="muted">Sem pedidos no momento.</span>'}${more}</div><ul class="log" aria-live="polite">${log}</ul>`;
  if (!force && html === lastHtml) return;
  lastHtml = html;
  root.innerHTML = personalize(html);
}
