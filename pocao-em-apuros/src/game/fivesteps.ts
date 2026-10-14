// Relatório dos cinco passos da TOC a partir dos dados reais da partida.
// Nunca afirma que o jogador fez um passo que não fez: nesses casos, descreve a oportunidade.
import { STATIONS, STATION_ORDER } from '../data/stations';
import { UPGRADES } from '../data/upgrades';
import { analyzeCapacity, observedUtilization } from '../sim/analysis';
import { deliveredBetween } from '../sim/engine';
import type { DecisionRecord, SimState, StationId } from '../sim/types';
import type { TurmaMarks } from './turma';

export type StepStatus = 'feito' | 'parcial' | 'nao';

export interface StepReport {
  n: number;
  title: string;
  status: StepStatus;
  decision: string;
  indicators: string[];
  result: string;
  toc: string;
}

const name = (id: StationId | 'mercado' | null | undefined) => (!id ? '—' : id === 'mercado' ? 'a demanda' : STATIONS[id].short);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const perMin = (n: number, secs: number) => (secs > 0 ? (n / secs) * 60 : 0);
const fmt1 = (v: number) => v.toFixed(1).replace('.', ',');

/** Entregas por minuto de jogo numa janela (para comparar antes e depois de uma decisão). */
function rate(s: SimState, a: number, b: number): number {
  const lo = Math.max(0, a);
  const hi = Math.min(s.t, b);
  return perMin(deliveredBetween(s, lo, hi), hi - lo);
}

function wipAt(s: SimState, a: number, b: number): number {
  const ser = s.series;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < ser.t.length; i++) {
    if (ser.t[i] >= a && ser.t[i] <= b) {
      sum += ser.wip[i];
      n++;
    }
  }
  return n ? sum / n : 0;
}

function lostTime(s: SimState, id: StationId): number {
  const st = s.stations[id];
  const tot = st.slots * Math.max(1, s.t);
  return (st.starvedTime + st.stoppedTime + st.setupSpent) / tot;
}

const EXPLOIT = ['helper', 'setupExternal', 'breakCover', 'inspection', 'priority', 'bufferSize', 'cristal'];

