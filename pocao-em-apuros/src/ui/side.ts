// Painel lateral contextual. Cada vista é recalculada a partir do estado real da simulação.
import { INGREDIENTS, RECIPES, unitThroughput } from '../data/recipes';
import { POLICY_COSTS, STATION_ORDER, STATIONS } from '../data/stations';
import { UPGRADE_ORDER, UPGRADES } from '../data/upgrades';
import type { Game } from '../game/game';
import { flaskUrl, iconImg } from '../render/sprites';
import { analyzeCapacity, averageQueue, observedUtilization, recentUtilization } from '../sim/analysis';
import { canBuyUpgrade } from '../sim/actions';
import { applyUpgradeEffect, inbound, ingredientsInUse, orderNeeds, ropeCount, shelfCount } from '../sim/engine';
import { currentMods } from '../sim/mods';
import type { Order, SimState, StationId, UpgradeId } from '../sim/types';
import { clock, esc, money, n1, pct, shopMinutes, STATION_COLORS } from './dom';

export type SideView = 'estacao' | 'pedidos' | 'despensa' | 'fluxo' | 'melhorias';

let lastHtml = '';

export function renderSide(g: Game, force: boolean): void {
  const root = document.getElementById('side');
  if (!root || !g.sim) return;
  let body = '';
  switch (g.side) {
    case 'estacao':
      body = g.selected ? stationView(g, g.selected) : emptyView(g);
      break;
    case 'pedidos':
      body = ordersView(g);
      break;
    case 'despensa':
      body = pantryView(g);
      break;
    case 'fluxo':
      body = flowView(g);
      break;
    case 'melhorias':
      body = upgradesView(g);
      break;
  }
  const tabs = (['estacao', 'pedidos', 'despensa', 'fluxo', 'melhorias'] as SideView[])
    .map(
      (v) =>
        `<button role="tab" aria-selected="${g.side === v}" class="${g.side === v ? 'on' : ''}" data-action="side" data-v="${v}">${{ estacao: 'Estação', pedidos: 'Pedidos', despensa: 'Despensa', fluxo: 'Fluxo', melhorias: 'Melhorias' }[v]}</button>`,
    )
    .join('');
  const html = `<div class="side-tabs" role="tablist">${tabs}<button class="side-x" data-action="close-side" aria-label="Fechar painel">×</button></div><div class="side-body">${body}</div>`;
  if (!force && html === lastHtml) return;
  lastHtml = html;
  const scroll = root.querySelector('.side-body')?.scrollTop ?? 0;
  root.innerHTML = html;
  const sb = root.querySelector('.side-body');
  if (sb) sb.scrollTop = scroll;
}

function lockNote(g: Game, k: string): string {
  return g.policyLocked(k as never) ? `<span class="lock" title="Disponível em outra fase">${iconImg('lock')}</span>` : '';
}

function lensVisible(g: Game): boolean {
  const s = g.sim!;
  return !!g.phase?.showLoadLens || s.hypotheses.some((h) => h.correct);
}

function emptyView(g: Game): string {
  const s = g.sim!;
  return `<h2>Oficina</h2>
  <p class="muted">Clique numa estação da loja para ver sua capacidade, sua fila e as decisões disponíveis.</p>
  <div class="station-list">${STATION_ORDER.filter((id) => !s.stations[id].locked)
    .map(
      (id) =>
        `<button class="row-btn" data-action="select-station" data-v="${id}"><i class="dot" style="background:${STATION_COLORS[id]}"></i>${esc(STATIONS[id].name)}<span>fila ${s.stations[id].queue.length}</span></button>`,
    )
    .join('')}</div>
  <p class="muted small">Dica: clique no chão para mover a Lina. Espaço pausa; 1, 2 e 4 mudam a velocidade; A abre a Análise.</p>`;
}

