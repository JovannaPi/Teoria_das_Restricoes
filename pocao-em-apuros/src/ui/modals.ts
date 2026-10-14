// Janelas modais: diálogos, hipóteses, análise, receitas, glossário, configurações e avaliação.
import { CHARACTERS } from '../data/characters';
import { heroName, personalize } from '../game/hero';
import { FIVE_STEPS, GLOSSARY } from '../data/glossary';
import type { DialogueLine } from '../data/phases';
import { INGREDIENTS, materialCost, RECIPES, unitThroughput } from '../data/recipes';
import { STATION_ORDER, STATIONS } from '../data/stations';
import type { Game } from '../game/game';
import { evaluateAll, ScoreBreakdown } from '../game/objectives';
import { iconImg, LOOKS, portraitUrl, flaskUrl } from '../render/sprites';
import { analyzeCapacity, averageQueue, observedUtilization, recentUtilization } from '../sim/analysis';
import { averageWip, inventoryValue, netProfit, operatingExpense, throughputGain } from '../sim/engine';
import type { ActiveEvent, Hypothesis, IngredientId, StationId } from '../sim/types';
import { barChart, lineChart } from './charts';
import { contextualReflection, fiveSteps } from '../game/fivesteps';
import { clock, esc, money, n1, pct, shopMinutes, STATION_COLORS } from './dom';

interface ModalEntry {
  el: HTMLElement;
  resolve: (v: unknown) => void;
  pause: boolean;
  onClose?: () => void;
}

const stack: ModalEntry[] = [];

export function isOpen(): boolean {
  return stack.length > 0;
}

export function openModal<T = unknown>(g: Game, opts: Parameters<typeof open>[1]) {
  return open<T>(g, opts);
}

function open<T = unknown>(
  g: Game,
  opts: { title?: string; body: string; cls?: string; pause?: boolean; closable?: boolean; footer?: string; onClose?: () => void },
): { el: HTMLElement; promise: Promise<T> } {
  const root = document.getElementById('modal-root')!;
  const el = document.createElement('div');
  el.className = 'modal-back';
  el.innerHTML = `<div class="modal ${opts.cls || ''}" role="dialog" aria-modal="true" ${opts.title ? `aria-label="${esc(opts.title)}"` : ''}>
    ${opts.title ? `<header><h2>${opts.title}</h2>${opts.closable !== false ? '<button class="x" data-action="modal-close" aria-label="Fechar">×</button>' : ''}</header>` : ''}
    <div class="modal-body">${personalize(opts.body)}</div>
    ${opts.footer ? `<footer>${opts.footer}</footer>` : ''}
  </div>`;
  root.appendChild(el);
  const pause = opts.pause !== false;
  if (pause) g.pushModalPause();
  let resolve!: (v: unknown) => void;
  const promise = new Promise<T>((r) => (resolve = r as (v: unknown) => void));
  stack.push({ el, resolve, pause, onClose: opts.onClose });
  const focusable = el.querySelector('button.primary, button, [tabindex]') as HTMLElement | null;
  focusable?.focus();
  return { el, promise };
}

function close(g: Game, entry: ModalEntry, value?: unknown) {
  const i = stack.indexOf(entry);
  if (i < 0) return;
  stack.splice(i, 1);
  entry.el.remove();
  if (entry.pause) g.popModalPause();
  entry.onClose?.();
  entry.resolve(value);
}

export function closeTop(g: Game, value?: unknown): void {
  const top = stack[stack.length - 1];
  if (top) close(g, top, value);
  if (dlg && !stack.some((e) => e.el === dlg!.el)) dlg = null;
}

export function closeAll(g: Game): void {
  while (stack.length) closeTop(g);
  dlg = null;
}

export function switchTab(btn: HTMLElement): void {
  const modal = btn.closest('.modal')!;
  const name = btn.dataset.v!;
  modal.querySelectorAll('[data-tabbtn]').forEach((b) => {
    b.classList.toggle('on', (b as HTMLElement).dataset.v === name);
    b.setAttribute('aria-selected', String((b as HTMLElement).dataset.v === name));
  });
  modal.querySelectorAll('[data-tab]').forEach((p) => ((p as HTMLElement).hidden = (p as HTMLElement).dataset.tab !== name));
  const hook = (modal as HTMLElement & { onTab?: (n: string) => void }).onTab;
  if (hook) hook(name);
}

// ------------------------------------------------------------------ diálogos

let dlg: { el: HTMLElement; lines: DialogueLine[]; i: number; done: () => void } | null = null;

const WHO: Record<DialogueLine['who'], { name: string; look: keyof typeof LOOKS | null }> = {
  mentora: { name: CHARACTERS.mentora.name, look: 'morgana' },
  protagonista: { name: '', look: 'lina' },
  aprendiz: { name: CHARACTERS.aprendiz.name, look: 'tico' },
  comerciante: { name: CHARACTERS.comerciante.name, look: 'trufa' },
  narrador: { name: '', look: null },
};

