// Desafio da Turma: partida guiada de ~6 minutos para seminário.
// Etapas: introdução → primeiras decisões → descoberta do gargalo → melhoria operacional →
// nova decisão (procura aumenta, investimentos liberados) → resultado.
// As dicas explicam os controles e o que observar, mas nunca dizem qual é a restrição.
import { TURMA_SURGE, TURMA_UPGRADES } from '../data/phases';
import { STATIONS } from '../data/stations';
import { LOOKS, portraitUrl } from '../render/sprites';
import { analyzeCapacity } from '../sim/analysis';
import { addLog, startEvent } from '../sim/engine';
import type { SimNotice, StationId } from '../sim/types';
import { esc } from '../ui/dom';
import type { Game } from './game';
import { personalize } from './hero';

type Lockable = 'release' | 'drum' | 'bufferSize' | 'priority' | 'inspection' | 'keepBusy' | 'setupExternal' | 'breakCover';

export interface TurmaMarks {
  initialConstraint: StationId | 'mercado';
  identifiedAt: number | null; // quando a 1ª restrição foi confirmada pelo jogador
  revealedByMentor: boolean; // a mentora precisou revelar
  improveStart: number | null;
  surgeAt: number | null;
  secondStart: number | null;
  secondIdentifiedAt: number | null;
}

interface Stage {
  id: string;
  text: (g: TurmaGuide) => string;
  button?: (g: TurmaGuide) => string;
  enter?: (g: TurmaGuide) => void;
  done: (g: TurmaGuide, kind: string, data: unknown) => boolean;
}

export class TurmaGuide {
  index = 0;
  marks: TurmaMarks;
  private coach: HTMLElement | null = null;
  private stageStart = 0;
  private viewed = new Set<StationId>();
  private hint = '';
  private unlocked = false;
  private lastHtml = '';

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

  locked(k: Lockable): boolean {
    return !this.unlocked && ['release', 'drum', 'bufferSize', 'priority', 'inspection', 'keepBusy', 'setupExternal', 'breakCover'].includes(k);
  }

  private correctSince(t: number): boolean {
    return this.s.hypotheses.some((h) => h.correct && h.t >= t);
  }

  private drumName(): string {
    const d = this.s.policies.drum;
    return STATIONS[d].short;
  }

