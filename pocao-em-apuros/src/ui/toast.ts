// Mensagens curtas de retorno (sucesso, erro, informação).
import { esc } from './dom';

let last = '';
let lastAt = 0;

export function toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
  const root = document.getElementById('toasts');
  if (!root) return;
  const now = performance.now();
  if (text === last && now - lastAt < 1500) return;
  last = text;
  lastAt = now;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  el.innerHTML = esc(text);
  root.appendChild(el);
  while (root.children.length > 4) root.firstElementChild?.remove();
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}