export function fiveSteps(s: SimState, marks: TurmaMarks | null): StepReport[] {
  const a = analyzeCapacity(s);
  const first = marks?.initialConstraint ?? (s.hypotheses.find((h) => h.correct)?.truth || a.ranked[0]);
  const firstId = (first === 'mercado' ? a.ranked[0] : first) as StationId;
  const out: StepReport[] = [];
  const d = s.decisions;

  // 1. Identificar
  const hyps = s.hypotheses.filter((h) => h.correct != null);
  const firstOk = hyps.find((h) => h.correct);
  const wrong = firstOk ? hyps.filter((h) => h.t < firstOk.t).length : hyps.length;
  const util = observedUtilization(s, firstId);
  out.push({
    n: 1,
    title: 'Identificar a restrição',
    status: firstOk ? (wrong ? 'parcial' : 'feito') : 'nao',
    decision: firstOk
      ? `Você apontou ${name(firstOk.station)}${wrong ? ` depois de ${wrong} palpite(s) errado(s)` : ' de primeira'}.`
      : marks?.revealedByMentor
        ? 'Você não registrou a hipótese certa a tempo; a Vó Morgana precisou mostrar os dados.'
        : 'Nenhuma hipótese correta foi registrada.',
    indicators: [
      `${name(firstId)}: ocupada ${pct(util)} do dia, fila máxima de ${s.stations[firstId].maxQueue} poções.`,
      ...STATION_ORDER.filter((id) => id !== firstId && !s.stations[id].locked)
        .sort((x, y) => s.stations[y].maxQueue - s.stations[x].maxQueue)
        .slice(0, 1)
        .map((id) => `Para comparar: ${name(id)} ficou ${pct(observedUtilization(s, id))} ocupada, fila máxima de ${s.stations[id].maxQueue}.`),
    ],
    result: `A restrição inicial era ${name(firstId)}: a estação com a maior carga em relação à sua capacidade.`,
    toc: 'A restrição é o recurso que limita a loja inteira. O indício mais forte é uma estação quase sempre ocupada com trabalho se acumulando na frente dela — não a que parece mais "parada".',
  });

  // 2. Explorar
  const exp = d.filter((x) => EXPLOIT.includes(x.kind) && x.station === firstId);
  const expAny = d.filter((x) => EXPLOIT.includes(x.kind) && x.onConstraint);
  const e0 = exp[0] || expAny[0];
  out.push({
    n: 2,
    title: 'Explorar a restrição',
    status: exp.length >= 2 ? 'feito' : exp.length || expAny.length ? 'parcial' : 'nao',
    decision: exp.length
      ? `Decisões na ${name(firstId)}: ${unique(exp.map(short)).join('; ')}.`
      : 'Você não aplicou melhorias operacionais na restrição.',
    indicators: [
      `Tempo perdido pela ${name(firstId)} no dia (sem trabalho, parada ou limpando): ${pct(lostTime(s, firstId))}.`,
      ...(e0 ? [`Entregas por minuto: ${fmt1(rate(s, e0.t - 60, e0.t))} no minuto antes → ${fmt1(rate(s, e0.t, e0.t + 60))} no minuto depois da primeira decisão.`] : []),
    ],
    result: e0
      ? 'Cada minuto recuperado na restrição vira mais poções entregues pela loja inteira, sem comprar nada.'
      : `Oportunidade: cobrir as pausas, limpar em paralelo e levar a sua bruxa para ajudar na ${name(firstId)} aumentariam as entregas sem investimento.`,
    toc: 'Explorar é tirar o máximo da restrição com o que já existe: ela nunca deve parar por falta de material, pausa evitável ou retrabalho.',
  });

  // 3. Subordinar
  const sub = d.filter((x) => (x.kind === 'release' && /corda/.test(x.label)) || (x.kind === 'keepBusy' && /só produzem/.test(x.label)) || x.kind === 'drum');
  const s0 = sub[0];
  const wipBefore = s0 ? wipAt(s, s0.t - 60, s0.t) : 0;
  const wipAfter = s0 ? wipAt(s, s0.t + 20, s0.t + 90) : 0;
  out.push({
    n: 3,
    title: 'Subordinar o resto da loja',
    status: s.policies.release === 'corda' ? 'feito' : sub.length ? 'parcial' : 'nao',
    decision: sub.length ? `Você mudou a liberação: ${unique(sub.map(short)).join('; ')}.` : 'A loja continuou liberando todo pedido assim que chegava (empurrando).',
    indicators: s0
      ? [`Poções em processo: média de ${fmt1(wipBefore)} antes → ${fmt1(wipAfter)} depois.`, `Na corda, o tambor ficou em ${name(s.policies.drum)}.`]
      : [`Poções em processo no fim do dia: ${Object.values(s.jobs).filter((j) => j.location !== 'prateleira').length}; máximo do dia: ${s.stats.maxWip}.`],
    result: s0
      ? wipAfter < wipBefore
        ? 'Menos poções paradas em filas: menos ingredientes estragando e pedidos mais rápidos.'
        : 'O estoque em processo não caiu — confira se o tamanho do pulmão e o tambor estão adequados.'
      : 'Oportunidade: liberar trabalho no ritmo da restrição (corda) evita filas, estoque parado e atrasos.',
    toc: 'Subordinar é fazer as outras estações trabalharem no ritmo da restrição. Ficarem ociosas às vezes não é problema: produzir mais do que a restrição processa só cria fila.',
  });

  // 4. Elevar
  const up = d.filter((x) => x.kind === 'upgrade');
  const good = up.filter((x) => x.onConstraint);
  const u0 = good[0] || up[0];
  out.push({
    n: 4,
    title: 'Elevar a restrição',
    status: good.length ? 'feito' : up.length ? 'parcial' : 'nao',
    decision: up.length
      ? up.map((x) => `${x.label.replace('Investiu em ', '')} — ${x.onConstraint ? 'na restrição' : 'fora da restrição'}`).join('; ') + '.'
      : 'Você não investiu em capacidade.',
    indicators: u0 ? [`Entregas por minuto: ${fmt1(rate(s, u0.t - 60, u0.t))} antes → ${fmt1(rate(s, u0.t + 25, u0.t + 85))} depois da instalação.`, ...ownedText(s)] : ownedText(s),
    result: good.length
      ? 'A capacidade da restrição aumentou — e com ela a capacidade da loja.'
      : up.length
        ? 'O investimento foi numa estação que não limitava a loja: a despesa subiu e as entregas quase não mudaram.'
        : 'Oportunidade: quando a procura aumentou, investir na restrição (depois de explorá-la) aumentaria as entregas.',
    toc: 'Elevar é aumentar a capacidade da restrição com investimento — só depois de explorar e subordinar, e só se o ganho extra pagar o custo.',
  });

  // 5. Recomeçar
  const second = marks?.secondStart != null ? s.hypotheses.filter((h) => h.t >= marks.secondStart! && h.correct != null) : [];
  const secondOk = second.find((h) => h.correct);
  const finalC = a.constraint === 'mercado' ? a.ranked[0] : a.constraint;
  const moved = finalC !== firstId;
  const retied = s.policies.drum === finalC;
  out.push({
    n: 5,
    title: 'Voltar ao passo 1',
    status: secondOk && retied ? 'feito' : secondOk || retied ? 'parcial' : 'nao',
    decision: secondOk
      ? `Depois da mudança, você identificou a nova restrição: ${name(secondOk.station)}${retied ? ' e reamarrou a corda nela' : ', mas a corda ficou no lugar antigo'}.`
      : moved
        ? 'Depois da mudança, a nova restrição não foi identificada.'
        : 'A restrição não mudou de lugar nesta partida.',
    indicators: [`No fim do dia, a estação mais carregada era ${name(finalC)} (carga de ${pct(a.maxLoad)}).`, `A corda terminou amarrada em ${name(s.policies.drum)}.`],
    result: moved
      ? `A restrição mudou de ${name(firstId)} para ${name(finalC)}. As decisões feitas para a restrição antiga precisam ser revistas.`
      : 'Mesmo sem mudar de lugar, vale reavaliar sempre que a demanda ou a loja mudam.',
    toc: 'Quando a restrição é elevada ou a demanda muda, outra estação pode assumir o papel de gargalo. A melhoria contínua é um ciclo: identificar de novo, sem deixar a inércia virar a nova restrição.',
  });
  return out;
}

