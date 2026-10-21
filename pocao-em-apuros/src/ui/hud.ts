// Barra superior: dinheiro, lucro, reputação, relógio, objetivos, velocidade e menus.
import { netProfit } from '../sim/engine';
import { evaluateAll } from '../game/objectives';
import type { Game } from '../game/game';
import { iconImg } from '../render/sprites';
import { $, clock, esc, money } from './dom';

export function buildHud(g: Game): void {
  const phase = g.phase!;
  const speeds = phase.speedOptions
    .map((v) => `<button class="spd" data-action="speed" data-v="${v}" title="Velocidade ${v}× (tecla ${v})">${v}×</button>`)
    .join('');
  $('#hud').innerHTML = `
    <div class="hud-left">
      <button class="hud-brand" data-action="open-menu" title="Menu da partida">${iconImg('hat')}<span><b>Poção em Apuros</b><small>${esc(phase.number ? `Círculo ${phase.number} — ` : '')}${esc(phase.title)}</small></span></button>
    </div>
    <div class="hud-stats" data-action="hud-expand" role="button" tabindex="0" aria-label="Mostrar todos os indicadores">
      <div class="stat" data-qcash title="Dinheiro em caixa"><span class="lbl">${iconImg('coin')}Caixa</span><b data-bind="cash">0</b></div>
      <div class="stat" data-qhide-always title="Lucro líquido do dia = Ganho − Despesa operacional"><span class="lbl">${iconImg('chart')}Lucro</span><b data-bind="np">0</b></div>
      <div class="stat" data-qhide-always title="Reputação da loja"><span class="lbl">${iconImg('heart')}Reputação</span><b data-bind="rep">0</b><i class="meter"><i data-bind="repbar"></i></i></div>
      <div class="stat" title="Poções entregues hoje"><span class="lbl">${iconImg('flask')}Entregues</span><b data-bind="deliv">0</b></div>
      <div class="stat clockstat" title="Relógio da loja (1 s de jogo = 2 min)"><span class="lbl">${iconImg('clock')}<span data-bind="clock">08:00</span></span><i class="meter day"><i data-bind="daybar"></i></i></div>
    </div>
    <div class="hud-time" role="group" aria-label="Controle de tempo">
      <button class="pausebtn" data-action="pause" title="Pausar / continuar (espaço)" data-bind-pause>${iconImg('pause')}</button>
      ${speeds}
    </div>
    <nav class="hud-menu" aria-label="Painéis">
      <button data-action="open-objectives" data-qhide class="obj-btn" title="Objetivos da fase">${iconImg('star')}<span>Objetivos</span><b data-bind="objcount"></b></button>
      <button data-action="side" data-v="pedidos" title="Pedidos e clientes">${iconImg('scroll')}<span>Pedidos</span><b class="badge" data-bind="waiting"></b></button>
      <button data-action="side" data-v="despensa" data-qhide title="Ingredientes e compras">${iconImg('bag')}<span>Despensa</span></button>
      <button data-action="side" data-v="fluxo" data-qhide title="Liberação de trabalho e prioridades">${iconImg('flow')}<span>Fluxo</span></button>
      <button data-action="side" data-v="melhorias" data-qhide title="Investimentos">${iconImg('hammer')}<span>Melhorias</span></button>
      <button data-action="open-analysis" title="Análise da produção (tecla A)">${iconImg('chart')}<span>Análise</span></button>
      <button data-action="open-recipes" data-qhide title="Livro de receitas">${iconImg('book')}<span>Receitas</span></button>
      <button data-action="open-glossary" title="Glossário e os cinco passos">${iconImg('eye')}<span>Glossário</span></button>
      ${phase.hypothesisEnabled ? `<button data-action="hypothesis" class="hyp-btn" title="Registrar hipótese sobre a restrição">${iconImg('drum')}<span>Hipótese</span></button>` : ''}
    </nav>
    <button class="hud-more" data-action="open-menu" aria-label="Menu da partida">${iconImg('gear')}<span class="hm-l">Menu</span></button>`;
  // barra de abas para celular (em pé: rodapé; deitado: trilho lateral)
  // qhide: some no modo rápido (as decisões ficam no cartão da mentora), volta ao "pular dicas"
  const tab = (action: string, v: string, icon: string, label: string, extra = '', qhide = false) =>
    `<button data-action="${action}" ${v ? `data-v="${v}"` : ''} data-tab-id="${v || action}"${qhide ? ' data-qhide' : ''}>${iconImg(icon)}<span>${label}</span>${extra}</button>`;
  $('#tabbar').innerHTML =
    tab('side', 'estacao', 'hat', 'Loja') +
    tab('side', 'pedidos', 'scroll', 'Pedidos', '<b class="badge" data-bind="waiting2"></b>') +
    tab('side', 'despensa', 'bag', 'Estoque', '', true) +
    tab('side', 'fluxo', 'flow', 'Fluxo', '', true) +
    tab('open-analysis', '', 'chart', 'Análise') +
    tab('open-more', '', 'book', 'Mais');
}