function renderLine(): void {
  if (!dlg) return;
  const line = dlg.lines[dlg.i];
  const who = WHO[line.who];
  const box = dlg.el.querySelector('.dlg')!;
  box.innerHTML = `${who.look ? `<img class="portrait" src="${portraitUrl(LOOKS[who.look], line.who === 'aprendiz' ? 'happy' : 'idle')}" alt="">` : ''}
    <div class="dlg-text ${line.who === 'narrador' ? 'narr' : ''}">${who.name || line.who === 'protagonista' ? `<b>${esc(line.who === 'protagonista' ? heroName() : who.name)}</b>` : ''}<p>${esc(personalize(line.text))}</p>
    <div class="dlg-foot"><small>${dlg.i + 1}/${dlg.lines.length}</small><button class="primary" data-action="dialogue-next">${dlg.i === dlg.lines.length - 1 ? 'Começar' : 'Continuar'}</button></div></div>`;
  (box.querySelector('button.primary') as HTMLElement)?.focus();
}

export function dialogue(g: Game, lines: DialogueLine[]): Promise<void> {
  if (!lines.length) return Promise.resolve();
  const { el, promise } = open<void>(g, { body: '<div class="dlg"></div>', cls: 'dialogue', closable: false });
  return new Promise((resolve) => {
    dlg = {
      el,
      lines,
      i: 0,
      done: () => {
        closeTop(g);
        dlg = null;
        resolve();
      },
    };
    renderLine();
    void promise;
  });
}

export function dialogueNext(): void {
  if (!dlg) return;
  dlg.i++;
  if (dlg.i >= dlg.lines.length) dlg.done();
  else renderLine();
}

export async function confirm(g: Game, html: string, okLabel = 'Confirmar'): Promise<boolean> {
  const { el, promise } = open<boolean>(g, {
    title: 'Confirmar',
    body: `<p>${html}</p>`,
    cls: 'small',
    footer: `<button data-confirm="no">Cancelar</button><button class="primary" data-confirm="yes">${esc(okLabel)}</button>`,
  });
  el.querySelectorAll('[data-confirm]').forEach((b) =>
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      closeTop(g, (b as HTMLElement).dataset.confirm === 'yes');
    }),
  );
  return !!(await promise);
}

// ------------------------------------------------------------------ objetivos e eventos

export async function objectivesIntro(g: Game): Promise<void> {
  const phase = g.phase!;
  const s = g.sim!;
  const obj = evaluateAll(s, phase, g.tutorial?.done ?? false);
  const body = `<p class="lead">${esc(phase.goalText)}</p>
    <p class="chip big">${esc(phase.tocStep)}</p>
    <ul class="objectives">${obj.map((o) => `<li class="${o.done ? 'done' : ''}">${iconImg(o.done ? 'check' : 'star')} ${esc(o.objective.label)} <small>${esc(o.text)}</small></li>`).join('')}</ul>
    <p class="muted small">O dia vai das 08:00 às ${clock(s.duration)}. Derrota imediata se a reputação chegar a zero ou o caixa ficar muito negativo. Você pode pausar (espaço) a qualquer momento.</p>`;
  const { promise } = open(g, { title: `${phase.number ? `Círculo ${phase.number}: ` : ''}${esc(phase.title)}`, body, footer: '<button class="primary" data-action="modal-close">Vamos lá</button>' });
  await promise;
}

export function eventBanner(_g: Game, e: ActiveEvent): void {
  const root = document.getElementById('toasts');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `event-banner ev-${e.kind}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${iconImg(e.kind === 'cristal_temporario' ? 'crystal' : e.kind === 'cliente_vip' ? 'star' : e.kind === 'desconto' ? 'coin' : 'warn')}<div><b>${esc(e.title)}</b><p>${esc(e.text)}</p></div>`;
  root.appendChild(el);
  setTimeout(() => el.classList.add('out'), 7000);
  setTimeout(() => el.remove(), 7600);
}

export async function crystalChoice(g: Game): Promise<void> {
  const s = g.sim!;
  const ev = s.events.find((e) => e.id === s.pendingCrystal);
  const opts = STATION_ORDER.filter((id) => !s.stations[id].locked && id !== 'balcao')
    .map((id) => `<button class="row-btn" data-action="crystal" data-v="${id}"><i class="dot" style="background:${STATION_COLORS[id]}"></i>${esc(STATIONS[id].name)}<span>fila ${s.stations[id].queue.length}</span></button>`)
    .join('');
  open(g, {
    title: 'Um cristal de aceleração!',
    body: `<p>${esc(ev?.text || '')}</p><p class="muted small">Pense: em qual estação 50% a mais de velocidade aumenta as entregas da loja inteira?</p><div class="station-list">${opts}</div>`,
    closable: true,
  });
}

// ------------------------------------------------------------------ hipóteses