function stationState(s: SimState, id: StationId): { label: string; cls: string } {
  const st = s.stations[id];
  if (st.locked) return { label: 'Indisponível', cls: 'off' };
  if (st.installing) return { label: 'Instalando melhoria', cls: 'warn' };
  if (st.paused) return { label: 'Interrompida', cls: 'bad' };
  if (s.t < st.downUntil) return { label: st.downReason === 'instalação' ? 'Parada para instalação' : 'Em manutenção', cls: 'bad' };
  if (s.t < st.breakUntil) return { label: 'Equipe em intervalo', cls: 'warn' };
  if (st.active.length > 0) return { label: 'Em produção', cls: 'good' };
  return { label: st.queue.length ? 'Pronta para começar' : 'Ociosa (sem trabalho)', cls: 'idle' };
}

function stationView(g: Game, id: StationId): string {
  const s = g.sim!;
  const st = s.stations[id];
  const def = STATIONS[id];
  const a = analyzeCapacity(s);
  const L = a.loads[id];
  const state = stationState(s, id);
  const t = Math.max(1, s.t);
  const tot = st.slots * t;
  const busyPct = Math.min(1, (st.busyTime - st.setupSpent) / tot);
  const setupPct = Math.min(1, st.setupSpent / tot);
  const starvedPct = Math.min(1, st.starvedTime / tot);
  const stoppedPct = Math.min(1, st.stoppedTime / tot);
  const caps = s.recipes
    .filter((r) => L.capacityPerMin[r] != null)
    .map((r) => `<li><img src="${flaskUrl(RECIPES[r].color)}" alt=""> ${esc(RECIPES[r].short)}: <b>${n1(L.capacityPerMin[r]!)}</b>/min <span class="muted">(${n1(L.effTime[r]!)} s cada)</span></li>`)
    .join('');
  const queue = st.queue.slice(0, 10).map((jid, i) => {
    const j = s.jobs[jid];
    if (!j) return '';
    const o = j.orderId != null ? s.orders[j.orderId] : null;
    const due = o ? o.dueAt - s.t : null;
    const tag = o ? `#${o.id} · ${due! < 0 ? '<b class="neg">atrasado</b>' : 'prazo ' + shopMinutes(due!)}` : j.speculative ? '<span class="muted">antecipada (sem pedido)</span>' : '<span class="muted">sem pedido</span>';
    return `<li><img src="${flaskUrl(RECIPES[j.recipe].color)}" alt=""> ${esc(RECIPES[j.recipe].short)} <small>${tag}${j.spoiled ? ' · <b class="neg">murcha</b>' : ''}</small>${i > 0 ? `<button class="mini" data-action="prioritize" data-v="${jid}" title="Mover para o começo da fila">Priorizar</button>` : ''}</li>`;
  });
  const active = st.active
    .map((task) => {
      const j = s.jobs[task.job];
      if (!j) return '';
      const prog = task.setupLeft > 0 ? 0 : 1 - Math.max(0, task.remaining) / task.total;
      return `<li><img src="${flaskUrl(RECIPES[j.recipe].color)}" alt=""> ${esc(RECIPES[j.recipe].short)} <i class="meter"><i style="width:${(prog * 100).toFixed(0)}%"></i></i> ${task.setupLeft > 0 ? '<small>limpando…</small>' : ''}</li>`;
    })
    .join('');
  const helperHere = s.helper === id;
  const linaWalking = !g.scene.lina.arrived;
  const isDrum = s.policies.drum === id;
  const upgradesHere = s.upgradesAvailable.filter((u) => UPGRADES[u].station === id);
  const showLoad = lensVisible(g);
  const policyCost = (c: number) => `${(c * 30).toFixed(1)} moedas/h`;
  return `
  <div class="st-head"><i class="dot" style="background:${STATION_COLORS[id]}"></i><h2>${esc(def.name)}</h2><span class="chip ${state.cls}">${state.label}</span></div>
  <p class="muted">${esc(def.description)}</p>
  <div class="kv">
    <div><span>Postos de trabalho</span><b>${st.slots}</b></div>
    <div><span>Velocidade</span><b>${pct(L.speed)}</b></div>
    <div><span>Limpeza por lote</span><b>${st.setupTime ? `${st.setupTime} s${s.policies.setupExternal[id] ? ' (em paralelo)' : ''}` : '—'}</b></div>
    <div><span>Intervalos</span><b>${st.breakEvery ? `${st.breakDuration} s a cada ${st.breakEvery} s${s.policies.breakCover[id] ? ' (cobertos)' : ''}` : '—'}</b></div>
    <div><span>Utilização (dia / últimos 60 s)</span><b>${pct(observedUtilization(s, id))} / ${pct(recentUtilization(s, id))}</b></div>
    <div><span>Fila agora / média / máxima</span><b>${st.queue.length} / ${n1(averageQueue(s, id))} / ${st.maxQueue}</b></div>
    <div><span>Poções processadas</span><b>${st.processed}</b></div>
    <div><span>Custo de operação</span><b>${(st.costPerSec * 30).toFixed(1)} moedas/h</b></div>
    ${showLoad ? `<div class="hl"><span>Carga exigida pela demanda</span><b class="${L.load > 1 ? 'neg' : ''}">${pct(L.load)}</b></div>` : ''}
  </div>
  <h3>Para onde vai o tempo</h3>
  <div class="timebar" role="img" aria-label="Produzindo ${pct(busyPct)}, limpando ${pct(setupPct)}, sem trabalho ${pct(starvedPct)}, parada ${pct(stoppedPct)}">
    <i class="tb-busy" style="width:${busyPct * 100}%"></i><i class="tb-setup" style="width:${setupPct * 100}%"></i><i class="tb-starved" style="width:${starvedPct * 100}%"></i><i class="tb-stop" style="width:${stoppedPct * 100}%"></i>
  </div>
  <div class="legend small"><span><i class="tb-busy"></i>produzindo ${pct(busyPct)}</span><span><i class="tb-setup"></i>limpando ${pct(setupPct)}</span><span><i class="tb-starved"></i>sem trabalho ${pct(starvedPct)}</span><span><i class="tb-stop"></i>parada ${pct(stoppedPct)}</span></div>
  <h3>Capacidade por receita</h3>
  <ul class="list">${caps || '<li class="muted">Nenhuma receita passa por aqui.</li>'}</ul>
  <h3>Em produção (${st.active.length}/${st.slots})</h3>
  <ul class="list">${active || '<li class="muted">Nada sendo feito agora.</li>'}</ul>
  <h3>Fila de entrada (${st.queue.length})</h3>
  <ul class="list queue">${queue.join('') || '<li class="muted">Fila vazia.</li>'}${st.queue.length > 10 ? `<li class="muted">… e mais ${st.queue.length - 10}</li>` : ''}</ul>
  <h3>Decisões</h3>
  <div class="actions">
    <button data-action="toggle-station" data-v="${id}" class="${st.paused ? 'primary' : ''}">${st.paused ? 'Retomar estação' : 'Interromper estação'}</button>
    ${helperHere ? `<button data-action="stop-help">Lina parar de ajudar</button>` : `<button data-action="help-here" data-v="${id}" ${linaWalking ? 'disabled' : ''} title="A Lina caminha até aqui e a estação fica ${Math.round((POLICY_COSTS.helperBonus - 1) * 100)}% mais rápida">Lina ajuda aqui</button>`}
    ${st.setupTime > 0 ? `<button data-action="station-policy" data-k="setupExternal" data-v="${id}" data-on="${!s.policies.setupExternal[id]}" ${g.policyLocked('setupExternal') ? 'disabled' : ''}>${lockNote(g, 'setupExternal')}${s.policies.setupExternal[id] ? 'Voltar a limpar com a estação parada' : `Limpeza em paralelo (+${policyCost(POLICY_COSTS.setupExternal)})`}</button>` : ''}
    ${st.breakEvery > 0 ? `<button data-action="station-policy" data-k="breakCover" data-v="${id}" data-on="${!s.policies.breakCover[id]}" ${g.policyLocked('breakCover') ? 'disabled' : ''}>${lockNote(g, 'breakCover')}${s.policies.breakCover[id] ? 'Deixar de cobrir intervalos' : `Cobrir intervalos (+${policyCost(POLICY_COSTS.breakCover)})`}</button>` : ''}
    ${id !== 'balcao' ? `<button data-action="drum-here" data-v="${id}" ${isDrum || g.policyLocked('drum') ? 'disabled' : ''}>${lockNote(g, 'drum')}${isDrum ? 'A corda está amarrada aqui (tambor)' : 'Amarrar a corda aqui (tambor)'}</button>` : ''}
    ${g.phase!.hypothesisEnabled ? `<button class="primary" data-action="hypothesis" data-v="${id}">Registrar hipótese: esta estação limita a loja</button>` : ''}
    ${upgradesHere.length ? `<button data-action="side" data-v="melhorias">Ver melhorias desta estação (${upgradesHere.length})</button>` : ''}
  </div>`;
}

