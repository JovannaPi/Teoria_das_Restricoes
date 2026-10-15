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
  baseRate?: number; // entregas/min antes das decisões
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
}

const STEP = ['O problema', '1 · Identificar', '2 · Explorar', '3 · Subordinar', '4 · Elevar', '5 · Recomeçar', 'Resultado'];

export class TurmaGuide {
  index = 0; // etapa atual (0..7)
  marks: TurmaMarks;
  skipped = false;
  private coach: HTMLElement | null = null;
  private viewed = new Set<StationId>();
  private card: Card = { step: '', text: '' };
  private measure: { until: number; from: number; kind: string; base: { rate: number; wip: number; lost: number; queue: number; cap: number } } | null = null;
  private pendingBuy: UpgradeId | null = null;
  private tried = new Set<string>();
  private lastHtml = '';
  wrongTries = 0;

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
    this.tried.clear();
    const s = this.s;
    switch (this.index) {
      case 0:
        this.card = {
          step: STEP[0],
          text: 'Os pedidos chegam mais rápido do que a loja entrega. Toque em duas estações (na loja ou nos botões abaixo dela) para ver o que cada uma faz. Você também pode arrastar a sua bruxa e tocar nas pessoas para conversar.',
        };
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
        this.marks.baseRate ??= this.rateNow(45);
        this.marks.baseWip ??= wipCount(s);
        this.card = {
          step: STEP[2],
          text: `Antes de gastar dinheiro, tire mais do que já existe. Escolha uma melhoria sem custo — e veja o que ela faz com as entregas.`,
          choices: this.exploreChoices(),
        };
        break;
      case 4: {
        const q = s.stations[this.drum()].queue.length;
        this.card = {
          step: STEP[3],
          text: `O Tico quer todo mundo sempre ocupado: o Preparo produz mesmo sem pedido. Agora há ${wipCount(s)} poções espalhadas pela loja e ${q} esperando na frente do ${STATIONS[this.drum()].short}. Como organizar o trabalho?`,
          choices: this.subordinateChoices(),
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
        this.card = {
          step: STEP[4],
          text: `A procura aumentou! Só melhorar o que já existe não basta mais. Você tem ${Math.round(s.cash)} moedas para investir. Onde colocar o dinheiro?`,
          choices: this.elevateChoices(),
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
      case 7: {
        const fmt = (x: number) => x.toFixed(1).replace('.', ',');
        const cmp =
          this.marks.baseRate != null
            ? ` Entregas: ${fmt(this.marks.baseRate)} → ${fmt(this.rateNow(60))} poções/min. Poções espalhadas pela loja: ${this.marks.baseWip} → ${wipCount(s)}.`
            : '';
        this.card = {
          step: STEP[6],
          text: `Pronto! Você passou pelos cinco passos.${cmp} Pode continuar até ${this.endClock()} ou ver o resultado agora.`,
          choices: [{ v: 'fim', label: 'Ver o resultado agora', primary: true }],
        };
        break;
      }
    }
    // nas etapas que agem sobre a restrição, a câmera mostra a restrição
    if (this.index >= 3 && this.index <= 5) this.g.camera.focusStation(this.drum());
    this.render(true);
    this.g.refreshUi(true);
  }

  private exploreChoices(): Choice[] {
    const c = this.drum();
    const C = STATIONS[c].short;
    return [
      { v: 'setupExternal', label: 'Limpar em paralelo', sub: `uma aprendiz limpa o ${C} enquanto ele trabalha` },
      { v: 'breakCover', label: 'Cobrir as pausas', sub: `alguém assume o ${C} na hora do chá` },
      { v: 'helper', label: `${heroName()} ajuda no ${C}`, sub: '20% mais rápido enquanto ela estiver lá' },
      { v: 'helper-preparo', label: `${heroName()} ajuda no Preparo`, sub: 'o Preparo fica 20% mais rápido' },
    ].filter((ch) => !this.tried.has(ch.v) && this.applicable(ch.v));
  }

  private subordinateChoices(): Choice[] {
    const C = STATIONS[this.drum()].short;
    return [
      { v: 'corda', label: `Trabalhar no ritmo do ${C}`, sub: 'só começa uma poção quando ele tiver espaço (corda)' },
      { v: 'empurrar', label: 'Manter todo mundo ocupado', sub: 'cada estação produz o máximo que conseguir' },
    ].filter((ch) => !this.tried.has(ch.v));
  }

  private elevateChoices(): Choice[] {
    const opts: UpgradeId[] = ['caldeirao_extra', 'alambique_duplo', 'bancada_extra'];
    return [
      ...opts
        .filter((u) => !this.s.upgradesOwned.some((o) => o.id === u))
        .map((u) => ({ v: u, label: UPGRADES[u].name, sub: `${STATIONS[UPGRADES[u].station].short} · ${UPGRADES[u].price} moedas` })),
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
          this.card.feedback = `Isso! ${STATIONS[id].short} está ocupada ${pct(recentUtilization(s, id))} do tempo, tem ${s.stations[id].queue.length} poções esperando e faz ${a.loads[id].mixCapacityPerMin.toFixed(1).replace('.', ',')} poções/min — a loja recebe ${a.demandPerMin.toFixed(1).replace('.', ',')}/min. Ela não dá conta: é a restrição.`;
          this.card.feedbackKind = 'good';
          this.card.choices = [{ v: 'ok', label: this.index === 6 ? `Amarrar a corda no ${STATIONS[id].short} e continuar` : 'Continuar', primary: true }];
        } else {
          this.wrongTries++;
          this.card.feedback =
            wrongExplanation(s, id, a.ranked[0], a.loads[id].load) +
            (this.wrongTries >= 2 ? ` Dica: compare a capacidade (poções/min) com o que chega na loja.` : ` A Vó Morgana (balão "!" no fundo da loja) pode ajudar.`);
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
        if (v === 'helper') this.g.actions['help-here']({ dataset: { v: id } } as unknown as HTMLElement);
        else if (v === 'helper-preparo') this.g.actions['help-here']({ dataset: { v: 'preparo' } } as unknown as HTMLElement);
        else A.setStationPolicy(s, v as 'breakCover' | 'setupExternal', id, true);
        this.startMeasure(v === 'helper-preparo' ? 'explorar-fora' : 'explorar');
        this.card.choices = [];
        this.card.wait = 'Medindo o efeito na loja…';
        break;
      }
      case 4: {
        this.tried.add(v);
        if (v === 'corda') {
          A.setPolicy(s, 'drum', this.drum());
          A.setPolicy(s, 'release', 'corda');
          A.setPolicy(s, 'keepBusy', false);
        } else addLog(s, 'decisao', 'Manteve todo mundo ocupado (cada estação produz o máximo).');
        this.startMeasure(v === 'corda' ? 'corda' : 'empurrar', 40);
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
      base: { rate: this.rateNow(45), wip: wipCount(s), lost: this.lostNow(this.drum(), 45), queue: s.stations[this.drum()].queue.length, cap: analyzeCapacity(s).systemCapacityPerMin },
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
    let retry: Choice[] = [];
    const C = STATIONS[this.drum()].short;
    // capacidade da loja = o que a restrição consegue fazer (calculada pela simulação, sem o ruído de uma janela curta)
    const capNow = analyzeCapacity(s).systemCapacityPerMin;
    const capTxt = `A loja consegue entregar ${fmt(m.base.cap)} → ${fmt(capNow)} poções/min`;
    if (m.kind === 'explorar') {
      const lost = this.lostNow(this.drum(), win);
      text = `Resultado: o ${C} ficava parado ${pct(m.base.lost)} do tempo; agora ${pct(lost)}. ${capTxt}. Explorar a restrição é isso: tirar mais dela sem comprar nada.`;
    } else if (m.kind === 'explorar-fora') {
      const q = s.stations[this.drum()].queue.length;
      text = `Resultado: ${capTxt} — nada mudou. O Preparo ficou mais rápido, mas toda poção ainda passa pelo ${C}, que continua no mesmo ritmo. A fila na frente dele: ${m.base.queue} → ${q}. Tente melhorar quem limita a loja.`;
      kind = 'bad';
      retry = this.exploreChoices();
    } else if (m.kind === 'corda' || m.kind === 'empurrar') {
      const w = wipCount(s);
      if (m.kind === 'corda') {
        text = `Resultado: poções espalhadas pela loja: ${m.base.wip} → ${w}, e as entregas ficaram em ${fmt(rate)} poções/min. As outras estações agora seguem o ritmo da restrição — às vezes ficam paradas, e tudo bem: produzir mais só criaria fila e poção estragada.`;
      } else {
        text = `Resultado: poções espalhadas pela loja: ${m.base.wip} → ${w}, e as entregas continuam em ${fmt(rate)} poções/min. Todo mundo ocupado não faz o ${C} andar mais rápido: só aumenta a fila, o dinheiro parado e as poções que estragam esperando.`;
        kind = 'bad';
        retry = this.subordinateChoices();
      }
    } else if (m.kind === 'elevar') {
      const own = s.upgradesOwned[s.upgradesOwned.length - 1];
      const st = own ? UPGRADES[own.id].station : null;
      const wasC = st === this.drum();
      text = wasC
        ? `Resultado: ${capTxt}, e as entregas medidas foram ${fmt(rate)} poções/min. Você elevou a restrição: aumentou a capacidade de quem limitava a loja.`
        : `Resultado: ${capTxt} — nada mudou. O investimento foi numa estação que não limitava a loja: a despesa subiu, mas o ${C} continua no mesmo ritmo.`;
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
        this.card.feedback = `${STATIONS[id].name}: ${STATIONS[id].verb}. Fila agora: ${st.queue.length}. Toque em outra estação para comparar.`;
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
      <button class="mini ghost" data-action="quick-restart" aria-label="Recomeçar a demonstração">Recomeçar</button>
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