export function hypothesisPicker(g: Game, preselect: StationId | null): void {
  const s = g.sim!;
  if (s.hypotheses.some((h) => h.correct == null)) {
    open(g, { title: 'Hipótese em verificação', body: '<p>A Vó Morgana ainda está conferindo a hipótese anterior com os dados da loja. Aguarde alguns instantes.</p>', footer: '<button class="primary" data-action="modal-close">Ok</button>' });
    return;
  }
  const past = s.hypotheses
    .map((h) => `<li>${clock(h.t)} — ${h.station === 'mercado' ? 'Demanda' : esc(STATIONS[h.station].short)}: ${h.correct ? '<b class="pos">confirmada</b>' : '<b class="neg">não confirmada</b>'}</li>`)
    .join('');
  const opts = STATION_ORDER.filter((id) => !s.stations[id].locked)
    .map(
      (id) =>
        `<button class="row-btn ${preselect === id ? 'sel' : ''}" data-action="hypothesis-confirm" data-v="${id}"><i class="dot" style="background:${STATION_COLORS[id]}"></i>${esc(STATIONS[id].name)}</button>`,
    )
    .join('');
  open(g, {
    title: 'Registrar hipótese',
    body: `<p>Qual recurso limita, <b>hoje</b>, a quantidade de poções que a loja consegue entregar?</p>
    <p class="muted small">Pense na carga: quanto trabalho cada estação recebe comparado com o que consegue fazer. Uma estação muito ocupada nem sempre é a restrição; uma estação parada nem sempre é o problema.</p>
    <div class="station-list">${opts}<button class="row-btn" data-action="hypothesis-confirm" data-v="mercado">${iconImg('people')} Nenhuma estação — a demanda (mercado) limita</button></div>
    ${past ? `<h3>Hipóteses anteriores</h3><ul class="list">${past}</ul>` : ''}
    <p class="muted small">Depois de registrar, a mentora observa a loja por ${shopMinutes(20)} e compara com os dados.</p>`,
  });
}