function orderCard(s: SimState, o: Order, selected: boolean): string {
  const lines = o.lines
    .map((l) => {
      const inSys = Object.values(s.jobs).filter((j) => j.orderId === o.id && j.recipe === l.recipe && j.location !== 'prateleira').length;
      return `<li><img src="${flaskUrl(RECIPES[l.recipe].color)}" alt=""> ${l.qty}× ${esc(RECIPES[l.recipe].short)} <small>${l.delivered}/${l.qty} entregues${o.status === 'aceito' ? ` · ${inSys} em produção` : ''}</small></li>`;
    })
    .join('');
  const value = o.lines.reduce((a, l) => a + RECIPES[l.recipe].price * l.qty * o.priceMult, 0);
  const gain = o.lines.reduce((a, l) => a + (RECIPES[l.recipe].price * o.priceMult - (RECIPES[l.recipe].price - unitThroughput(l.recipe))) * l.qty, 0);
  let timing = '';
  if (o.status === 'aguardando') timing = `espera mais ${shopMinutes(Math.max(0, o.acceptBy - s.t))}`;
  else {
    const left = o.dueAt - s.t;
    timing = left >= 0 ? `prazo: ${clock(o.dueAt)} (faltam ${shopMinutes(left)})` : `<b class="neg">atrasado ${shopMinutes(-left)}</b> — desiste às ${clock(o.dueAt + s.graceTime)}`;
  }
  return `<div class="order ${selected ? 'sel' : ''} ${o.vip ? 'vip' : ''}">
    <div class="order-h"><b>#${o.id} ${esc(o.client.name)}</b>${o.vip ? '<span class="chip warn">urgente ×2</span>' : ''}<span class="muted">${timing}</span></div>
    <ul class="list">${lines}</ul>
    <div class="order-f"><span>Valor ${money(value)} · ganho ${money(gain)}</span>
    ${o.status === 'aguardando' ? `<span><button class="primary mini" data-action="accept" data-v="${o.id}">Aceitar</button><button class="mini" data-action="reject" data-v="${o.id}">Recusar</button></span>` : ''}</div>
  </div>`;
}