  private readonly stages: Stage[] = [
    {
      id: 'observar',
      text: () => 'Toque em uma estação (na loja ou nos botões abaixo dela) para ver sua capacidade e sua fila.',
      done: (g) => g.viewed.size >= 1 || g.s.t - g.stageStart > 15,
    },
    {
      id: 'comparar',
      text: () => 'Observe onde as poções se acumulam e compare o tempo e a capacidade das estações. Abra outras estações.',
      done: (g) => (g.viewed.size >= 3 && g.s.t >= 35) || g.s.t >= 55,
    },
    {
      id: 'identificar',
      text: (g) =>
        'Qual estação está limitando a produção da loja? Escolha em "Hipótese" quando tiver um palpite com base nos dados.' + (g.hint ? ' ' + g.hint : ''),
      button: () => '<button class="primary mini" data-action="hypothesis">Registrar hipótese</button>',
      done: (g, kind) => {
        if (kind === 'tick') {
          const el = g.s.t - g.stageStart;
          if (el > 70 && !g.hint) {
            g.hint = 'Dica: procure a estação ocupada quase 100% do tempo e com a fila crescendo na frente dela.';
            g.render(true);
          }
          if (el > 130) {
            // a mentora revela para a turma não ficar travada
            const a = analyzeCapacity(g.s);
            g.marks.revealedByMentor = true;
            if (a.constraint !== 'mercado') g.s.policies.drum = a.constraint;
            addLog(g.s, 'info', `A Vó Morgana mostrou os dados: a restrição era ${a.constraint === 'mercado' ? 'a demanda' : STATIONS[a.constraint].short}.`);
            return true;
          }
        }
        if (g.correctSince(0)) {
          g.marks.identifiedAt = g.s.hypotheses.find((h) => h.correct)!.t;
          const truth = g.s.hypotheses.find((h) => h.correct)!.station;
          if (truth !== 'mercado') g.s.policies.drum = truth;
          return true;
        }
        return false;
      },
    },
    {
      id: 'melhorar',
      enter: (g) => {
        g.unlocked = true;
        g.marks.improveStart = g.s.t;
        g.g.refreshUi(true);
      },
      text: (g) =>
        `Antes de comprar qualquer coisa, tente melhorar o fluxo. Abra a estação ${g.drumName()} e veja "Para onde vai o tempo": dá para cobrir pausas, limpar em paralelo ou levar a sua bruxa para ajudar. Em "Fluxo", experimente liberar o trabalho pela corda.`,
      button: (g) => `<button class="primary mini" data-action="select-station" data-v="${g.s.policies.drum}">Abrir ${esc(g.drumName())}</button><button class="mini" data-action="side" data-v="fluxo">Fluxo</button>`,
      done: (g) => {
        const t0 = g.marks.improveStart ?? 0;
        const acts = g.s.decisions.filter((d) => d.t >= t0 && ['helper', 'setupExternal', 'breakCover', 'release', 'priority', 'inspection', 'bufferSize'].includes(d.kind)).length;
        return (acts >= 3 && g.s.t - t0 > 30) || g.s.t - t0 > 75;
      },
    },
    {
      id: 'investir',
      enter: (g) => {
        g.marks.surgeAt = g.s.t;
        startEvent(g.s, {
          kind: 'mudanca_demanda',
          demand: TURMA_SURGE,
          message: 'A notícia correu e chegam mais clientes, pedindo mais Visão Noturna e Transformação.',
        });
        g.s.upgradesAvailable = [...TURMA_UPGRADES];
        g.g.refreshUi(true);
      },
      text: () => 'A procura aumentou! Agora você pode investir. Compare as melhorias: preço, despesa e quanto cada uma aumenta a capacidade da loja.',
      button: () => '<button class="primary mini" data-action="side" data-v="melhorias">Ver melhorias</button>',
      done: (g) => {
        const t0 = g.marks.surgeAt ?? 0;
        const bought = g.s.upgradesOwned.some((u) => u.applied);
        return bought || g.s.t - t0 > 70;
      },
    },
    {
      id: 'recomecar',
      enter: (g) => {
        g.marks.secondStart = g.s.t;
        g.hint = '';
      },
      text: (g) =>
        'A loja mudou. A restrição de antes ainda é a mesma? Observe de novo as filas e registre uma nova hipótese.' + (g.hint ? ' ' + g.hint : ''),
      button: () => '<button class="primary mini" data-action="hypothesis">Nova hipótese</button><button class="mini" data-action="open-analysis">Análise</button>',
      done: (g, kind) => {
        const t0 = g.marks.secondStart ?? 0;
        if (kind === 'tick' && g.s.t - t0 > 50 && !g.hint) {
          g.hint = 'Dica: depois de uma mudança, compare de novo a carga e as filas — e confira onde a corda está amarrada.';
          g.render(true);
        }
        if (g.correctSince(t0)) {
          g.marks.secondIdentifiedAt = g.s.hypotheses.filter((h) => h.correct && h.t >= t0)[0].t;
          return true;
        }
        return false;
      },
    },
    {
      id: 'fim',
      text: (g) =>
        `Muito bem! Agora ajuste a loja para a nova restrição (a corda está em ${g.drumName()}) e aproveite o fim do expediente. O resultado aparece às ${g.endClock()}.`,
      done: () => false,
    },
  ];

  endClock(): string {
    const mins = 8 * 60 + Math.floor(this.s.duration * 2);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }

  start(): void {
    this.mount();
    this.enter();
  }

  private mount(): void {
    const host = document.getElementById('game-screen');
    if (!host) return;
    this.coach?.remove();
    this.coach = document.createElement('div');
    this.coach.className = 'coach turma-coach';
    this.coach.setAttribute('role', 'status');
    this.coach.setAttribute('aria-live', 'polite');
    host.appendChild(this.coach);
  }

  private enter(): void {
    const st = this.stages[this.index];
    if (!st) return;
    this.stageStart = this.s.t;
    st.enter?.(this);
    this.render(true);
  }

  render(force = false): void {
    if (!this.coach) return;
    const st = this.stages[this.index];
    if (!st) {
      this.coach.hidden = true;
      return;
    }
    const step = [2, 2, 3, 4, 5, 5, 5][this.index] ?? 5;
    const html = `<img class="portrait sm" src="${portraitUrl(LOOKS.morgana)}" alt=""><div><b>Etapa ${step} de 6 · Vó Morgana</b><p>${esc(personalize(st.text(this)))}</p>
      <div class="coach-btns">${st.button ? st.button(this) : ''}<button class="mini" data-action="open-howto" aria-label="Como jogar">?</button></div></div>`;
    if (!force && html === this.lastHtml) return;
    this.lastHtml = html;
    this.coach.innerHTML = html;
  }

  onEvent(kind: string, data: unknown): void {
    if (kind === 'select-station') this.viewed.add(data as StationId);
    const st = this.stages[this.index];
    if (!st) return;
    if (st.done(this, kind, data)) {
      this.index++;
      this.enter();
    }
  }

  onNotice(n: SimNotice): void {
    if (n.type === 'hypothesis') this.onEvent('hypothesis', n);
    if (n.type === 'upgrade-ready') this.onEvent('upgrade', n);
  }

  dispose(): void {
    this.coach?.remove();
    this.coach = null;
  }
}
