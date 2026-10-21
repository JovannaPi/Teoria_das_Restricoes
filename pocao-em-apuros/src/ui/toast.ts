// Mensagens curtas de retorno (sucesso, erro, informação).
import { esc } from './dom';
import { personalize } from '../game/hero';

let last = '';
let lastAt = 0;

export function toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
  const root = document.getElementById('toasts');
  if (!root) return;
  // modo rápido com a mentora: o cartão já diz o que importa; avisos a mais só confundem
  const b = document.body.classList;
  if (b.contains('quick') && !b.contains('guide-free') && document.body.dataset.screen === 'game') return;
  const now = performance.now();
  if (text === last && now - lastAt < 1500) return;
  last = text;
  lastAt = now;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  el.innerHTML = esc(personalize(text));
  root.appendChild(el);
  while (root.children.length > 4) root.firstElementChild?.remove();
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}
