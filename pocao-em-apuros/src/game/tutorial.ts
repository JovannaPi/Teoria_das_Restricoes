// Tutorial "Aprendiz de Bruxa": ensina por ações. Cada lição espera o jogador fazer algo
// na loja de verdade (a simulação continua rodando) antes de avançar.
import type { DialogueLine } from '../data/phases';
import { STATIONS, STATION_ORDER } from '../data/stations';
import { portraitUrl, LOOKS } from '../render/sprites';
import { createOrder } from '../sim/engine';
import type { SimNotice, StationId } from '../sim/types';
import { esc } from '../ui/dom';
import * as M from '../ui/modals';
import type { Game } from './game';

interface Step {
  text: string;
  highlight?: StationId;
  enter?: (t: Tutorial) => void;
  done: (t: Tutorial, kind: string, data: unknown) => boolean;
  canSkip?: boolean;
}

const INTRO: DialogueLine[] = [
  { who: 'narrador', text: 'A velha loja de poções da família Brasaverde estava fechada havia dez invernos. Hoje, Lina recebeu a chave.' },
  { who: 'mentora', text: 'Então você é a neta da Amarílis. Tem os olhos dela… e a mesma cara de quem não sabe por onde começar.' },
  { who: 'protagonista', text: 'Vó Morgana! Eu sei fazer poções. Só não sei fazer uma loja inteira funcionar.' },
  { who: 'mentora', text: 'Uma loja é uma corrente de estações. Vamos acendê-las uma a uma. Faça o que eu pedir e observe o que acontece.' },
];

export class Tutorial {
  index: number;
  done = false;
  highlight: StationId | null = null;
  private steps: Step[];
  private stepStart = 0;
  private coach: HTMLElement | null = null;
  private asked = false;

  constructor(private g: Game, start: number) {
    this.index = start;
    this.steps = this.build();
  }

  private get s() {
    return this.g.sim!;
  }

  private build(): Step[] {
    return [
      {
        text: 'Esta é a sua oficina. Comece pelo Balcão de Atendimento (embaixo, à esquerda): clique nele.',
        highlight: 'balcao',
        done: (_t, k, d) => k === 'select-station' && d === 'balcao',
      },
      {
        text: 'Cada estação mostra no painel o que faz, quanto produz e sua fila. Olha, uma cliente chegou! Abra "Pedidos" (no topo ou clicando na cliente) e aceite a encomenda.',
        enter: (t) => {
          const o = createOrder(t.s, { recipe: 'cura', qty: 1 });
          o.acceptBy = t.s.t + 400;
        },
        done: (_t, k) => k === 'accept-order',
      },
      {
        text: 'Pedido aceito: os ingredientes saíram da despensa. Acompanhe a poção pelo preparo, caldeirão, resfriamento, embalagem e balcão. Cada etapa leva um tempo; dá para acelerar com o botão 2×.',
        done: (_t, k) => k === 'delivered',
      },
      {
        text: 'Moedas no caixa! Mas a água lunar está quase no fim. Abra a "Despensa" e encomende água lunar (+5 ou +10).',
        done: (_t, k, d) => k === 'buy' && d === 'agua_lunar',
      },
      {
        text: 'A comerciante entrega depois de um tempo, e o pagamento é na entrega. Para não esquecer, ligue a "Reposição automática" na Despensa.',
        done: (t, k) => k === 'policy' && t.s.policies.autoReorder,
      },
      {
        text: 'Agora você, Lina. Clique no Caldeirão e use "Lina ajuda aqui". Você vai até ele e a estação trabalha 20% mais rápido enquanto estiver lá. Clicar no chão leva você de volta.',
        highlight: 'caldeirao',
        done: (_t, k) => k === 'helper',
      },
      {
        text: 'O tempo é seu: o botão de pausa (ou a barra de espaço) congela tudo, inclusive os prazos. Experimente a velocidade 2×.',
        done: (_t, k, d) => k === 'speed' && d === 2,
      },
      {
        text: 'Chegou o movimento da tarde! Os pedidos agora são aceitos automaticamente. Não faça nada por um tempo: só observe onde as poções começam a se acumular.',
        enter: (t) => {
          t.s.policies.autoAccept = true;
          t.s.demand = { ...t.s.demand, ordersPerMin: 4.5 };
          t.s.nextArrivalAt = t.s.t + 1;
          for (const id of STATION_ORDER) t.s.stations[id].maxQueue = t.s.stations[id].queue.length;
        },
        done: (t, k) => k === 'tick' && t.s.t - t.stepStart > 45,
      },
      {
        text: 'Abra a "Análise" (no topo, ou tecla A). Lá estão a utilização de cada estação, as filas, a capacidade e o dinheiro.',
        enter: (t) => void t.askQueue(),
        done: (t, k) => k === 'open-analysis' && t.asked,
      },
      {
        text: 'Perfeito. Feche a Análise quando quiser. Você está pronta para o Desafio dos Cinco Círculos.',
        done: (_t, k) => k === 'next',
        canSkip: true,
      },
    ];
  }