function ordersView(g: Game): string {
  const s = g.sim!;
  const all = Object.values(s.orders);
  const waiting = all.filter((o) => o.status === 'aguardando').sort((a, b) => a.arrivedAt - b.arrivedAt);
  const active = all.filter((o) => o.status === 'aceito').sort((a, b) => a.dueAt - b.dueAt);
  const shelf = s.recipes.map((r) => ({ r, n: shelfCount(s, r) })).filter((x) => x.n > 0);
  return `<h2>Pedidos</h2>
  <label class="toggle"><input type="checkbox" data-change="policy-check" data-k="autoAccept" ${s.policies.autoAccept ? 'checked' : ''}> Aceitar pedidos automaticamente</label>
  <p class="muted small">Recusar um pedido é uma decisão de mix: quando a restrição está sobrecarregada, aceitar tudo gera atrasos e cancelamentos.</p>
  <div class="kv compact">
    <div><span>Concluídos</span><b>${s.stats.ordersCompleted}</b></div>
    <div><span>Entregas atrasadas</span><b>${s.stats.deliveredLate}</b></div>
    <div><span>Cancelados</span><b class="${s.stats.ordersCanceled ? 'neg' : ''}">${s.stats.ordersCanceled}</b></div>
    <div><span>Desistiram/recusados</span><b>${s.stats.ordersExpired + s.stats.ordersRefused}</b></div>
  </div>
  ${shelf.length ? `<p class="small">Prateleira de pronta-entrega: ${shelf.map((x) => `${x.n}× ${RECIPES[x.r].short}`).join(', ')}</p>` : ''}
  <h3>Esperando no balcão (${waiting.length})</h3>
  ${waiting.map((o) => orderCard(s, o, g.selectedOrder === o.id)).join('') || '<p class="muted">Ninguém esperando.</p>'}
  <h3>Em produção (${active.length}) — por prazo</h3>
  ${active.map((o) => orderCard(s, o, g.selectedOrder === o.id)).join('') || '<p class="muted">Nenhum pedido em andamento.</p>'}`;
}