let phaseBarHtml = '';

/** Barra "Agora": o objetivo mais importante no momento e a ação principal para ele. */
function renderPhaseBar(g: Game): void {
  const el = document.getElementById('phase-bar');
  if (!el) return;
  const phase = g.phase!;
  let html = '';
  if (phase.mode === 'desafio' || phase.mode === 'mestra') {
    const obj = evaluateAll(g.sim!, phase);
    const next = obj.find((o) => !o.done) || obj[obj.length - 1];
    const needHyp = phase.hypothesisEnabled && !g.sim!.hypotheses.some((h) => h.correct);
    html = `<span class="pb-label">Agora</span><span class="pb-text">${esc(next.objective.label)} <small>${esc(next.text)}</small></span>
      ${needHyp ? `<button class="primary mini" data-action="hypothesis">${iconImg('drum')}Hipótese</button>` : ''}
      <button class="mini" data-action="open-objectives" aria-label="Ver todos os objetivos">${obj.filter((o) => o.done).length}/${obj.length}</button>`;
  }
  el.hidden = !html;
  if (html !== phaseBarHtml) {
    phaseBarHtml = html;
    el.innerHTML = html;
  }
}

export function updateHud(g: Game): void {
  const s = g.sim!;
  const set = (k: string, v: string) => {
    const el = document.querySelector(`[data-bind="${k}"]`);
    if (el && el.textContent !== v) el.textContent = v;
  };
  set('cash', money(s.cash));
  set('np', money(netProfit(s)));
  set('rep', String(Math.round(s.reputation)));
  set('deliv', String(s.stats.delivered));
  set('clock', clock(Math.min(s.t, s.duration)));
  const waiting = Object.values(s.orders).filter((o) => o.status === 'aguardando').length;
  set('waiting', waiting ? String(waiting) : '');
  set('waiting2', waiting ? String(waiting) : '');
  renderPhaseBar(g);
  document.querySelectorAll('#tabbar [data-tab-id]').forEach((b) => {
    const id = (b as HTMLElement).dataset.tabId!;
    b.classList.toggle('on', document.body.classList.contains('side-open') && (id === g.side || (id === 'fluxo' && g.side === 'melhorias')));
  });
  const obj = evaluateAll(s, g.phase!, g.tutorial?.done ?? false);
  set('objcount', `${obj.filter((o) => o.done).length}/${obj.length}`);
  const rb = document.querySelector('[data-bind="repbar"]') as HTMLElement | null;
  if (rb) {
    rb.style.width = s.reputation + '%';
    rb.className = s.reputation < 25 ? 'low' : s.reputation < 50 ? 'mid' : '';
  }
  const db = document.querySelector('[data-bind="daybar"]') as HTMLElement | null;
  if (db) db.style.width = Math.min(100, (s.t / s.duration) * 100) + '%';
  const np = document.querySelector('[data-bind="np"]') as HTMLElement | null;
  if (np) np.classList.toggle('neg', netProfit(s) < 0);
  document.querySelectorAll('.spd').forEach((b) => {
    const el = b as HTMLElement;
    el.classList.toggle('on', !g.paused && Number(el.dataset.v) === g.speed);
  });
  const pb = document.querySelector('[data-bind-pause]') as HTMLElement | null;
  if (pb) {
    const want = g.paused ? 'play' : 'pause';
    if (pb.dataset.state !== want) {
      pb.dataset.state = want;
      pb.innerHTML = iconImg(want);
      pb.classList.toggle('on', g.paused);
      pb.setAttribute('aria-label', g.paused ? 'Continuar' : 'Pausar');
    }
  }
  document.body.classList.toggle('is-paused', g.paused);
}
