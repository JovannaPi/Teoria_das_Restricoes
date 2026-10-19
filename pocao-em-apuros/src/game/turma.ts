// Modo rápido (aula, 6 a 10 minutos): loja enxuta (4 estações, 1 poção), uma decisão por etapa,
// tudo dentro de um cartão da mentora com botões grandes. Cada decisão age na simulação real e o
// cartão mostra o efeito medido (antes → depois). Uma escolha que não ajuda (melhorar quem não é a
// restrição, manter todo mundo ocupado, investir no lugar errado) também é medida, e o jogador pode
// tentar de novo: a etapa só avança quando ele vê o efeito. As dicas nunca dizem a resposta antes da
// tentativa; os personagens da loja ajudam quando ele pede (talk.ts).
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
import { personalize } from './hero';

type Lockable = 'release' | 'drum' | 'bufferSize' | 'priority' | 'inspection' | 'keepBusy' | 'setupExternal' | 'breakCover';

export interface TurmaMarks {
  initialConstraint: StationId | 'mercado';
  identifiedAt: number | null;
  revealedByMentor: boolean;
  improveStart: number | null;
  surgeAt: number | null;
  secondStart: number | null;
  secondIdentifiedAt: number | null;
  baseRate?: number; // entregas/min antes das decisões
  baseCap?: number; // poções/min que a loja conseguia entregar no começo (= o que a restrição faz)
  baseWip?: number;
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
  help?: boolean; // mostra o botão de conversar com a mentora
}

const STEP = ['O problema', '1 · Identificar', '2 · Explorar', '3 · Subordinar', '4 · Elevar', '5 · Recomeçar', 'Resultado'];

export class TurmaGuide {
  index = 0; // etapa atual (0..7)
  marks: TurmaMarks;
  skipped = false;
  private coach: HTMLElement | null = null;
  private viewed = new Set<StationId>();
  private card: Card = { step: '', text: '' };
  private measure: { until: number; from: number; kind: string; base: { wip: number; cap: number } } | null = null;
  /** poções paradas mostradas no cartão do passo 3 (o "antes" do resultado é esse mesmo número) */
  private cardWip = 0;
  private pendingBuy: UpgradeId | null = null;
  private tried = new Set<string>();
  private lastHtml = '';
  wrongTries = 0;

