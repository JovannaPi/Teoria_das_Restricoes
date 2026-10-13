import { describe, expect, it } from 'vitest';
import { getPhase, PHASES } from '../src/data/phases';
import { RECIPES } from '../src/data/recipes';
import { STATION_ORDER } from '../src/data/stations';
import * as A from '../src/sim/actions';
import { analyzeCapacity, observedUtilization } from '../src/sim/analysis';
import {
  advance,
  createSim,
  createOrder,
  inventoryValue,
  netProfit,
  stepSim,
  throughputGain,
  operatingExpense,
  wipCount,
} from '../src/sim/engine';
import type { ScenarioDef, SimState } from '../src/sim/types';

function scen(over: Partial<ScenarioDef> = {}): ScenarioDef {
  return { ...getPhase('fase1').scenario, ...over };
}

describe('receitas e etapas', () => {
  it('cada poção percorre exatamente a rota da sua receita, em ordem', () => {
    const s = createSim(scen({ policies: { release: 'empurrar', autoAccept: true } }));
    const jobs = new Map<number, string>();
    const { visited } = (() => {
      const visited = new Map<number, string[]>();
      for (let i = 0; i < 2000; i++) {
        stepSim(s);
        for (const n of s.notices) {
          if (n.type === 'job-move' && n.to !== 'prateleira') {
            const p = visited.get(n.job) || [];
            p.push(n.to);
            visited.set(n.job, p);
            jobs.set(n.job, n.recipe);
          }
        }
        s.notices.length = 0;
      }
      return { visited };
    })();
    let checked = 0;
    for (const [id, path] of visited) {
      const recipe = RECIPES[jobs.get(id) as keyof typeof RECIPES];
      const route = recipe.route.map((r) => r.station);
      // o caminho visitado é sempre um prefixo da rota (pode ainda estar em andamento ou ter sido refugado)
      expect(route.slice(0, path.length)).toEqual(path);
      if (path.length === route.length) checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('consome os ingredientes da receita uma única vez por poção liberada', () => {
    const s = createSim(scen({ policies: { autoAccept: false, autoReorder: false } }));
    const before = { ...s.stock };
    const o = createOrder(s, { recipe: 'cura', qty: 2 });
    A.acceptOrder(s, o.id);
    advance(s, 1);
    expect(s.stock.erva).toBe(before.erva - 4);
    expect(s.stock.agua_lunar).toBe(before.agua_lunar - 2);
    advance(s, 60);
    expect(s.stock.erva).toBeGreaterThanOrEqual(before.erva - 4 - 4 * 2); // no máximo retrabalhos
  });

  it('não libera poção sem ingredientes', () => {
    const s = createSim(scen({ startStock: {}, policies: { autoAccept: false, autoReorder: false } }));
    const o = createOrder(s, { recipe: 'cura', qty: 1 });
    A.acceptOrder(s, o.id);
    advance(s, 20);
    expect(wipCount(s)).toBe(0);
    expect(s.stats.starvedForIngredients).toBeGreaterThan(0);
  });
});

describe('pedidos', () => {
  it('um pedido só é concluído depois que todas as poções passam por todas as etapas', () => {
    const s = createSim(scen({ policies: { autoAccept: false } }));
    const o = createOrder(s, { recipe: 'visao', qty: 2 });
    A.acceptOrder(s, o.id);
    const total = RECIPES.visao.route.reduce((a, r) => a + r.time, 0);
    advance(s, total - 1);
    expect(o.status).toBe('aceito');
    advance(s, 120);
    expect(['concluido', 'cancelado']).toContain(o.status);
    if (o.status === 'concluido') expect(o.lines[0].delivered).toBe(2);
  });

  it('nunca entrega mais poções do que o pedido e não conclui duas vezes', () => {
    const s = createSim(scen());
    let closed = 0;
    for (let i = 0; i < 3000 && !s.finished; i++) {
      stepSim(s);
      for (const n of s.notices) if (n.type === 'order-closed' && n.status === 'concluido') closed++;
      s.notices.length = 0;
    }
    for (const o of Object.values(s.orders)) for (const l of o.lines) expect(l.delivered).toBeLessThanOrEqual(l.qty);
    expect(closed).toBe(s.stats.ordersCompleted);
    expect(new Set(Object.values(s.orders).filter((o) => o.status === 'concluido').map((o) => o.id)).size).toBe(closed);
  });
});

describe('capacidade e filas', () => {
  it('uma estação nunca processa mais tarefas simultâneas do que sua capacidade', () => {
    const s = createSim(scen());
    for (let i = 0; i < 2500; i++) {
      stepSim(s);
      for (const id of STATION_ORDER) expect(s.stations[id].active.length).toBeLessThanOrEqual(s.stations[id].slots);
    }
  });

  it('a produção respeita o tempo de processamento (vazão máxima do caldeirão)', () => {
    const s = createSim(scen());
    advance(s, 300);
    const cald = s.stations.caldeirao;
    // cada poção leva pelo menos 7 s + 3 s de limpeza num único caldeirão
    expect(cald.processed).toBeLessThanOrEqual(Math.ceil(300 / 10) + 1);
    expect(observedUtilization(s, 'caldeirao')).toBeGreaterThan(0.9);
  });

  it('com regra FIFO a fila é atendida em ordem de chegada', () => {
    const s = createSim(scen({ policies: { priority: 'fifo', autoAccept: true } }));
    const started: number[] = [];
    const queueSnapshots: number[][] = [];
    for (let i = 0; i < 3000; i++) {
      const before = [...s.stations.caldeirao.queue];
      const activeBefore = new Set(s.stations.caldeirao.active.map((a) => a.job));
      stepSim(s);
      for (const a of s.stations.caldeirao.active) if (!activeBefore.has(a.job) && before.includes(a.job)) {
        started.push(a.job);
        queueSnapshots.push(before);
      }
    }
    // a poção que começou era sempre a primeira da fila naquele momento
    for (let k = 0; k < started.length; k++) expect(queueSnapshots[k][0]).toBe(started[k]);
    expect(started.length).toBeGreaterThan(10);
    expect(s.stations.caldeirao.maxQueue).toBeGreaterThan(1);
  });

  it('priorizar manualmente coloca a poção na frente', () => {
    const s = createSim(scen());
    advance(s, 150);
    const q = s.stations.caldeirao.queue;
    expect(q.length).toBeGreaterThan(2);
    const last = q[q.length - 1];
    A.prioritizeJob(s, last);
    expect(s.stations.caldeirao.queue[0]).toBe(last);
  });
});

describe('relógio', () => {
  it('pausar (não chamar stepSim) congela tudo; o avanço é por passo fixo, independente de quadros', () => {
    const a = createSim(scen());
    const b = createSim(scen());
    advance(a, 100);
    // b avança em pedaços irregulares, como quadros de tamanhos diferentes
    for (const chunk of [0.1, 3.3, 17.6, 0.5, 40, 38.5]) advance(b, chunk);
    expect(b.t).toBeCloseTo(a.t, 5);
    expect(b.stats.delivered).toBe(a.stats.delivered);
    expect(b.cash).toBeCloseTo(a.cash, 6);
    const snapshot = JSON.stringify(a);
    // "pausado": nenhum passo executado
    expect(JSON.stringify(a)).toBe(snapshot);
  });

  it('interromper uma estação congela suas tarefas e prazos continuam valendo só com o relógio', () => {
    const s = createSim(scen());
    advance(s, 40);
    A.toggleStationPause(s, 'caldeirao');
    const rem = s.stations.caldeirao.active.map((x) => x.remaining);
    const processed = s.stations.caldeirao.processed;
    advance(s, 20);
    expect(s.stations.caldeirao.active.map((x) => x.remaining)).toEqual(rem);
    expect(s.stations.caldeirao.processed).toBe(processed);
  });
});

describe('economia', () => {
  it('ganho = receita − custo variável das vendidas; lucro = ganho − despesa operacional', () => {
    const s = createSim(scen());
    advance(s, 300);
    expect(throughputGain(s)).toBeCloseTo(s.acct.revenue - s.acct.ctvSold, 6);
    expect(netProfit(s)).toBeCloseTo(throughputGain(s) - operatingExpense(s), 6);
  });

  it('identidade de caixa: variação do caixa = lucro líquido − variação do investimento', () => {
    for (const id of ['fase1', 'fase3', 'fase4', 'mestra']) {
      const s = createSim(getPhase(id).scenario);
      const i0 = inventoryValue(s).total;
      if (id === 'fase4') {
        advance(s, 10);
        A.buyUpgrade(s, 'caldeirao_extra');
      }
      advance(s, getPhase(id).scenario.duration);
      const dCash = s.cash - s.startCash;
      const dInv = inventoryValue(s).total - i0;
      expect(dCash).toBeCloseTo(netProfit(s) - dInv, 4);
    }
  });

  it('comprar melhoria debita o caixa e não deixa comprar sem dinheiro', () => {
    const s = createSim(getPhase('fase4').scenario);
    const c0 = s.cash;
    expect(A.buyUpgrade(s, 'caldeirao_extra').ok).toBe(true);
    expect(s.cash).toBe(c0 - 360);
    s.cash = 10;
    expect(A.buyUpgrade(s, 'alambique_duplo').ok).toBe(false);
  });

  it('melhorias não podem ser compradas em fases que não permitem', () => {
    const s = createSim(getPhase('fase2').scenario);
    expect(A.buyUpgrade(s, 'caldeirao_extra').ok).toBe(false);
  });
});

describe('restrição e melhorias', () => {
  it('a restrição analítica coincide com a estação mais utilizada na prática', () => {
    for (const id of ['fase1', 'fase2', 'fase5']) {
      const s = createSim(getPhase(id).scenario);
      advance(s, 200);
      const a = analyzeCapacity(s);
      const empirical = [...STATION_ORDER].sort((x, y) => observedUtilization(s, y) - observedUtilization(s, x))[0];
      expect(a.constraint).toBe(empirical);
    }
  });

  it('investir aumenta a capacidade e a restrição muda de lugar', () => {
    const s = createSim(getPhase('fase4').scenario);
    expect(analyzeCapacity(s).constraint).toBe('caldeirao');
    A.buyUpgrade(s, 'caldeirao_extra');
    expect(s.stations.caldeirao.slots).toBe(1); // ainda instalando
    advance(s, 25);
    expect(s.stations.caldeirao.slots).toBe(2);
    const a = analyzeCapacity(s);
    expect(a.ranked[0]).toBe('destilacao');
  });

  it('hipótese é verificada contra os dados (certa e errada)', () => {
    const s = createSim(getPhase('fase1').scenario);
    advance(s, 40);
    A.registerHypothesis(s, 'embalagem');
    advance(s, 25);
    expect(s.hypotheses[0].correct).toBe(false);
    A.registerHypothesis(s, 'caldeirao');
    advance(s, 25);
    expect(s.hypotheses[1].correct).toBe(true);
    expect(s.hypotheses[1].evidence.length).toBeGreaterThan(1);
  });

  it('fase 5 exige hipótese antes de investir', () => {
    const s = createSim(getPhase('fase5').scenario);
    expect(A.buyUpgrade(s, 'alambique_duplo').ok).toBe(false);
    advance(s, 30);
    A.registerHypothesis(s, 'destilacao', 0);
    expect(A.buyUpgrade(s, 'alambique_duplo').ok).toBe(true);
  });
});

describe('salvar e carregar', () => {
  it('estado serializado em JSON continua a partida exatamente igual', () => {
    const a = createSim(getPhase('mestra').scenario);
    advance(a, 120);
    const b = JSON.parse(JSON.stringify(a)) as SimState;
    advance(a, 200);
    advance(b, 200);
    expect(b.stats).toEqual(a.stats);
    expect(b.cash).toBeCloseTo(a.cash, 8);
  });
});

describe('todas as fases rodam até o fim sem erros', () => {
  for (const p of PHASES) {
    it(p.id, () => {
      const s = createSim(p.scenario);
      advance(s, p.scenario.duration + 1);
      expect(s.finished).toBe(true);
      expect(Number.isFinite(s.cash)).toBe(true);
    });
  }
});
