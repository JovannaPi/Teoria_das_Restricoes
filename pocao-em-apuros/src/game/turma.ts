// Modo rápido ("Desafio da Turma"): ~5 minutos, uma decisão por etapa, tudo dentro de um
// cartão da mentora com botões grandes. Cada decisão age na simulação real e o cartão mostra
// o efeito medido (antes → depois). As dicas nunca dizem a resposta antes da tentativa.
import { TURMA_SURGE, TURMA_UPGRADES } from '../data/phases';
import { STATIONS, STATION_ORDER } from '../data/stations';
import { UPGRADES } from '../data/upgrades';
import { LOOKS, portraitUrl } from '../render/sprites';
import * as A from '../sim/actions';
import { analyzeCapacity, hypothesisMatches, observedUtilization, recentUtilization } from '../sim/analysis';
import { addLog, deliveredBetween, startEvent, wipCount } from '../sim/engine';
import type { SimNotice, StationId, UpgradeId } from '../sim/types';
import { esc } from '../ui/dom';
import type { Game } from './game';
import { heroName, personalize } from './hero';

type Lockable = 'release' | 'drum' | 'bufferSize' | 'priority' | 'inspection' | 'keepBusy' | 'setupExternal' | 'breakCover';

export interface TurmaMarks {
  initialConstraint: StationId | 'mercado';
  identifiedAt: number | null;
  revealedByMentor: boolean;
  improveStart: number | null;
  surgeAt: number | null;
  secondStart: number | null;
  secondIdentifiedAt: number | null;
}

interface Choice {
  v: string;
  label: string;
  sub?: string;
  primary?: boolean;
}

interface Card {
  step: string; // rótulo do passo da TOC
  text: string;
  choices?: Choice[];
  feedback?: string;
  feedbackKind?: 'good' | 'bad' | 'info';
  wait?: string; // mensagem enquanto mede o efeito
}

const STEP = ['Observar', '1 · Identificar', '2 · Explorar', '3 · Subordinar', '4 · Elevar', '5 · Recomeçar', 'Fim do dia'];

export class TurmaGuide {
  index = 0; // etapa atual (0..7)
  marks: TurmaMarks;
  skipped = false;
  private coach: HTMLElement | null = null;
  private viewed = new Set<StationId>();
  private card: Card = { step: '', text: '' };
  private measure: { until: number; from: number; kind: string; base: { rate: number; wip: number; lost: number } } | null = null;
  private pendingBuy: UpgradeId | null = null;
  private lastHtml = '';
  private wrongTries = 0;

  constructor(private g: Game) {
    const a = analyzeCapacity(g.sim!);
    this.marks = {
      initialConstraint: a.constraint,
      identifiedAt: null,
      revealedByMentor: false,
      improveStart: null,
      surgeAt: null,
      secondStart: null,
      secondIdentifiedAt: null,
    };
  }

  get s() {
    return this.g.sim!;
  }

  /** Decisões avançadas ficam bloqueadas até a etapa em que fazem sentido (ou até pular as dicas). */
  locked(k: Lockable): boolean {
    if (this.skipped || this.index >= 3) return false;
    return ['release', 'drum', 'bufferSize', 'priority', 'inspection', 'keepBusy', 'setupExternal', 'breakCover'].includes(k);
  }

  private drum(): StationId {
    return this.s.policies.drum;
  }

  private rateNow(window = 30): number {
    const s = this.s;
    return (deliveredBetween(s, s.t - window, s.t) / window) * 60;
  }

  private lostNow(id: StationId, window = 30): number {
    return 1 - recentUtilization(this.s, id, window);
  }

  // ------------------------------------------------------------------ etapas

  start(): void {
    this.mount();
    this.enter();
  }