function pantryView(g: Game): string {
  const s = g.sim!;
  const mods = currentMods(s);
  const rows = ingredientsInUse(s)
    .map((i) => {
      const d = INGREDIENTS[i];
      const price = d.unitCost * (mods.priceMult[i] || 1);
      const low = s.stock[i] < d.reorderPoint;
      return `<tr><td>${esc(d.name)}</td><td class="${low ? 'neg' : ''}">${s.stock[i]}</td><td>${inbound(s, i) || ''}</td><td>${n1(price)}${mods.priceMult[i] ? ' <span class="chip good">promo</span>' : ''}</td>
      <td><button class="mini" data-action="buy" data-v="${i}" data-q="5">+5</button><button class="mini" data-action="buy" data-v="${i}" data-q="10">+10</button></td></tr>`;
    })
    .join('');
  const lead = s.supplierLeadTime * mods.leadMult;
  const stockValue = Object.values(s.stockValue).reduce((a, b) => a + b, 0);
  return `<h2>Despensa</h2>
  <p class="muted">A comerciante Madame Trufa entrega em ${shopMinutes(lead)}${mods.leadMult > 1 ? ' <b class="neg">(atrasada pela tempestade)</b>' : ''}. O pagamento é feito na entrega.</p>
  <label class="toggle"><input type="checkbox" data-change="policy-check" data-k="autoReorder" ${s.policies.autoReorder ? 'checked' : ''}> Reposição automática (pede quando o estoque fica abaixo do ponto de reposição)</label>
  <table class="tbl"><thead><tr><th>Ingrediente</th><th>Estoque</th><th>A caminho</th><th>Preço</th><th>Encomendar</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="small">Valor parado em ingredientes (investimento): <b>${money(stockValue)}</b> moedas. Estoque demais também é dinheiro imobilizado.</p>
  ${s.stats.starvedForIngredients > 0 ? `<p class="small neg">Pedidos esperaram por falta de ingredientes durante ${shopMinutes(s.stats.starvedForIngredients)}.</p>` : ''}`;
}

function radio(g: Game, k: string, current: string, options: [string, string, string][]): string {
  const locked = g.policyLocked(k as never);
  return `<div class="radio ${locked ? 'locked' : ''}" role="radiogroup">${options
    .map(
      ([v, label, help]) =>
        `<button role="radio" aria-checked="${current === v}" class="${current === v ? 'on' : ''}" data-action="policy" data-k="${k}" data-v="${v}" ${locked ? 'disabled' : ''}><b>${label}</b><small>${help}</small></button>`,
    )
    .join('')}</div>`;
}

