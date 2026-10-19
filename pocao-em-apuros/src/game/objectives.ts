// Avaliação de objetivos, vitória/derrota e pontuação — tudo calculado a partir
// do estado real da simulação.
import type { Objective, PhaseDef } from '../data/phases';
import { averageWip, createSim, netProfit } from '../sim/engine';
import { analyzeCapacity } from '../sim/analysis';
import type { SimState } from '../sim/types';

export interface ObjectiveStatus {
  objective: Objective;
  value: number;
  done: boolean;
  text: string; // progresso legível
}

export function evaluateObjective(s: SimState, o: Objective, tutorialDone = false): ObjectiveStatus {
  switch (o.kind) {
    case 'hypothesis': {
      const v = s.hypotheses.filter((h) => h.correct === true).length;
      const pending = s.hypotheses.some((h) => h.correct == null);
      return { objective: o, value: v, done: v >= o.target, text: v >= o.target ? 'confirmada' : pending ? 'verificando…' : 'pendente' };
    }
    case 'delivered':
      return { objective: o, value: s.stats.delivered, done: s.stats.delivered >= o.target, text: `${s.stats.delivered}/${o.target}` };
    case 'netProfit': {
      const v = netProfit(s);
      return { objective: o, value: v, done: v >= o.target, text: `${Math.round(v)}/${o.target}` };
    }
    case 'avgWip': {
      const v = averageWip(s);
      return { objective: o, value: v, done: v <= o.target, text: `${v.toFixed(1)} (máx. ${o.target})` };
    }
    case 'reputation':
      return { objective: o, value: s.reputation, done: s.reputation >= o.target, text: `${Math.round(s.reputation)}` };
    case 'canceled':
      return {
        objective: o,
        value: s.stats.ordersCanceled,
        done: s.stats.ordersCanceled <= o.target,
        text: `${s.stats.ordersCanceled} (máx. ${o.target})`,
      };
    case 'cash':
      return { objective: o, value: s.cash, done: s.cash >= o.target, text: `${Math.round(s.cash)}/${o.target}` };
    case 'tutorial':
      return { objective: o, value: tutorialDone ? 1 : 0, done: tutorialDone, text: tutorialDone ? 'concluído' : 'em andamento' };
  }
}

export function evaluateAll(s: SimState, phase: PhaseDef, tutorialDone = false): ObjectiveStatus[] {
  return phase.objectives.map((o) => evaluateObjective(s, o, tutorialDone));
}

/** Derrota imediata (antes do fim do dia). */
export function immediateDefeat(s: SimState): string | null {
  if (s.reputation <= 0) return 'A reputação da loja chegou a zero: ninguém mais quer comprar aqui.';
  if (s.cash < -400) return 'O caixa ficou negativo demais: a loja faliu.';
  return null;
}

export interface ScoreBreakdown {
  total: number;
  stars: number;
  parts: { label: string; points: number; max: number; detail: string }[];
}

/**
 * Pontuação com critérios explícitos. Não premia utilização de 100% das estações:
 * avalia o resultado global, o atendimento, o controle do estoque em processo e
 * a qualidade das decisões (se foram tomadas sobre a restrição).
 */
export function computeScore(s: SimState, phase: PhaseDef, won: boolean): ScoreBreakdown {
  const parts: ScoreBreakdown['parts'] = [];
  const np = netProfit(s);
  if (phase.mode === 'turma') {
    // modo rápido: o resultado global é o que o jogo mostra o tempo todo — quanto a loja passou a
    // conseguir entregar por minuto, do começo do dia (só a restrição inicial) até o fim
    const start = analyzeCapacity(createSim(phase.scenario)).systemCapacityPerMin;
    const end = analyzeCapacity(s).systemCapacityPerMin;
    const best = analyzeCapacity(s).demandPerMin;
    const pCap = Math.max(0, Math.min(40, ((end - start) / Math.max(0.1, best - start)) * 40));
    parts.push({ label: 'Entregas por minuto (começo → fim)', points: pCap, max: 40, detail: `${start.toFixed(1)} → ${end.toFixed(1)} (o máximo é tudo o que chega: ${best.toFixed(1)})` });
  } else {
    const pProfit = Math.max(0, Math.min(40, (np / phase.refProfit) * 40));
    parts.push({ label: 'Resultado global (lucro líquido)', points: pProfit, max: 40, detail: `${Math.round(np)} de referência ${phase.refProfit}` });
  }

  const accepted = s.stats.ordersCompleted + s.stats.ordersCanceled;
  const onTimeRatio = s.stats.delivered > 0 ? s.stats.deliveredOnTime / s.stats.delivered : 0;
  const cancelPenalty = accepted > 0 ? s.stats.ordersCanceled / accepted : 0;
  const pService = Math.max(0, Math.min(25, 25 * onTimeRatio - 25 * cancelPenalty));
  parts.push({
    label: 'Cumprimento de pedidos',
    points: pService,
    max: 25,
    detail: `${Math.round(onTimeRatio * 100)}% no prazo, ${s.stats.ordersCanceled} cancelados`,
  });

  const wip = averageWip(s);
  const pWip = Math.max(0, Math.min(15, 15 * Math.min(1, phase.refWip / Math.max(0.5, wip))));
  parts.push({ label: 'Controle do estoque em processo', points: pWip, max: 15, detail: `média de ${wip.toFixed(1)} poções (referência ${phase.refWip})` });

  const relevant = s.decisions.filter((d) => d.onConstraint != null && d.kind !== 'pause');
  const good = relevant.filter((d) => d.onConstraint).length;
  const correctHyp = s.hypotheses.filter((h) => h.correct).length;
  const wrongHyp = s.hypotheses.filter((h) => h.correct === false).length;
  let decisionRatio = relevant.length ? good / relevant.length : 0.6;
  if (phase.hypothesisEnabled) decisionRatio = 0.5 * decisionRatio + 0.5 * (correctHyp ? 1 / (1 + wrongHyp * 0.5) : 0);
  const pDec = 20 * Math.max(0, Math.min(1, decisionRatio));
  parts.push({
    label: 'Qualidade das decisões',
    points: pDec,
    max: 20,
    detail: `${good}/${relevant.length} decisões sobre a restrição${phase.hypothesisEnabled ? `, ${correctHyp} hipótese(s) certa(s), ${wrongHyp} errada(s)` : ''}`,
  });

  const total = Math.round(parts.reduce((a, p) => a + p.points, 0));
  const stars = !won ? 0 : total >= 80 ? 3 : total >= 60 ? 2 : 1;
  return { total, stars, parts };
}