  private enter(): void {
    this.pendingBuy = null;
    this.wrongTries = 0;
    const s = this.s;
    switch (this.index) {
      case 0:
        this.card = { step: STEP[0], text: 'Toque em uma estação da loja (ou nos botões logo abaixo dela) para ver o que ela faz e a fila na frente dela.' };
        break;
      case 1: {
        // onde está o acúmulo? (observação, com resposta conferida nos dados)
        this.card = {
          step: STEP[0],
          text: 'Olhe os números de "fila" nas estações. Onde as poções estão se acumulando?',
          choices: this.stationChoices(),
        };
        break;
      }
      case 2:
        this.card = {
          step: STEP[1],
          text: 'Agora a pergunta da Teoria das Restrições: qual estação está limitando quantas poções a loja consegue entregar?',
          choices: this.stationChoices(),
        };
        break;
      case 3:
        this.marks.improveStart = s.t;
        this.card = {
          step: STEP[2],
          text: `Antes de gastar dinheiro, aproveite melhor o ${STATIONS[this.drum()].short}. Escolha uma melhoria — nada precisa ser comprado.`,
          choices: [
            { v: 'breakCover', label: 'Cobrir as pausas da equipe', sub: 'alguém assume no intervalo do chá' },
            { v: 'setupExternal', label: 'Limpar em paralelo', sub: 'uma aprendiz limpa enquanto ele trabalha' },
            { v: 'helper', label: `Levar ${heroName()} para ajudar`, sub: '20% mais rápido enquanto ela estiver lá' },
          ].filter((c) => this.applicable(c.v)),
        };
        break;
      case 4: {
        const q = s.stations[this.drum()].queue.length;
        this.card = {
          step: STEP[3],
          text: `Os aprendizes liberam todo pedido assim que ele chega. Agora há ${wipCount(s)} poções espalhadas pela loja e ${q} esperando na frente do ${STATIONS[this.drum()].short}. Como liberar o trabalho?`,
          choices: [
            { v: 'corda', label: `No ritmo do ${STATIONS[this.drum()].short}`, sub: 'só libera quando ele tiver espaço (corda)', primary: false },
            { v: 'empurrar', label: 'Continuar liberando tudo na hora', sub: 'todo mundo sempre ocupado' },
          ],
        };
        break;
      }
      case 5: {
        this.marks.surgeAt = s.t;
        startEvent(s, {
          kind: 'mudanca_demanda',
          demand: TURMA_SURGE,
          message: 'A notícia correu e chegam mais clientes, pedindo mais Visão Noturna e Transformação.',
        });
        s.upgradesAvailable = [...TURMA_UPGRADES];
        const opts: UpgradeId[] = ['caldeirao_extra', 'alambique_duplo', 'embaladora_encantada'];
        this.card = {
          step: STEP[4],
          text: `A procura aumentou! Agora você pode investir. Caixa: ${Math.round(s.cash)} moedas. Onde colocar o dinheiro?`,
          choices: [
            ...opts.map((u) => ({ v: u, label: UPGRADES[u].name, sub: `${STATIONS[UPGRADES[u].station].short} · ${UPGRADES[u].price} moedas` })),
            { v: 'nada', label: 'Não investir agora' },
          ],
        };
        break;
      }
      case 6:
        this.marks.secondStart = s.t;
        this.card = {
          step: STEP[5],
          text: 'A loja mudou. A restrição de antes ainda é a mesma? Olhe as filas de novo e escolha.',
          choices: this.stationChoices(),
        };
        break;
      case 7:
        this.card = {
          step: STEP[6],
          text: `Pronto! Você passou pelos cinco passos. Pode continuar ajustando a loja até ${this.endClock()} ou ver o resultado agora.`,
          choices: [{ v: 'fim', label: 'Ver o resultado agora', primary: true }],
        };
        break;
    }
    this.render(true);
    this.g.refreshUi(true);
  }

  private applicable(v: string): boolean {
    const st = this.s.stations[this.drum()];
    if (v === 'breakCover') return st.breakEvery > 0 && !this.s.policies.breakCover[this.drum()];
    if (v === 'setupExternal') return st.setupTime > 0 && !this.s.policies.setupExternal[this.drum()];
    return true;
  }

  private stationChoices(): Choice[] {
    return STATION_ORDER.filter((id) => !this.s.stations[id].locked).map((id) => ({ v: id, label: STATIONS[id].short }));
  }

  private next(): void {
    this.index++;
    this.enter();
  }

  // ------------------------------------------------------------------ decisões