function flowView(g: Game): string {
  const s = g.sim!;
  const p = s.policies;
  const drumOpts = STATION_ORDER.filter((id) => id !== 'balcao' && !s.stations[id].locked)
    .map((id) => `<option value="${id}" ${p.drum === id ? 'selected' : ''}>${esc(STATIONS[id].short)}</option>`)
    .join('');
  const rope = ropeCount(s);
  return `<h2>Fluxo da loja</h2>
  <p class="muted small">Como o trabalho entra na loja e em que ordem as estações atendem as filas.</p>
  <h3>Liberação de trabalho ${lockNote(g, 'release')}</h3>
  ${radio(g, 'release', p.release, [
    ['empurrar', 'Contínua (empurrar)', 'Todo pedido aceito vai direto para a bancada.'],
    ['corda', 'Pela corda (tambor-pulmão-corda)', 'Só libera poção nova quando o pulmão do tambor tem espaço.'],
  ])}
  <div class="flow-row ${g.policyLocked('drum') ? 'locked' : ''}"><label>Tambor (quem dita o ritmo) ${lockNote(g, 'drum')}</label>
    <select data-change="drum-select" ${g.policyLocked('drum') ? 'disabled' : ''} aria-label="Estação tambor">${drumOpts}</select></div>
  <div class="flow-row ${g.policyLocked('bufferSize') ? 'locked' : ''}"><label>Pulmão do tambor ${lockNote(g, 'bufferSize')}</label>
    <span class="stepper"><button class="mini" data-action="buffer-step" data-d="-1" ${g.policyLocked('bufferSize') ? 'disabled' : ''} aria-label="Diminuir pulmão">−</button><b>${p.bufferSize}</b><button class="mini" data-action="buffer-step" data-d="1" ${g.policyLocked('bufferSize') ? 'disabled' : ''} aria-label="Aumentar pulmão">+</button></span></div>
  <p class="small">Na corda agora: <b>${rope}</b> poção(ões) liberada(s) antes ou dentro do tambor${p.release === 'corda' ? ` (limite ${p.bufferSize})` : ''}.</p>
  <h3>Prioridade nas filas ${lockNote(g, 'priority')}</h3>
  ${radio(g, 'priority', p.priority, [
    ['fifo', 'Ordem de chegada', 'Quem chegou primeiro é atendido primeiro.'],
    ['prazo', 'Prazo mais próximo', 'Atende primeiro o pedido que vence antes.'],
    ['ganho', 'Maior ganho por minuto do tambor', 'Usa o tempo do tambor nas poções que mais rendem por minuto dele.'],
  ])}
  <h3>Inspeção de qualidade ${lockNote(g, 'inspection')}</h3>
  ${radio(g, 'inspection', p.inspection, [
    ['final', 'Só no final', 'Defeitos aparecem no resfriamento, depois de usar o caldeirão.'],
    ['entrada', 'Antes do caldeirão', `Ingredientes ruins são descartados no preparo (+${POLICY_COSTS.inspectionEntryExtra} s por poção na bancada).`],
  ])}
  <h3>Aprendizes ociosos ${lockNote(g, 'keepBusy')}</h3>
  ${radio(g, 'keepBusy', String(p.keepBusy), [
    ['true', 'Manter todos ocupados', 'Quando a bancada fica sem trabalho, adianta poções sem pedido.'],
    ['false', 'Produzir só o que foi liberado', 'A bancada pode ficar parada esperando a corda.'],
  ])}`;
}