  constructor(private g: Game) {
    const a = analyzeCapacity(g.sim!);
    this.marks = {
      baseCap: a.systemCapacityPerMin,
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



  // ------------------------------------------------------------------ etapas

  start(): void {
    this.mount();
    this.enter();
  }

  private enter(): void {
    this.pendingBuy = null;
    this.card = { step: '', text: '' };
    this.wrongTries = 0;
    this.tried.clear();
    const s = this.s;
    switch (this.index) {
      case 0:
        this.card = {
          step: STEP[0],
          text: 'Os pedidos chegam mais rápido do que a loja entrega. Toque em duas estações para conhecer a loja.',
        };
        break;
      case 1: {
        // a pergunta "onde acumula" repetia a de identificar: no modo rápido vamos direto a ela
        this.index = 2;
        this.enter();
        return;
      }
      case 99: {
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
          text: 'Qual estação está segurando a loja? Olhe as filas.',
          choices: this.stationChoices(),
        };
        break;
      case 3:
        this.marks.improveStart = s.t;
        this.marks.baseRate ??= this.rateNow(45);
        this.marks.baseWip ??= wipCount(s);
        this.card = {
          step: STEP[2],
          text: `Melhore o ${STATIONS[this.drum()].short} sem gastar nada. O que fazer?`,
          choices: this.exploreChoices(),
        };
        break;
      case 4: {
        this.cardWip = wipCount(s);
        this.card = {
          step: STEP[3],
          text: `Os aprendizes produzem sem parar, mesmo sem pedido: já são ${this.cardWip} poções paradas pela loja. Como trabalhar?`,
          choices: this.subordinateChoices(),
        };
        break;
      }
      case 5: {
        this.marks.surgeAt = s.t;
        startEvent(s, {
          kind: 'mudanca_demanda',
          demand: TURMA_SURGE,
          message: 'A notícia correu e chegam mais clientes.',
        });
        s.upgradesAvailable = [...TURMA_UPGRADES];
        this.card = {
          step: STEP[4],
          text: `Chegaram mais clientes! Agora vale investir. Você tem ${Math.round(s.cash)} moedas. Onde?`,
          choices: this.elevateChoices(),
        };
        break;
      }
      case 6:
        this.marks.secondStart = s.t;
        this.card = {
          step: STEP[5],
          text: 'A loja mudou! Espere a fila crescer: qual estação está segurando a loja agora?',
          choices: this.stationChoices(),
        };
        break;
      case 7: {
        const fmt = (x: number) => x.toFixed(1).replace('.', ',');
        const cmp =
          this.marks.baseCap != null
            ? ` No começo, a loja conseguia entregar ${fmt(this.marks.baseCap ?? 0)} poções por minuto; agora, ${fmt(analyzeCapacity(s).systemCapacityPerMin)}. Poções paradas pela loja: ${this.marks.baseWip} → ${wipCount(s)}.`
            : '';
        this.card = {
          step: STEP[6],
          text: `Pronto: você passou pelos cinco passos!${cmp}`,
          choices: [{ v: 'fim', label: 'Ver o resultado agora', primary: true }],
        };
        break;
      }
    }
    // o caixa só aparece quando há o que fazer com ele
    document.body.classList.toggle('show-cash', this.index >= 5);
    // nas etapas que agem sobre a restrição, a câmera mostra a restrição
    if (this.index >= 3 && this.index <= 5) this.g.camera.focusStation(this.drum());
    this.render(true);
    this.g.refreshUi(true);
  }

  private exploreChoices(): Choice[] {
    const c = this.drum();
    const C = STATIONS[c].short;
    return [
      { v: 'setupExternal', label: 'Limpar em paralelo', sub: 'alguém limpa enquanto ele trabalha' },
      { v: 'breakCover', label: 'Cobrir as pausas', sub: 'alguém assume na hora do chá' },
      { v: 'helper', label: `Você ajuda no ${C}`, sub: 'sua bruxa vai até lá' },
      { v: 'helper-preparo', label: 'Você ajuda no Preparo', sub: 'sua bruxa vai até lá' },
    ].filter((ch) => !this.tried.has(ch.v) && this.applicable(ch.v));
  }

  private subordinateChoices(): Choice[] {
    const C = STATIONS[this.drum()].short;
    return [
      { v: 'corda', label: `No ritmo do ${C}`, sub: 'só começa uma poção quando ele puder' },
      { v: 'empurrar', label: 'Todo mundo ocupado', sub: 'cada um produz o máximo' },
    ].filter((ch) => !this.tried.has(ch.v));
  }

  private elevateChoices(): Choice[] {
    const opts: UpgradeId[] = ['caldeirao_extra', 'alambique_duplo', 'bancada_extra'];
    return [
      ...opts
        .filter((u) => !this.s.upgradesOwned.some((o) => o.id === u))
        .map((u) => ({ v: u, label: UPGRADES[u].name, sub: `${UPGRADES[u].price} moedas` })),
      { v: 'nada', label: 'Não investir agora' },
    ];
  }

  private applicable(v: string): boolean {
    const st = this.s.stations[this.drum()];
    if (v === 'breakCover') return st.breakEvery > 0 && !this.s.policies.breakCover[this.drum()];
    if (v === 'setupExternal') return st.setupTime > 0 && !this.s.policies.setupExternal[this.drum()];
    if (v === 'helper') return this.s.helper !== this.drum();
    if (v === 'helper-preparo') return this.drum() !== 'preparo' && this.s.helper !== 'preparo';
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
          this.wrongTries++;
          if (this.wrongTries === 1) this.card.feedback += ` Dúvida? Converse com quem trabalha nas estações.`;
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
          this.card.feedback = `Isso! ${n(s.stations[id].queue.length, 'poção espera', 'poções esperam')} na frente da estação ${STATIONS[id].short}: ela faz ${a.loads[id].mixCapacityPerMin.toFixed(1).replace('.', ',')} por minuto, mas chegam ${a.demandPerMin.toFixed(1).replace('.', ',')}. Ela segura a loja: é a restrição.`;
          this.card.feedbackKind = 'good';
          this.card.choices = [{ v: 'ok', label: 'Continuar', primary: true }];
        } else {
          this.wrongTries++;
          // curto e com um número só: a fila dela, e o fato de ela dar conta
          this.card.feedback =
            `Não é ${the(id)} ${STATIONS[id].short}: a fila ${the(id) === 'a' ? 'dela' : 'dele'} é ${s.stations[id].queue.length} e ${the(id) === 'a' ? 'ela' : 'ele'} dá conta do que chega.` +
            (this.wrongTries >= 2 ? ' Procure a fila que só cresce.' : ' Peça uma dica à Vó Morgana.');
          this.card.help = true;
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
        this.tried.add(v);
        // o "antes" é medido antes de a decisão valer
        const helper = v === 'helper' || v === 'helper-preparo';
        this.startMeasure(v === 'helper-preparo' ? 'explorar-fora' : 'explorar', helper ? 9 : 4);
        if (v === 'helper') this.g.actions['help-here']({ dataset: { v: id } } as unknown as HTMLElement);
        else if (v === 'helper-preparo') this.g.actions['help-here']({ dataset: { v: 'preparo' } } as unknown as HTMLElement);
        else A.setStationPolicy(s, v as 'breakCover' | 'setupExternal', id, true);
        this.card.choices = [];
        this.card.feedback = undefined;
        this.card.wait = helper ? 'Sua bruxa está indo até lá…' : 'Vendo o que muda…';
        break;
      }
      case 4: {
        this.tried.add(v);
        if (v === 'corda') {
          A.setPolicy(s, 'drum', this.drum());
          A.setPolicy(s, 'release', 'corda');
          A.setPolicy(s, 'keepBusy', false);
        } else addLog(s, 'decisao', 'Manteve todo mundo ocupado (cada estação produz o máximo).');
        this.startMeasure(v === 'corda' ? 'corda' : 'empurrar', 20);
        this.measure!.base.wip = this.cardWip;
        this.card.choices = [];
        this.card.feedback = undefined;
        this.card.wait = 'Repare nas poções paradas pela loja…';
        break;
      }
      case 5: {
        if (v === 'nada') {
          addLog(s, 'decisao', 'Decidiu não investir.');
          this.card.feedback = 'Sem investir, a loja continua do mesmo tamanho — e agora chegam mais clientes.';
          this.card.feedbackKind = 'info';
          this.card.choices = [{ v: 'ok', label: 'Continuar', primary: true }];
          break;
        }
        const u = v as UpgradeId;
        if (this.pendingBuy !== u) {
          this.pendingBuy = u;
          this.card.feedback = `${UPGRADES[u].name} por ${UPGRADES[u].price} moedas. Toque de novo para confirmar.`;
          this.card.feedbackKind = 'info';
          break;
        }
        this.startMeasure('elevar', UPGRADES[u].installTime + 2);
        const r = A.buyUpgrade(s, u);
        if (!r.ok) {
          this.measure = null;
          this.card.feedback = r.message;
          this.card.feedbackKind = 'bad';
          break;
        }
        this.pendingBuy = null;
        this.card.choices = [];
        this.card.feedback = undefined;
        this.card.wait = `Instalando: ${UPGRADES[u].name}…`;
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

  /** O que a restrição consegue fazer por minuto (calculado pela simulação, sem o ruído de uma janela curta). */
  private capNow(): number {
    return analyzeCapacity(this.s).loads[this.drum()].mixCapacityPerMin;
  }

  private startMeasure(kind: string, wait: number): void {
    const s = this.s;
    this.measure = { until: s.t + wait, from: s.t, kind, base: { wip: wipCount(s), cap: this.capNow() } };
  }

  private finishMeasure(): void {
    const m = this.measure!;
    this.measure = null;
    const s = this.s;
    const fmt = (x: number) => x.toFixed(1).replace('.', ',');
    let text = '';
    let kind: Card['feedbackKind'] = 'good';
    let retry: Choice[] = [];
    const C = STATIONS[this.drum()].short;
    const cap = this.capNow();
    if (m.kind === 'explorar') {
      text = `Boa! O ${C} fazia ${fmt(m.base.cap)} poções por minuto; agora faz ${fmt(cap)} — sem gastar nada.`;
    } else if (m.kind === 'explorar-fora') {
      text = `Não mudou nada: o ${C} continua fazendo ${fmt(cap)} poções por minuto, e toda poção passa por ele. Tente outra.`;
      kind = 'bad';
      retry = this.exploreChoices();
    } else if (m.kind === 'corda' || m.kind === 'empurrar') {
      const w = wipCount(s);
      if (m.kind === 'corda') {
        text = `Boa! Poções paradas pela loja: ${m.base.wip} → ${w}, e as entregas continuam iguais. Produzir mais do que o ${C} só fazia fila.`;
      } else {
        text = `Poções paradas pela loja: ${m.base.wip} → ${w}, e as entregas não aumentaram. Todo mundo ocupado não faz o ${C} andar mais rápido.`;
        kind = 'bad';
        retry = this.subordinateChoices();
      }
    } else if (m.kind === 'elevar') {
      const own = s.upgradesOwned[s.upgradesOwned.length - 1];
      const st = own ? UPGRADES[own.id].station : null;
      const wasC = st === this.drum();
      text = wasC
        ? `Boa! O ${C} fazia ${fmt(m.base.cap)} poções por minuto; agora faz ${fmt(cap)}. Você aumentou quem segurava a loja.`
        : `Não mudou nada: o ${C} continua fazendo ${fmt(cap)} poções por minuto. Você gastou, mas ele continua segurando a loja.`;
      kind = wasC ? 'good' : 'bad';
      if (!wasC) retry = this.elevateChoices().filter((c) => c.v === 'nada' || UPGRADES[c.v as UpgradeId].price <= s.cash);
    }
    this.card.wait = undefined;
    this.card.feedback = text;
    this.card.feedbackKind = kind;
    // escolha que não ajudou: dá para tentar outra (ou seguir, se quiser)
    this.card.choices = retry.length
      ? [...retry.filter((c) => c.v !== 'nada'), { v: 'ok', label: 'Seguir mesmo assim' }]
      : [{ v: 'ok', label: 'Continuar', primary: true }];
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
        this.card.feedback = `${STATIONS[id].short}: ${STATIONS[id].verb}. Fila: ${st.queue.length}.${this.viewed.size < 2 ? ' Toque em outra.' : ''}`;
        this.card.feedbackKind = 'info';
        if (this.viewed.size >= 2) this.later(() => this.index === 0 && this.next(), 900);
        this.render(true);
      }
    }
    if (kind === 'tick') {
      if (this.measure && this.s.t >= this.measure.until) this.finishMeasure();
      // o relógio é referência, não pressão: o dia se estende até o jogador passar pelos cinco passos
      const s = this.s;
      if (!this.skipped && this.index < 7 && s.duration - s.t < 30 && s.duration < 900) {
        s.duration += 60;
        if (s.nextArrivalAt === Number.POSITIVE_INFINITY) s.nextArrivalAt = s.t + 5;
      }
      if (this.index === 0 && this.s.t > 25) this.next();
    }
  }

  onNotice(n: SimNotice): void {
    void n;
  }

  skip(): void {
    this.skipped = true;
    document.body.classList.add('guide-free');
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
    document.body.classList.remove('guide-free');
    this.coach?.classList.remove('collapsed');
    this.render(true);
  }

  /** Texto da etapa atual (a bruxa "pensa alto" quando o jogador toca nela). */
  currentText(): string {
    return personalize(this.card.text);
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
    const n = (c.choices || []).length;
    const grid = n >= 5 ? 'grid3' : n === 4 ? 'grid2' : 'stack';
    const html = `<header><img class="portrait xs" src="${portraitUrl(LOOKS.morgana)}" alt=""><b>${esc(c.step)}</b><span class="dots" aria-hidden="true">${progress}</span>
</header>
      <p>${esc(personalize(c.text))}</p>
      ${c.feedback ? `<p class="fb ${c.feedbackKind || 'info'}" role="status">${esc(personalize(c.feedback))}</p>` : ''}
      ${c.wait ? `<p class="fb info wait">${esc(c.wait)}${this.measure ? ` <b class="count">${Math.max(1, Math.ceil(this.measure.until - this.s.t))} s</b>` : ''}</p>` : ''}
      ${c.help && !c.wait ? '<button class="mini ghost talk-help" data-action="talk-mentor">Pedir uma dica à Vó Morgana</button>' : ''}
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

/** artigo da estação ("a Destilação", "o Caldeirão") */
function the(id: StationId): 'a' | 'o' {
  return id === 'destilacao' || id === 'embalagem' ? 'a' : 'o';
}

/** "1 poção espera" / "3 poções esperam" */
function n(k: number, one: string, many: string): string {
  return `${k} ${k === 1 ? one : many}`;
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