  choose(v: string): void {
    const s = this.s;
    if (v === 'ok') {
      if (this.index === 6) A.setHelper(s, null);
      this.next();
      return;
    }
    switch (this.index) {
      case 1: {
        const ids = STATION_ORDER.filter((id) => !s.stations[id].locked);
        const max = Math.max(...ids.map((id) => s.stations[id].queue.length));
        const top = ids.filter((id) => s.stations[id].queue.length === max && max > 0);
        if (top.includes(v as StationId) || (max === 0 && (v as StationId) === this.marks.initialConstraint)) {
          this.card.feedback = `Isso: ${s.stations[v as StationId].queue.length} poções esperando na frente da estação ${STATIONS[v as StationId].short}.`;
          this.card.feedbackKind = 'good';
          this.later(() => this.next(), 1200);
        } else {
          this.card.feedback = `A fila na frente da estação ${STATIONS[v as StationId].short} tem ${s.stations[v as StationId].queue.length}. Procure o número maior nos botões das estações.`;
          this.card.feedbackKind = 'bad';
        }
        break;
      }
      case 2:
      case 6: {
        const a = analyzeCapacity(s);
        const id = v as StationId;
        const ok = hypothesisMatches(a, id);
        A.registerHypothesis(s, id, 0);
        if (ok) {
          if (this.index === 2) this.marks.identifiedAt = s.t;
          else this.marks.secondIdentifiedAt = s.t;
          s.policies.drum = id;
          this.card.feedback = `Isso! ${STATIONS[id].short} está ocupada ${pct(recentUtilization(s, id))} do tempo, tem ${s.stations[id].queue.length} poções esperando e faz ${a.loads[id].mixCapacityPerMin.toFixed(1).replace('.', ',')} poções/min — a loja recebe ${a.demandPerMin.toFixed(1).replace('.', ',')}/min. Ela não dá conta: é a restrição.`;
          this.card.feedbackKind = 'good';
          this.card.choices = [{ v: 'ok', label: this.index === 6 ? `Amarrar a corda no ${STATIONS[id].short} e continuar` : 'Continuar', primary: true }];
        } else {
          this.wrongTries++;
          this.card.feedback = wrongExplanation(s, id, a.ranked[0], a.loads[id].load) + (this.wrongTries >= 2 ? ` Dica: compare a capacidade (poções/min) com o que chega na loja.` : '');
          this.card.feedbackKind = 'bad';
          if (this.wrongTries >= 3 && this.index === 2) {
            this.marks.revealedByMentor = true;
            s.policies.drum = a.ranked[0];
            addLog(s, 'info', `A Vó Morgana mostrou os dados: a restrição era ${STATIONS[a.ranked[0]].short}.`);
            this.card.feedback += ` Vamos olhar juntas: é ${STATIONS[a.ranked[0]].short}, a única que não dá conta do que chega.`;
            this.card.choices = [{ v: 'ok', label: 'Entendi, continuar', primary: true }];
          }
        }
        break;
      }
      case 3: {
        const id = this.drum();
        if (v === 'helper') this.g.actions['help-here']({ dataset: { v: id } } as unknown as HTMLElement);
        else A.setStationPolicy(s, v as 'breakCover' | 'setupExternal', id, true);
        this.startMeasure('explorar');
        this.card.choices = [];
        this.card.wait = 'Medindo o efeito na loja…';
        break;
      }
      case 4: {
        if (v === 'corda') {
          A.setPolicy(s, 'drum', this.drum());
          A.setPolicy(s, 'release', 'corda');
        } else addLog(s, 'decisao', 'Continuou liberando todo pedido na hora (empurrar).');
        this.startMeasure(v === 'corda' ? 'corda' : 'empurrar');
        this.card.choices = [];
        this.card.wait = 'Observando o que acontece com as filas…';
        break;
      }
      case 5: {
        if (v === 'nada') {
          addLog(s, 'decisao', 'Decidiu não investir.');
          this.card.feedback = 'Sem investimento, a loja continua com a mesma capacidade — e a procura agora é maior.';
          this.card.feedbackKind = 'info';
          this.card.choices = [{ v: 'ok', label: 'Continuar', primary: true }];
          break;
        }
        const u = v as UpgradeId;
        if (this.pendingBuy !== u) {
          this.pendingBuy = u;
          this.card.feedback = `${UPGRADES[u].name}: ${UPGRADES[u].price} moedas e +${(UPGRADES[u].opCostPerSec * 30).toFixed(1).replace('.', ',')} moedas/h de despesa. Toque de novo para confirmar.`;
          this.card.feedbackKind = 'info';
          break;
        }
        const r = A.buyUpgrade(s, u);
        if (!r.ok) {
          this.card.feedback = r.message;
          this.card.feedbackKind = 'bad';
          break;
        }
        this.pendingBuy = null;
        this.startMeasure('elevar', UPGRADES[u].installTime + 5);
        this.card.choices = [];
        this.card.wait = `Instalando ${UPGRADES[u].name} e medindo o efeito…`;
        break;
      }
      case 7:
        if (v === 'fim') {
          s.duration = Math.max(s.t + 0.2, 1);
        }
        break;
    }
    this.render(true);
    this.g.refreshUi(true);
  }

