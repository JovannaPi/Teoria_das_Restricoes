// Ações do jogador. Toda interação da interface passa por aqui, para que as
// regras (custos, validações, registro de decisões) fiquem num só lugar.
import { INGREDIENTS } from '../data/recipes';
import { STATIONS } from '../data/stations';
import { UPGRADES } from '../data/upgrades';
import { analyzeCapacity } from './analysis';
import {
  acceptOrderInternal,
  addLog,
  deliveredBetween,
  orderIngredient,
  wipCount,
  resolveHypothesis,
} from './engine';
import { currentMods } from './mods';
import type { IngredientId, Policies, SimState, StationId, UpgradeId } from './types';

export interface ActionResult {
  ok: boolean;
  message: string;
}

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

export function recordDecision(s: SimState, kind: string, label: string, station?: StationId): void {
  let onConstraint: boolean | null = null;
  if (station) {
    const c = analyzeCapacity(s).constraint;
    onConstraint = c === station;
  }
  s.decisions.push({
    t: s.t,
    kind,
    label,
    station,
    deliveredBefore: deliveredBetween(s, s.t - 60, s.t),
    deliveredAfter: null,
    wipBefore: wipCount(s),
    wipAfter: null,
    onConstraint,
  });
  addLog(s, 'decisao', label);
}

export function acceptOrder(s: SimState, id: number): ActionResult {
  const o = s.orders[id];
  if (!o || o.status !== 'aguardando') return fail('Este pedido não está mais esperando.');
  acceptOrderInternal(s, o);
  addLog(s, 'info', `Pedido #${o.id} de ${o.client.name} aceito.`);
  return ok('Pedido aceito.');
}

export function rejectOrder(s: SimState, id: number): ActionResult {
  const o = s.orders[id];
  if (!o || o.status !== 'aguardando') return fail('Este pedido não está mais esperando.');
  o.status = 'recusado';
  o.closedAt = s.t;
  s.stats.ordersRefused++;
  s.reputation = Math.max(0, s.reputation - 1);
  s.notices.push({ type: 'order-closed', order: o.id, status: 'recusado' });
  addLog(s, 'info', `Pedido #${o.id} recusado com educação.`);
  return ok('Pedido recusado.');
}

export function buyIngredient(s: SimState, ing: IngredientId, qty: number): ActionResult {
  const mods = currentMods(s);
  const price = INGREDIENTS[ing].unitCost * qty * (mods.priceMult[ing] || 1);
  if (s.cash < price) return fail('Dinheiro insuficiente para esta compra.');
  orderIngredient(s, ing, qty, mods);
  addLog(s, 'info', `Encomendou ${qty}× ${INGREDIENTS[ing].name} (${price.toFixed(0)} moedas, pagas na entrega).`);
  return ok(`Encomenda de ${INGREDIENTS[ing].name} feita.`);
}

const POLICY_LABEL: Record<string, (v: unknown, st?: StationId) => string> = {
  release: (v) => (v === 'corda' ? 'Liberação sincronizada pela corda (tambor-pulmão-corda)' : 'Liberação contínua (empurrar tudo)'),
  drum: (v) => `Tambor amarrado à estação ${STATIONS[v as StationId].short}`,
  bufferSize: (v) => `Pulmão do tambor ajustado para ${v} poções`,
  priority: (v) =>
    v === 'ganho'
      ? 'Prioridade: maior ganho por minuto do tambor'
      : v === 'prazo'
        ? 'Prioridade: prazo mais próximo'
        : 'Prioridade: ordem de chegada',
  inspection: (v) => (v === 'entrada' ? 'Inspeção de ingredientes antes do caldeirão' : 'Inspeção apenas no final'),
  keepBusy: (v) => (v ? 'Aprendizes produzem antecipadamente para não ficarem parados' : 'Aprendizes só produzem o que foi liberado'),
  autoAccept: (v) => (v ? 'Aceitar pedidos automaticamente' : 'Aceitar pedidos manualmente'),
  autoReorder: (v) => (v ? 'Reposição automática de ingredientes ligada' : 'Reposição automática de ingredientes desligada'),
};

export function setPolicy<K extends 'release' | 'drum' | 'bufferSize' | 'priority' | 'inspection' | 'keepBusy' | 'autoAccept' | 'autoReorder'>(
  s: SimState,
  key: K,
  value: Policies[K],
): ActionResult {
  if (s.policies[key] === value) return ok('Nada mudou.');
  if (key === 'bufferSize') {
    const v = Math.max(1, Math.min(20, Number(value)));
    (s.policies as Policies).bufferSize = v;
  } else {
    (s.policies as Policies)[key] = value;
  }
  const label = POLICY_LABEL[key](s.policies[key]);
  const station = key === 'drum' ? (value as StationId) : undefined;
  recordDecision(s, key, label, station);
  // pedidos que já esperavam no balcão são aceitos quando o automático é ligado
  if (key === 'autoAccept' && value) {
    for (const k in s.orders) if (s.orders[k].status === 'aguardando') acceptOrderInternal(s, s.orders[k]);
  }
  return ok(label);
}