/** Estimativa do efeito de uma melhoria: aplica numa cópia e recalcula a capacidade do sistema. */
export function estimateUpgrade(s: SimState, id: UpgradeId) {
  const before = analyzeCapacity(s);
  const copy = JSON.parse(JSON.stringify(s)) as SimState;
  applyUpgradeEffect(copy, id);
  const after = analyzeCapacity(copy);
  return { before, after };
}

function upgradesView(g: Game): string {
  const s = g.sim!;
  if (!s.upgradesAvailable.length) {
    return `<h2>Melhorias</h2><p class="muted">Nesta fase não há investimentos disponíveis. ${g.phase!.number === 2 ? 'Antes de comprar, aproveite melhor o que você já tem.' : ''}</p>`;
  }
  const needHyp = s.upgradesNeedHypothesis && !s.hypotheses.some((h) => h.correct);
  const showEst = lensVisible(g);
  const items = UPGRADE_ORDER.filter((u) => s.upgradesAvailable.includes(u))
    .map((id) => {
      const u = UPGRADES[id];
      const owned = s.upgradesOwned.find((o) => o.id === id);
      const can = canBuyUpgrade(s, id);
      let est = '';
      if (showEst && !owned) {
        const e = estimateUpgrade(s, id);
        const capB = Math.min(e.before.demandPerMin, e.before.demandPerMin / Math.max(1e-6, e.before.maxLoad));
        const capA = Math.min(e.after.demandPerMin, e.after.demandPerMin / Math.max(1e-6, e.after.maxLoad));
        est = `<p class="small">Estimativa: a loja passaria de <b>${n1(capB)}</b> para <b>${n1(capA)}</b> poções/min (demanda atual ${n1(e.before.demandPerMin)}). Estação mais carregada depois: <b>${esc(STATIONS[e.after.ranked[0]].short)}</b> (${pct(e.after.maxLoad)}).</p>`;
      }
      const effect = [u.effect.slots ? `+${u.effect.slots} posto` : '', u.effect.speedMult ? `${Math.round((u.effect.speedMult - 1) * 100)}% mais rápida` : '']
        .filter(Boolean)
        .join(', ');
      const dep = u.price > 0 ? `${((u.price / u.lifeDays / 300) * 30).toFixed(1)} moedas/h de depreciação` : 'sem depreciação';
      return `<div class="upg ${owned ? 'owned' : ''}">
        <div class="upg-h"><b>${esc(u.name)}</b><span class="chip">${esc(STATIONS[u.station].short)}</span></div>
        <p class="small">${esc(u.description)}</p>
        <div class="kv compact"><div><span>Preço</span><b>${u.price}</b></div><div><span>Efeito</span><b>${effect}</b></div><div><span>Instalação</span><b>${shopMinutes(u.installTime)}${u.stopsStation ? ' (estação parada)' : ''}</b></div><div><span>Despesa extra</span><b>${(u.opCostPerSec * 30).toFixed(1)} moedas/h, ${dep}</b></div></div>
        ${est}
        ${owned ? `<span class="chip good">${owned.applied ? 'Instalada' : 'Instalando…'}</span>` : `<button class="primary" data-action="upgrade" data-v="${id}" ${!can.ok ? 'disabled' : ''} title="${esc(can.message)}">Investir</button>${!can.ok ? ` <small class="muted">${esc(can.message)}</small>` : ''}`}
      </div>`;
    })
    .join('');
  return `<h2>Melhorias</h2>
  ${needHyp ? '<p class="warnbox">Antes de investir, identifique a restrição: registre uma hipótese e espere a mentora conferir os dados.</p>' : ''}
  <p class="muted small">Investir aumenta a capacidade de uma estação. Só aumenta as entregas da loja se aquela estação for a restrição. Caixa atual: <b>${money(s.cash)}</b>.</p>
  ${!showEst ? '<p class="muted small">A estimativa de efeito aparece depois que a restrição for identificada.</p>' : ''}
  ${items}`;
}

export function orderNeedsCount(o: Order): number {
  return orderNeeds(o);
}