  private startMeasure(kind: string, wait = 25): void {
    const s = this.s;
    this.measure = {
      until: s.t + wait,
      from: s.t,
      kind,
      base: { rate: this.rateNow(45), wip: wipCount(s), lost: this.lostNow(this.drum(), 45) },
    };
  }

  private finishMeasure(): void {
    const m = this.measure!;
    this.measure = null;
    const s = this.s;
    const win = Math.max(10, s.t - m.from);
    const rate = (deliveredBetween(s, m.from, s.t) / win) * 60;
    const fmt = (x: number) => x.toFixed(1).replace('.', ',');
    let text = '';
    let kind: Card['feedbackKind'] = 'good';
    if (m.kind === 'explorar') {
      const lost = this.lostNow(this.drum(), win);
      text = `Resultado: o ${STATIONS[this.drum()].short} ficava parado ${pct(m.base.lost)} do tempo; agora ${pct(lost)}. Entregas: ${fmt(m.base.rate)} → ${fmt(rate)} poções/min. Explorar a restrição é isso: tirar mais dela sem comprar nada.`;
    } else if (m.kind === 'corda' || m.kind === 'empurrar') {
      const w = wipCount(s);
      text =
        m.kind === 'corda'
          ? `Resultado: poções espalhadas pela loja: ${m.base.wip} → ${w}. As outras estações agora seguem o ritmo da restrição — às vezes ficam paradas, e tudo bem: produzir mais só criaria fila.`
          : `Resultado: poções espalhadas pela loja: ${m.base.wip} → ${w}. Liberar tudo não faz a restrição andar mais rápido: só aumenta a fila, o estoque parado e os atrasos.`;
      kind = m.kind === 'corda' ? 'good' : 'bad';
    } else if (m.kind === 'elevar') {
      const own = s.upgradesOwned[s.upgradesOwned.length - 1];
      const st = own ? UPGRADES[own.id].station : null;
      const wasC = st === this.drum();
      text = wasC
        ? `Resultado: entregas ${fmt(m.base.rate)} → ${fmt(rate)} poções/min. Você elevou a restrição: aumentou a capacidade de quem limitava a loja.`
        : `Resultado: entregas ${fmt(m.base.rate)} → ${fmt(rate)} poções/min. O investimento foi numa estação que não limitava a loja — a despesa subiu, mas a restrição continua a mesma.`;
      kind = wasC ? 'good' : 'bad';
    }
    this.card.wait = undefined;
    this.card.feedback = text;
    this.card.feedbackKind = kind;
    this.card.choices = [{ v: 'ok', label: 'Continuar', primary: true }];
    this.render(true);
  }

  private timers: number[] = [];
  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  // ------------------------------------------------------------------ eventos

  onEvent(kind: string, data: unknown): void {
    if (kind === 'select-station') {
      this.viewed.add(data as StationId);
      if (this.index === 0) {
        const id = data as StationId;
        const st = this.s.stations[id];
        this.card.feedback = `${STATIONS[id].name}: ${STATIONS[id].verb}. Fila agora: ${st.queue.length}. Toque em outra estação para comparar.`;
        this.card.feedbackKind = 'info';
        if (this.viewed.size >= 2) this.later(() => this.index === 0 && this.next(), 900);
        this.render(true);
      }
    }
    if (kind === 'tick') {
      if (this.measure && this.s.t >= this.measure.until) this.finishMeasure();
      if (this.index === 0 && this.s.t > 25) this.next();
    }
  }

  onNotice(n: SimNotice): void {
    void n;
  }

