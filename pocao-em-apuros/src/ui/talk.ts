// Caixa de conversa: aparece no pé da loja, sem pausar o jogo e sem cobrir a tela inteira.
import { portraitUrl } from '../render/sprites';
import type { TalkLine } from '../game/talk';
import { esc } from './dom';
import { personalize } from '../game/hero';

export function renderTalk(line: TalkLine | null, opts: { more: boolean; next: boolean }): void {
  const wrap = document.getElementById('stage-wrap');
  if (!wrap) return;
  let el = wrap.querySelector('.talk') as HTMLElement | null;
  if (!line) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('section');
    el.className = 'talk';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    wrap.appendChild(el);
  }
  el.setAttribute('aria-label', `Conversa com ${line.who}`);
  el.innerHTML = `<img class="talk-portrait" src="${portraitUrl(line.look)}" alt="">
    <div class="talk-body">
      <header><b>${esc(personalize(line.who))}</b> <small>${esc(line.role)}</small>
        <button class="talk-x" data-action="talk-close" aria-label="Fechar conversa">×</button></header>
      <p>${esc(personalize(line.text))}</p>
      <div class="talk-btns">
        ${opts.next ? '<button class="primary" data-action="talk-next">Continuar</button>' : ''}
        ${!opts.next && opts.more ? '<button data-action="talk-more">Me explica melhor</button>' : ''}
        ${!opts.next ? '<button data-action="talk-close">Entendi</button>' : ''}
      </div>
    </div>`;
}
