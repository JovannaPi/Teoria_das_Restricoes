// Tela do apresentador: "slide" com o QR Code do jogo, para projetar no seminário.
import type { Game } from '../game/game';
import { currentGameUrl, drawQr, isLocalUrl } from '../online/qr';
import { esc } from './dom';

let urlValue = '';

function prettyUrl(u: string): string {
  return u.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function render(root: HTMLElement): void {
  const local = isLocalUrl(urlValue);
  root.innerHTML = `
    <div class="slide">
      <div class="slide-text">
        <h1>Poção em Apuros</h1>
        <p class="slide-sub">Sua loja de poções está atrasada. Descubra o que trava a produção e salve o dia.</p>
        <p class="slide-big">Aponte a câmera e jogue</p>
        <p class="slide-meta">Atividade de cerca de 5 minutos · sem cadastro · sem instalar nada</p>
        <p class="slide-url">Ou digite: <b>${esc(prettyUrl(urlValue))}</b></p>
      </div>
      <div class="slide-qr">${local ? '' : '<canvas aria-label="QR Code do jogo"></canvas>'}
        ${local ? `<p class="warnbox">Este endereço (<b>${esc(urlValue)}</b>) só funciona neste computador. Abra o jogo pelo link público (https) para gerar o QR Code da turma.</p>` : ''}
      </div>
    </div>
    <div class="slide-tools">
      <label>Endereço do jogo <input type="url" data-presenter-url value="${esc(urlValue)}" inputmode="url"></label>
      <button data-action="presenter-download" ${local ? 'disabled' : ''}>Baixar QR em alta resolução</button>
      <button data-action="board-project">Projetar placar</button>
      <button class="primary" data-action="presenter-close">Fechar</button>
    </div>`;
  const c = root.querySelector('canvas');
  if (c) drawQr(c, urlValue, 640);
  const inp = root.querySelector('[data-presenter-url]') as HTMLInputElement;
  inp.addEventListener('change', () => {
    urlValue = inp.value.trim();
    render(root);
  });
}

export function showPresenter(g: Game): void {
  urlValue = currentGameUrl();
  let el = document.querySelector('.presenter') as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.className = 'presenter';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'QR Code para a turma');
    document.body.appendChild(el);
  }
  render(el);
  const a = g.actions;
  a['presenter-close'] = () => document.querySelector('.presenter')?.remove();
  a['presenter-download'] = () => {
    const c = document.createElement('canvas');
    drawQr(c, urlValue, 2048);
    const link = document.createElement('a');
    link.download = 'pocao-em-apuros-qr.png';
    link.href = c.toDataURL('image/png');
    link.click();
  };
}

export function registerPresenterActions(g: Game): void {
  g.actions['presenter-close'] = () => document.querySelector('.presenter')?.remove();
  g.actions['presenter-download'] = () => showPresenter(g);
}