  async start(resume: boolean): Promise<void> {
    this.mountCoach();
    if (!resume) await M.dialogue(this.g, INTRO);
    this.enter();
  }

  private mountCoach(): void {
    const stage = document.getElementById('stage');
    if (!stage) return;
    this.coach?.remove();
    this.coach = document.createElement('div');
    this.coach.className = 'coach';
    this.coach.setAttribute('role', 'status');
    stage.appendChild(this.coach);
  }

  private enter(): void {
    if (this.index >= this.steps.length) {
      void this.finish();
      return;
    }
    const st = this.steps[this.index];
    this.stepStart = this.s.t;
    this.highlight = st.highlight ?? null;
    st.enter?.(this);
    this.renderCoach();
    this.g.persistRun();
  }

  private renderCoach(): void {
    if (!this.coach) return;
    const st = this.steps[this.index];
    if (!st) {
      this.coach.hidden = true;
      return;
    }
    this.coach.hidden = false;
    this.coach.innerHTML = `<img class="portrait sm" src="${portraitUrl(LOOKS.morgana)}" alt=""><div><b>Vó Morgana · lição ${this.index + 1}/${this.steps.length}</b><p>${esc(st.text)}</p>
      <div class="coach-btns">${st.canSkip ? '<button class="primary mini" data-action="tutorial-next">Concluir tutorial</button>' : ''}<button class="mini" data-action="tutorial-skip">Pular tutorial</button></div></div>`;
  }

  onEvent(kind: string, data: unknown): void {
    if (this.done) return;
    const st = this.steps[this.index];
    if (!st) return;
    if (st.done(this, kind, data)) {
      this.index++;
      this.enter();
    }
  }

  onNotice(n: SimNotice): void {
    if (n.type === 'delivered') this.onEvent('delivered', n.order);
  }

  /** Pergunta de observação: o jogador aponta onde a fila cresceu; a resposta é conferida com os dados. */
  private async askQueue(): Promise<void> {
    const s = this.s;
    const ids = STATION_ORDER.filter((id) => !s.stations[id].locked);
    const worst = [...ids].sort((a, b) => s.stations[b].maxQueue - s.stations[a].maxQueue)[0];
    const correct = ids.indexOf(worst);
    await M.question(
      this.g,
      'O que você observou?',
      'Na frente de qual estação a fila de poções ficou maior?',
      ids.map((id) => STATIONS[id].name),
      correct,
      `Pelos dados, a maior fila foi na frente da estação ${STATIONS[worst].short} (máximo de ${s.stations[worst].maxQueue} poções). Quando o trabalho se acumula na frente de uma estação, é porque chega mais do que ela consegue fazer — um forte indício de restrição. No Primeiro Círculo você vai investigar isso com calma.`,
    );
    this.asked = true;
  }

  async finish(): Promise<void> {
    if (this.done) return;
    this.done = true;
    this.index = this.steps.length;
    this.highlight = null;
    this.coach?.remove();
    this.coach = null;
    await this.g.endPhase(true, null);
  }

  dispose(): void {
    this.coach?.remove();
    this.coach = null;
  }
}