  skip(): void {
    this.skipped = true;
    this.coach?.classList.add('collapsed');
    // ninguém fica sem a mudança do mercado: o dia segue o mesmo roteiro
    if (this.index < 5 && this.marks.surgeAt == null) {
      const s = this.s;
      const at = Math.max(s.t + 5, 150);
      s.scheduled.push({ at, kind: 'mudanca_demanda', demand: TURMA_SURGE });
      s.scheduled.sort((a, b) => a.at - b.at);
      this.marks.surgeAt = at;
      s.upgradesAvailable = [...TURMA_UPGRADES];
    }
    this.render(true);
    this.g.refreshUi(true);
  }

  unskip(): void {
    this.skipped = false;
    this.coach?.classList.remove('collapsed');
    this.render(true);
  }

  // ------------------------------------------------------------------ desenho do cartão

  endClock(): string {
    const mins = 8 * 60 + Math.floor(this.s.duration * 2);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }

  private mount(): void {
    const host = document.getElementById('game-screen');
    if (!host) return;
    this.coach?.remove();
    this.coach = document.createElement('section');
    this.coach.className = 'coach turma-coach';
    this.coach.setAttribute('aria-live', 'polite');
    this.coach.setAttribute('aria-label', 'Dica da mentora');
    host.appendChild(this.coach);
  }

  render(force = false): void {
    if (!this.coach) return;
    if (this.skipped) {
      const html = `<button class="mini" data-action="quick-unskip">Mostrar dicas da mentora</button>`;
      if (html !== this.lastHtml) {
        this.coach.innerHTML = html;
        this.lastHtml = html;
      }
      return;
    }
    const c = this.card;
    const progress = STEP.map((_, i) => `<i class="${i < this.stepIndex() ? 'done' : i === this.stepIndex() ? 'now' : ''}"></i>`).join('');
    const choices = (c.choices || [])
      .map(
        (ch) =>
          `<button class="choice ${ch.primary ? 'primary' : ''} ${this.pendingBuy === ch.v ? 'armed' : ''}" data-action="quick-choice" data-v="${ch.v}">${esc(personalize(ch.label))}${ch.sub ? `<small>${esc(ch.sub)}</small>` : ''}</button>`,
      )
      .join('');
    const grid = (c.choices || []).length >= 5 ? 'grid3' : 'stack';
    const html = `<header><img class="portrait xs" src="${portraitUrl(LOOKS.morgana)}" alt=""><b>${esc(c.step)}</b><span class="dots" aria-hidden="true">${progress}</span>
      <button class="mini ghost" data-action="quick-skip" aria-label="Pular as dicas e jogar livre">Pular dicas</button></header>
      <p>${esc(personalize(c.text))}</p>
      ${c.feedback ? `<p class="fb ${c.feedbackKind || 'info'}" role="status">${esc(personalize(c.feedback))}</p>` : ''}
      ${c.wait ? `<p class="fb info wait">${esc(c.wait)}</p>` : ''}
      ${choices ? `<div class="choices ${grid}">${choices}</div>` : ''}`;
    if (!force && html === this.lastHtml) return;
    this.lastHtml = html;
    this.coach.innerHTML = html;
  }

  private stepIndex(): number {
    return [0, 0, 1, 2, 3, 4, 5, 6][this.index] ?? 6;
  }

  dispose(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.coach?.remove();
    this.coach = null;
  }
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Por que a escolha não é a restrição — sempre com os números da partida. */
export function wrongExplanation(s: import('../sim/types').SimState, id: StationId, truth: StationId, load: number): string {
  const st = s.stations[id];
  const u = recentUtilization(s, id);
  const base = `${STATIONS[id].short} não é o que limita a loja agora.`;
  if (u > 0.7)
    return `${base} Ela está ocupada ${pct(u)} do tempo, mas a fila na frente dela é de ${st.queue.length} e ela dá conta do que chega (carga de ${pct(load)}). Estar ocupada não é o mesmo que ser a restrição.`;
  if (s.t < st.breakUntil || st.breakEvery > 0)
    return `${base} Ela para às vezes, mas ficou ${pct(1 - observedUtilization(s, id))} do dia sem trabalho: tem folga. Parada não é o mesmo que gargalo.`;
  void truth;
  return `${base} Fila de ${st.queue.length} e ${pct(u)} do tempo ocupada: sobra capacidade. Procure onde o trabalho se acumula.`;
}