export function setStationPolicy(s: SimState, kind: 'setupExternal' | 'breakCover', station: StationId, on: boolean): ActionResult {
  const st = s.stations[station];
  if (kind === 'setupExternal' && st.setupTime <= 0) return fail('Esta estação não perde tempo com preparação de lote.');
  if (kind === 'breakCover' && st.breakEvery <= 0) return fail('Esta estação não tem intervalos programados.');
  if (!!s.policies[kind][station] === on) return ok('Nada mudou.');
  s.policies[kind][station] = on;
  const label =
    kind === 'setupExternal'
      ? `${on ? 'Limpeza feita em paralelo' : 'Limpeza volta a ser feita com a estação parada'} — ${STATIONS[station].short}`
      : `${on ? 'Intervalos cobertos por revezamento' : 'Intervalos sem cobertura'} — ${STATIONS[station].short}`;
  recordDecision(s, kind, label, station);
  return ok(label);
}

export function setHelper(s: SimState, station: StationId | null): ActionResult {
  if (s.helper === station) return ok('Nada mudou.');
  s.helper = station;
  if (station) recordDecision(s, 'helper', `Lina passou a ajudar na estação ${STATIONS[station].short}`, station);
  return ok(station ? `Lina está ajudando: ${STATIONS[station].short} 20% mais rápida.` : 'Lina parou de ajudar.');
}

export function toggleStationPause(s: SimState, station: StationId): ActionResult {
  const st = s.stations[station];
  st.paused = !st.paused;
  recordDecision(s, 'pause', `${st.paused ? 'Interrompeu' : 'Retomou'} a estação ${STATIONS[station].short}`, station);
  return ok(st.paused ? 'Estação interrompida: não inicia nem avança tarefas.' : 'Estação retomada.');
}

export function prioritizeJob(s: SimState, jobId: number): ActionResult {
  const j = s.jobs[jobId];
  if (!j || j.location !== 'fila' || !j.station) return fail('Esta poção não está esperando em uma fila.');
  const q = s.stations[j.station].queue;
  const i = q.indexOf(jobId);
  if (i < 0) return fail('Poção não encontrada na fila.');
  q.splice(i, 1);
  q.unshift(jobId);
  j.boosted = true;
  return ok('Poção movida para o começo da fila.');
}

export function canBuyUpgrade(s: SimState, id: UpgradeId): ActionResult {
  const u = UPGRADES[id];
  if (!s.upgradesAvailable.includes(id)) return fail('Melhoria indisponível nesta fase.');
  if (s.upgradesOwned.some((x) => x.id === id)) return fail('Melhoria já adquirida.');
  if (s.upgradesNeedHypothesis && !s.hypotheses.some((h) => h.correct))
    return fail('Antes de investir, identifique a restrição: registre e confirme sua hipótese.');
  if (s.cash < u.price) return fail('Dinheiro insuficiente.');
  return ok('');
}

export function buyUpgrade(s: SimState, id: UpgradeId): ActionResult {
  const check = canBuyUpgrade(s, id);
  if (!check.ok) return check;
  const u = UPGRADES[id];
  s.cash -= u.price;
  s.acct.equipment += u.price;
  s.upgradesOwned.push({ id, activeAt: s.t + u.installTime, applied: false });
  const st = s.stations[u.station];
  st.installing = { upgrade: id, until: s.t + u.installTime };
  if (u.stopsStation) {
    st.downUntil = Math.max(st.downUntil, s.t + u.installTime);
    st.downReason = 'instalação';
  }
  recordDecision(s, 'upgrade', `Investiu em ${u.name} (${u.price} moedas)`, u.station);
  return ok(`${u.name}: instalação em andamento.`);
}

export function registerHypothesis(s: SimState, station: StationId | 'mercado', verifyDelay = 20): ActionResult {
  if (s.hypotheses.some((h) => h.correct == null)) return fail('Já existe uma hipótese em verificação.');
  const h = { t: s.t, station, resolveAt: s.t + verifyDelay, correct: null, truth: null, evidence: [] };
  s.hypotheses.push(h);
  addLog(s, 'decisao', `Hipótese registrada: ${station === 'mercado' ? 'a demanda' : STATIONS[station].short} limita a loja. Verificando…`);
  if (verifyDelay <= 0) resolveHypothesis(s, h);
  return ok('Hipótese registrada. A mentora vai conferir os dados.');
}

export function chooseCrystal(s: SimState, station: StationId): ActionResult {
  const id = s.pendingCrystal;
  if (id == null) return fail('Não há cristal esperando.');
  const ev = s.events.find((e) => e.id === id);
  s.pendingCrystal = null;
  if (!ev) return fail('O cristal se apagou antes de ser usado.');
  ev.station = station;
  recordDecision(s, 'cristal', `Usou o cristal de aceleração na estação ${STATIONS[station].short}`, station);
  return ok(`Cristal brilhando na estação ${STATIONS[station].short}.`);
}