export async function hypothesisResult(g: Game, h: Hypothesis): Promise<void> {
  const name = h.station === 'mercado' ? 'a demanda' : STATIONS[h.station].short;
  const truth = h.truth === 'mercado' || h.truth == null ? 'a demanda (nenhuma estação está saturada)' : STATIONS[h.truth].short;
  const body = h.correct
    ? `<p class="pos"><b>Confirmado:</b> ${esc(name)} limita a loja agora.</p>`
    : `<p class="neg"><b>Não é bem isso.</b> ${esc(name)} não é o que limita a loja neste momento.</p><p class="muted small">Olhe de novo para as filas e para a capacidade de cada estação comparada com o que chega até ela.</p>`;
  const ev = `<h3>O que os dados mostram</h3><ul class="list">${h.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
  const extra = h.correct ? `<p class="small">Pelos dados, a restrição atual é: <b>${esc(truth)}</b>.</p>` : '';
  const { promise } = open(g, {
    title: h.correct ? 'Hipótese confirmada' : 'Hipótese não confirmada',
    body: `<div class="mentor-note"><img class="portrait sm" src="${portraitUrl(LOOKS.morgana)}" alt="">${body}</div>${ev}${extra}`,
    footer: '<button class="primary" data-action="modal-close">Continuar</button>',
  });
  await promise;
  g.refreshUi(true);
}

// ------------------------------------------------------------------ análise

export function analysis(g: Game): void {
  const s = g.sim!;
  const phase = g.phase!;
  const a = analyzeCapacity(s);
  const lens = phase.showLoadLens || s.hypotheses.some((h) => h.correct);
  const ids = STATION_ORDER.filter((id) => !s.stations[id].locked);
  const rows = ids
    .map((id) => {
      const st = s.stations[id];
      const tot = st.slots * Math.max(1, s.t);
      const caps = s.recipes
        .filter((r) => a.loads[id].capacityPerMin[r] != null)
        .map((r) => `${RECIPES[r].short} ${n1(a.loads[id].capacityPerMin[r]!)}`)
        .join('<br>');
      return `<tr><th scope="row"><i class="dot" style="background:${STATION_COLORS[id]}"></i>${esc(STATIONS[id].short)}</th><td>${st.slots}</td>
        <td>${pct(observedUtilization(s, id))}</td><td>${pct(recentUtilization(s, id))}</td>
        <td>${st.queue.length}</td><td>${n1(averageQueue(s, id))}</td><td>${st.maxQueue}</td>
        <td>${pct(st.starvedTime / tot)}</td><td>${pct(st.stoppedTime / tot)}</td><td>${pct(st.setupSpent / tot)}</td>
        <td class="caps">${caps || '—'}</td>${lens ? `<td class="${a.loads[id].load > 1 ? 'neg' : ''}"><b>${pct(a.loads[id].load)}</b></td>` : ''}</tr>`;
    })
    .join('');
  const inv = inventoryValue(s);
  const T = throughputGain(s);
  const OE = operatingExpense(s);
  const NP = netProfit(s);
  const roi = inv.total > 0 ? NP / inv.total : 0;
  const fin = `
    <div class="fin-grid">
      <section><h3>Ganho</h3>
        <div class="kv"><div><span>Receita das vendas</span><b>${money(s.acct.revenue)}</b></div>
        <div><span>− Ingredientes das poções vendidas (CTV)</span><b>${money(s.acct.ctvSold)}</b></div>
        <div class="hl"><span>= Ganho</span><b>${money(T)}</b></div>
        <div><span>Receita perdida por atrasos</span><b>${money(s.acct.lostToLateness)}</b></div></div></section>
      <section><h3>Despesa operacional</h3>
        <div class="kv"><div><span>Equipe, aluguel e políticas</span><b>${money(s.acct.opCash - s.acct.wipHolding)}</b></div>
        <div><span>Manutenção do estoque em processo</span><b>${money(s.acct.wipHolding)}</b></div>
        <div><span>Refugo (ingredientes perdidos)</span><b>${money(s.acct.scrapCost)}</b></div>
        <div><span>Depreciação das melhorias</span><b>${money(s.acct.depreciation)}</b></div>
        <div class="hl"><span>= Despesa operacional</span><b>${money(OE)}</b></div></div></section>
      <section><h3>Resultado</h3>
        <div class="kv"><div class="hl"><span>Lucro líquido = Ganho − DO</span><b class="${NP < 0 ? 'neg' : 'pos'}">${money(NP)}</b></div>
        <div><span>Retorno sobre o investimento</span><b>${pct(roi)}</b></div>
        <div><span>Caixa (início → agora)</span><b>${money(s.startCash)} → ${money(s.cash)}</b></div>
        <div><span>Compras de ingredientes pagas</span><b>${money(s.acct.materialsPurchased)}</b></div></div></section>
      <section><h3>Investimento (dinheiro imobilizado)</h3>
        <div class="kv"><div><span>Ingredientes na despensa</span><b>${money(inv.materias)}</b></div>
        <div><span>Poções em processo</span><b>${money(inv.emProcesso)}</b></div>
        <div><span>Poções prontas sem dono</span><b>${money(inv.prontas)}</b></div>
        <div><span>Equipamentos (valor contábil)</span><b>${money(inv.equipamentos)}</b></div>
        <div class="hl"><span>= Investimento</span><b>${money(inv.total)}</b></div></div></section>
    </div>
    <p class="muted small">Faturamento não é lucro, e produzir não é ganhar: só poções vendidas geram ganho. A identidade "variação do caixa = lucro líquido − variação do investimento" vale em toda a partida.</p>`;
  const flow = `<div class="kv two">
      <div><span>Pedidos concluídos</span><b>${s.stats.ordersCompleted}</b></div>
      <div><span>Poções entregues (no prazo / atrasadas)</span><b>${s.stats.delivered} (${s.stats.deliveredOnTime} / ${s.stats.deliveredLate})</b></div>
      <div><span>Pedidos cancelados por atraso</span><b>${s.stats.ordersCanceled}</b></div>
      <div><span>Clientes que desistiram / recusados</span><b>${s.stats.ordersExpired} / ${s.stats.ordersRefused}</b></div>
      <div><span>Tempo médio de atravessamento (poção)</span><b>${s.stats.leadTimeCount ? shopMinutes(s.stats.leadTimeSum / s.stats.leadTimeCount) : '—'}</b></div>
      <div><span>Tempo médio do pedido (aceite → entrega)</span><b>${s.stats.orderLeadCount ? shopMinutes(s.stats.orderLeadSum / s.stats.orderLeadCount) : '—'}</b></div>
      <div><span>Estoque em processo (agora / médio / máximo)</span><b>${Object.values(s.jobs).filter((j) => j.location !== 'prateleira').length} / ${n1(averageWip(s))} / ${s.stats.maxWip}</b></div>
      <div><span>Poções liberadas / antecipadas sem pedido</span><b>${s.stats.released} / ${s.stats.speculativeMade}</b></div>
      <div><span>Refugos (total / pegos antes do caldeirão)</span><b>${s.stats.failures} / ${s.stats.failuresCaughtEarly}</b></div>
      <div><span>Ingredientes que murcharam na fila</span><b>${s.stats.spoiled}</b></div>
      <div><span>Taxa de falha</span><b>${s.stats.released ? pct(s.stats.failures / s.stats.released) : '—'}</b></div>
      <div><span>Demanda atual estimada</span><b>${n1(a.demandPerMin)} poções/min</b></div>
    </div>
    ${s.hypotheses.length ? `<h3>Hipóteses</h3><ul class="list">${s.hypotheses.map((h) => `<li>${clock(h.t)}: ${h.station === 'mercado' ? 'Demanda' : esc(STATIONS[h.station].short)} — ${h.correct == null ? 'verificando…' : h.correct ? 'confirmada' : 'não confirmada'}</li>`).join('')}</ul>` : ''}`;
  const body = `
    <div class="tabs" role="tablist">
      <button data-tabbtn data-action="modal-tab" data-v="estacoes" class="on" role="tab" aria-selected="true">Estações</button>
      <button data-tabbtn data-action="modal-tab" data-v="graficos" role="tab">Gráficos</button>
      <button data-tabbtn data-action="modal-tab" data-v="financas" role="tab">Finanças</button>
      <button data-tabbtn data-action="modal-tab" data-v="fluxo" role="tab">Fluxo e pedidos</button>
    </div>
    <div data-tab="estacoes">
      <div class="tbl-wrap"><table class="tbl analysis"><thead><tr><th>Estação</th><th>Postos</th><th>Utilização (dia)</th><th>Utilização (60 s)</th><th>Fila agora</th><th>Fila média</th><th>Fila máx.</th><th>Sem trabalho</th><th>Parada</th><th>Limpando</th><th>Capacidade (poções/min por receita)</th>${lens ? '<th>Carga da demanda</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted small">Capacidade por receita = quantas poções daquela receita a estação faria por minuto se só fizesse ela. Compare com a demanda (${n1(a.demandPerMin)} poções/min: ${s.recipes.map((r) => `${RECIPES[r].short} ${n1(a.demandByRecipe[r] || 0)}`).join(', ')}).${lens ? ' Carga acima de 100%: a estação não dá conta da demanda.' : ' A carga teórica fica visível depois que você identificar a restrição.'}</p>
    </div>
    <div data-tab="graficos" hidden>
      <h3>Utilização nos últimos 60 s</h3><div class="chart"><canvas data-chart="util"></canvas></div>
      <h3>Fila na frente de cada estação</h3><div class="chart"><canvas data-chart="queues"></canvas><div class="chart-tip"></div></div>
      <h3>Entregas acumuladas e estoque em processo</h3><div class="chart"><canvas data-chart="flow"></canvas><div class="chart-tip"></div></div>
      <p class="muted small">Tabela com os mesmos dados na aba Estações.</p>
    </div>
    <div data-tab="financas" hidden>${fin}</div>
    <div data-tab="fluxo" hidden>${flow}</div>`;
  const { el } = open(g, { title: 'Análise da produção', body, cls: 'wide' });
  const modal = el.querySelector('.modal') as HTMLElement & { onTab?: (n: string) => void };
  modal.onTab = (name) => {
    if (name !== 'graficos') return;
    const ser = s.series;
    const util = el.querySelector('[data-chart="util"]') as HTMLCanvasElement;
    barChart(
      util,
      ids.map((id) => ({ label: STATIONS[id].short, value: recentUtilization(s, id), color: STATION_COLORS[id] })),
      { max: 1, fmt: (v) => pct(v) },
    );
    lineChart(
      el.querySelector('[data-chart="queues"]') as HTMLCanvasElement,
      ser.t,
      ids.map((id) => ({ name: STATIONS[id].short, color: STATION_COLORS[id], values: ser.queues[id] })),
      { xFmt: clock, height: 210, integer: true },
    );
    lineChart(
      el.querySelector('[data-chart="flow"]') as HTMLCanvasElement,
      ser.t,
      [
        { name: 'Entregues', color: '#3c8fd0', values: ser.delivered },
        { name: 'Em processo', color: '#c27a16', values: ser.wip },
      ],
      { xFmt: clock, height: 190, integer: true },
    );
  };
}

// ------------------------------------------------------------------ receitas

export function recipes(g: Game): void {
  const s = g.sim!;
  const cards = s.recipes
    .map((r) => {
      const R = RECIPES[r];
      const ing = (Object.entries(R.ingredients) as [IngredientId, number][]).map(([i, q]) => `${q}× ${esc(INGREDIENTS[i].name)}`).join(', ');
      const route = R.route.map((st) => `<span class="chip" style="border-color:${STATION_COLORS[st.station]}">${esc(STATIONS[st.station].short)} ${st.time}s</span>`).join('<span class="arrow">→</span>');
      const T = unitThroughput(r);
      const perStation = R.route
        .filter((st) => st.station !== 'balcao')
        .map((st) => `${esc(STATIONS[st.station].short)}: <b>${n1((T / (st.time + (st.station === 'caldeirao' ? s.stations.caldeirao.setupTime : 0))) * 60)}</b>`)
        .join(' · ');
      return `<article class="recipe"><img src="${flaskUrl(R.color, r === 'transformacao' ? 1 : r === 'precisao' ? 2 : 0)}" alt="">
        <div><h3>${esc(R.name)}</h3><p class="muted small">${esc(R.flavor)}</p>
        <p><b>Ingredientes:</b> ${ing}</p>
        <p class="route">${route}</p>
        <div class="kv compact"><div><span>Preço</span><b>${R.price}</b></div><div><span>Custo dos ingredientes (CTV)</span><b>${n1(materialCost(r))}</b></div><div><span>Ganho por poção</span><b>${n1(T)}</b></div><div><span>Prazo base</span><b>${shopMinutes(R.dueTime)}</b></div><div><span>Multa por atraso</span><b>${pct(R.latePenalty)} do preço</b></div><div><span>Chance de defeito / mistura desandar</span><b>${pct(R.defectRate)} / ${pct(R.processFailRate)}</b></div></div>
        <p class="small">Ganho por minuto de uso de cada estação: ${perStation}</p></div></article>`;
    })
    .join('');
  open(g, { title: 'Livro de receitas', body: `<p class="muted small">Os tempos são por poção, em segundos de jogo (1 s = 2 minutos da loja).</p>${cards}`, cls: 'wide' });
}

// ------------------------------------------------------------------ glossário

export function glossaryHtml(): string {
  return `<h3>Os cinco passos da Teoria das Restrições</h3>
    <ol class="steps">${FIVE_STEPS.map((st) => `<li><b>${esc(st.name)}</b><p>${esc(st.text)}</p><small>No jogo: ${esc(st.inGame)}</small></li>`).join('')}</ol>
    <h3>Termos</h3>
    <dl class="gloss">${GLOSSARY.map((e) => `<dt>${esc(e.term)}</dt><dd>${esc(e.def)}<br><small>No jogo: ${esc(e.inGame)}</small></dd>`).join('')}</dl>`;
}

export function glossary(g: Game): void {
  open(g, { title: 'Glossário', body: glossaryHtml(), cls: 'wide' });
}

// ------------------------------------------------------------------ configurações e menu

function settingsBody(g: Game): string {
  const a = g.save.settings.audio;
  const slider = (k: 'master' | 'sfx' | 'ambience', label: string) =>
    `<label class="slider">${label}<input type="range" min="0" max="100" value="${Math.round(a[k] * 100)}" data-k="${k}" data-change="settings-volume" aria-label="${label}"></label>`;
  return `${slider('master', 'Volume geral')}${slider('sfx', 'Efeitos')}${slider('ambience', 'Ambiente e música')}
    <button data-action="settings-mute">${iconImg(a.muted ? 'mute' : 'sound')} ${a.muted ? 'Ativar som' : 'Silenciar'}</button>
    <label class="toggle"><input type="checkbox" data-change="settings-motion" ${g.save.settings.reduceMotion ? 'checked' : ''}> Reduzir animações da interface</label>`;
}

export function settings(g: Game): void {
  open(g, { title: 'Configurações', body: `<div class="settings">${settingsBody(g)}</div>`, cls: 'small' });
}

export function refreshSettings(g: Game): void {
  const el = document.querySelector('.modal .settings');
  if (el) el.innerHTML = settingsBody(g);
}

export function howToHtml(): string {
  return `<ol class="howto">
    <li><b>Toque numa estação</b> (na loja ou nos botões logo abaixo dela) para ver capacidade, fila e o que fazer.</li>
    <li><b>Pedidos</b> chegam sozinhos. A barra de cada cliente mostra quanto tempo ainda falta.</li>
    <li><b>Observe as filas</b>: onde as poções se acumulam, alguma coisa limita a loja.</li>
    <li><b>Hipótese</b>: escolha a estação que você acha que limita a loja. A mentora confere com os dados.</li>
    <li><b>Fluxo</b> e <b>Melhorias</b> abrem quando fizer sentido usar. Toque no chão da loja para mover a sua bruxa.</li>
    <li><b>Pausa</b> a qualquer momento no botão de pausa. Abrir uma janela também pausa.</li>
  </ol>`;
}

export function tocHtml(): string {
  return `<p>A <b>Teoria das Restrições</b> (TOC), de Eliyahu Goldratt, diz que todo sistema tem pelo menos um elo mais fraco — a <b>restrição</b> — que limita o resultado de todo o resto.</p>
    <p>Na loja de poções, é a estação que não dá conta do que chega. Melhorar outras estações não aumenta as entregas; melhorar a restrição, sim.</p>
    <ol class="howto"><li><b>Identificar</b> a restrição.</li><li><b>Explorar</b>: tirar o máximo dela sem gastar.</li><li><b>Subordinar</b>: o resto da loja segue o ritmo dela.</li><li><b>Elevar</b>: investir para aumentar a capacidade dela.</li><li><b>Recomeçar</b>: a restrição pode mudar de lugar.</li></ol>`;
}

export function howTo(g: Game): void {
  open(g, { title: 'Como jogar', body: howToHtml(), cls: 'small sheet', footer: '<button class="primary" data-action="modal-close">Entendi</button>' });
}

export function whatIsToc(g: Game): void {
  open(g, { title: 'O que é a TOC?', body: tocHtml(), cls: 'small sheet', footer: '<button class="primary" data-action="modal-close">Entendi</button>' });
}

export function moreMenu(g: Game): void {
  const phase = g.phase!;
  const fs = document.fullscreenEnabled;
  open(g, {
    title: 'Mais',
    body: `<div class="menu-list grid2">
      <button data-action="open-objectives">${iconImg('star')} Objetivos</button>
      ${phase.hypothesisEnabled ? `<button class="primary" data-action="hypothesis">${iconImg('drum')} Registrar hipótese</button>` : ''}
      <button data-action="board-open">${iconImg('star')} Placar da turma</button>
      <button data-action="open-howto">${iconImg('scroll')} Como jogar</button>
      <button data-action="open-recipes">${iconImg('book')} Receitas</button>
      <button data-action="open-glossary">${iconImg('eye')} Glossário e 5 passos</button>
      ${fs ? `<button data-action="fullscreen">${iconImg('door')} Tela cheia</button>` : ''}
      <button data-action="open-settings">${iconImg('sound')} Som</button>
      <button data-action="restart">${iconImg('restart')} Reiniciar fase</button>
      <button data-action="exit">${iconImg('door')} Salvar e sair</button></div>`,
    cls: 'small sheet',
  });
}

export function gameMenu(g: Game): void {
  open(g, {
    title: 'Menu da partida',
    body: `<div class="menu-list">
      <button data-action="modal-close" class="primary">Continuar jogando</button>
      <button data-action="open-objectives">Ver objetivos</button>
      <button data-action="board-open">Placar da turma</button>
      <button data-action="open-glossary">Glossário e os cinco passos</button>
      <button data-action="open-settings">Configurações de som</button>
      ${document.fullscreenEnabled ? '<button data-action="fullscreen">Tela cheia</button>' : ''}
      <button data-action="restart">Reiniciar fase</button>
      <button data-action="exit">Salvar e voltar ao menu</button></div>`,
    cls: 'small',
  });
}

// ------------------------------------------------------------------ avaliação

export async function debrief(
  g: Game,
  won: boolean,
  reason: string | null,
  score: ScoreBreakdown,
  online?: Promise<'enviado' | 'pendente' | 'negado' | 'ignorado'>,
): Promise<void> {
  const s = g.sim!;
  const phase = g.phase!;
  const a = analyzeCapacity(s);
  const obj = evaluateAll(s, phase, g.tutorial?.done ?? false);
  const decisions = s.decisions
    .slice(-10)
    .map((d) => {
      const effect =
        d.deliveredAfter == null
          ? '<small class="muted">efeito ainda em observação</small>'
          : `<small>entregas em ${shopMinutes(60)}: ${d.deliveredBefore} antes → <b>${d.deliveredAfter}</b> depois${d.wipAfter != null ? ` · em processo: ${d.wipBefore} → ${d.wipAfter}` : ''}</small>`;
      const tag = d.onConstraint == null ? '' : d.onConstraint ? '<span class="chip good">na restrição</span>' : '<span class="chip">fora da restrição</span>';
      return `<li><time>${clock(d.t)}</time> ${esc(d.label)} ${tag}<br>${effect}</li>`;
    })
    .join('');
  const stars = [1, 2, 3].map((i) => `<span class="star ${i <= score.stars ? 'on' : ''}">${iconImg('star')}</span>`).join('');
  const constraintName = a.constraint === 'mercado' ? `nenhuma estação saturada (a mais carregada: ${STATIONS[a.ranked[0]].short}, ${pct(a.maxLoad)})` : `${STATIONS[a.constraint].short} (carga ${pct(a.maxLoad)})`;
  const q = phase.question;
  const turma = phase.mode === 'turma';
  const steps = turma ? fiveSteps(s, g.guide?.marks ?? null) : [];
  const firstC = (g.guide?.marks.initialConstraint && g.guide.marks.initialConstraint !== 'mercado' ? g.guide.marks.initialConstraint : a.ranked[0]) as StationId;
  const explanation = turma ? contextualReflection(s, firstC) : q.explanation;
  const STATUS = { feito: ['Feito', 'good'], parcial: ['Em parte', 'warn'], nao: ['Oportunidade', 'idle'] } as const;
  const stepsHtml = steps
    .map(
      (st) => `<details class="step" ${st.status !== 'feito' ? 'open' : ''}><summary><span class="sn">${st.n}</span><b>${esc(st.title)}</b><span class="chip ${STATUS[st.status][1]}">${STATUS[st.status][0]}</span></summary>
      <p><b>Sua decisão:</b> ${esc(st.decision)}</p>
      <ul class="list">${st.indicators.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <p><b>Resultado:</b> ${esc(st.result)}</p>
      <p class="toc-note">${esc(st.toc)}</p></details>`,
    )
    .join('');
  const next = g.nextPhaseId();
  const body = `
    <div class="result ${won ? 'win' : 'lose'}"><h3>${won ? 'Fase concluída!' : 'Fase não concluída'}</h3>${won ? `<div class="stars">${stars}</div>` : `<p>${esc(reason || '')}</p>`}</div>
    <p><b>Objetivo:</b> ${esc(phase.goalText)}</p>
    <ul class="objectives">${obj.map((o) => `<li class="${o.done ? 'done' : 'fail'}">${iconImg(o.done ? 'check' : 'cross')} ${esc(o.objective.label)} <small>${esc(o.text)}</small></li>`).join('')}</ul>
    <div class="kv two">
      <div><span>Pedidos concluídos</span><b>${s.stats.ordersCompleted}</b></div>
      <div><span>Pedidos atrasados / cancelados</span><b>${Object.values(s.orders).filter((o) => o.late).length} / ${s.stats.ordersCanceled}</b></div>
      <div><span>Ganho econômico</span><b>${money(throughputGain(s))}</b></div>
      <div><span>Lucro líquido</span><b>${money(netProfit(s))}</b></div>
      <div><span>Estoque em processo médio</span><b>${n1(averageWip(s))}</b></div>
      <div><span>Utilização da restrição</span><b>${a.constraint !== 'mercado' ? pct(observedUtilization(s, a.constraint)) : pct(observedUtilization(s, a.ranked[0]))}</b></div>
      <div class="hl"><span>Restrição no fim do dia (pelos dados)</span><b>${esc(constraintName)}</b></div>
    </div>
    <h3>Pontuação: ${score.total}/100</h3>
    ${online ? '<p class="online-status" data-online-status>Enviando resultado ao placar da turma…</p>' : ''}
    <ul class="score">${score.parts.map((p) => `<li><span>${esc(p.label)}</span><i class="meter"><i style="width:${(p.points / p.max) * 100}%"></i></i><b>${Math.round(p.points)}/${p.max}</b><small>${esc(p.detail)}</small></li>`).join('')}</ul>
    <p class="muted small">A pontuação avalia o resultado da loja inteira. Manter todas as estações 100% ocupadas não dá pontos.</p>
    ${turma ? `<h3>Os cinco passos na sua partida</h3><p class="muted small">Toque em cada passo para ver a decisão, os números e a relação com a TOC.</p><div class="steps5">${stepsHtml}</div>` : ''}
    ${decisions && !turma ? `<h3>Suas decisões e consequências</h3><ul class="list decisions">${decisions}</ul>` : ''}
    <h3>Conceito</h3><p class="concept">${esc(phase.concept)}</p>
    <h3>Para refletir</h3>
    <div class="quiz" data-correct="${q.correct}"><p><b>${esc(q.question)}</b></p>
      ${q.options.map((o, i) => `<button class="row-btn" data-action="quiz" data-v="${i}">${esc(o)}</button>`).join('')}
      <div class="quiz-exp" hidden><p>${esc(explanation)}</p></div></div>`;
  const footer = `<button data-action="board-open">Placar</button><button data-action="exit">Menu</button><button data-action="retry">Jogar de novo</button>${won && next && phase.mode !== 'turma' ? '<button class="primary" data-action="next-phase">Próxima fase</button>' : ''}`;
  const { el: dEl, promise } = open(g, { title: `Avaliação — ${esc(phase.title)}`, body, footer, cls: 'wide debrief', closable: false });
  void online?.then((st) => {
    const box = dEl.querySelector('[data-online-status]');
    if (!box) return;
    if (st === 'ignorado') box.remove();
    else if (st === 'enviado') box.innerHTML = won ? '<b class="pos">Resultado enviado ao placar da turma.</b> Toque em Placar para ver sua posição.' : 'Resultado registrado. Só fases <b>vencidas</b> somam pontos no placar.';
    else if (st === 'negado') box.innerHTML = '<b class="neg">O placar ainda não foi liberado no Firebase.</b> O resultado ficou guardado e será enviado depois que as regras forem configuradas.';
    else box.innerHTML = '<b class="neg">Sem conexão:</b> o resultado ficou guardado e será enviado ao placar quando houver internet.';
  });
  await promise;
}

export function answerQuiz(g: Game, btn: HTMLElement): void {
  const quiz = btn.closest('.quiz') as HTMLElement;
  if (!quiz || quiz.dataset.answered) return;
  quiz.dataset.answered = '1';
  const correct = Number(quiz.dataset.correct);
  const chosen = Number(btn.dataset.v);
  quiz.querySelectorAll('[data-action="quiz"]').forEach((b, i) => {
    b.classList.add(i === correct ? 'right' : i === chosen ? 'wrong' : 'dim');
    (b as HTMLButtonElement).disabled = true;
  });
  const exp = quiz.querySelector('.quiz-exp') as HTMLElement;
  exp.hidden = false;
  exp.insertAdjacentHTML('afterbegin', `<p class="${chosen === correct ? 'pos' : 'neg'}"><b>${chosen === correct ? 'Isso mesmo!' : 'Não exatamente.'}</b></p>`);
  g.tutorial?.onEvent('answer', chosen === correct);
}

// ------------------------------------------------------------------ perguntas do tutorial

export function question(g: Game, title: string, text: string, options: string[], correct: number, explanation: string): Promise<boolean> {
  const { el, promise } = open<boolean>(g, {
    title,
    body: `<div class="quiz" data-correct="${correct}"><p><b>${esc(text)}</b></p>${options.map((o, i) => `<button class="row-btn" data-action="quiz" data-v="${i}">${esc(o)}</button>`).join('')}<div class="quiz-exp" hidden><p>${esc(explanation)}</p></div></div>`,
    footer: '<button class="primary" data-action="modal-close" disabled data-quiz-continue>Continuar</button>',
    closable: false,
  });
  el.querySelectorAll('[data-action="quiz"]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = el.querySelector('[data-quiz-continue]') as HTMLButtonElement;
      c.disabled = false;
      c.dataset.ok = String(Number((b as HTMLElement).dataset.v) === correct);
    }),
  );
  return promise.then(() => true);
}