function short(x: DecisionRecord): string {
  return x.label;
}

function unique(a: string[]): string[] {
  return [...new Set(a)].slice(0, 4);
}

function ownedText(s: SimState): string[] {
  return s.upgradesOwned.length ? [`Melhorias instaladas: ${s.upgradesOwned.map((o) => UPGRADES[o.id].name).join(', ')}.`] : [];
}

/** Explicação da pergunta de reflexão usando os números da própria partida. */
export function contextualReflection(s: SimState, firstId: StationId): string {
  const others = STATION_ORDER.filter((id) => id !== firstId && !s.stations[id].locked && id !== 'balcao');
  const idle = others
    .map((id) => ({ id, starved: s.stations[id].starvedTime / (s.stations[id].slots * Math.max(1, s.t)) }))
    .sort((x, y) => y.starved - x.starved)[0];
  return `Toda poção precisa passar pela restrição (${STATIONS[firstId].short}), que trabalhou ${pct(observedUtilization(s, firstId))} do dia. Na sua partida, ${STATIONS[idle.id].short} passou ${pct(idle.starved)} do tempo sem trabalho: acelerar uma estação assim só aumentaria a folga dela — e qualquer poção extra iria para a fila na frente da restrição. Entregas aumentam quando a restrição produz mais.`;
}
