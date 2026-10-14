// Definição das fases: cenário de simulação + objetivos + narrativa + avaliação.
// Todos os números de balanceamento estão aqui (e em recipes/stations/upgrades),
// e foram validados pelos testes automatizados em tests/balance.test.ts.
import type { DemandConfig, RecipeId, ScenarioDef, StationId } from '../sim/types';

export type ObjectiveKind = 'hypothesis' | 'delivered' | 'netProfit' | 'avgWip' | 'reputation' | 'canceled' | 'cash' | 'tutorial';

export interface Objective {
  kind: ObjectiveKind;
  target: number;
  label: string;
}

export interface DialogueLine {
  who: 'mentora' | 'protagonista' | 'aprendiz' | 'comerciante' | 'narrador';
  text: string;
}

export interface ReflectionQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

export type PanelId = 'pedidos' | 'despensa' | 'fluxo' | 'melhorias' | 'analise' | 'receitas' | 'glossario';

export interface PhaseDef {
  id: string;
  mode: 'tutorial' | 'desafio' | 'mestra';
  number: number;
  title: string;
  subtitle: string;
  tocStep: string;
  goalText: string;
  scenario: ScenarioDef;
  objectives: Objective[];
  intro: DialogueLine[];
  outroWin: DialogueLine[];
  outroLose: DialogueLine[];
  concept: string;
  question: ReflectionQuestion;
  // controles disponíveis
  lockedPolicies: ('release' | 'drum' | 'bufferSize' | 'priority' | 'inspection' | 'keepBusy' | 'setupExternal' | 'breakCover')[];
  hypothesisEnabled: boolean;
  showLoadLens: boolean; // mostra a carga teórica (revela a restrição) no painel de análise
  speedOptions: number[];
  refProfit: number; // referência de lucro para a pontuação
  refWip: number; // referência de estoque em processo médio
  revealConstraint: StationId | null; // estação conhecida no início (marcada como tambor)
}

const baseDemand: DemandConfig = {
  ordersPerMin: 3.3,
  mix: { cura: 0.5, visao: 0.35, transformacao: 0.15 },
  maxLines: 2,
  qtyMin: 1,
  qtyMax: 2,
};

const baseStock = {
  erva: 16,
  agua_lunar: 12,
  cogumelo: 12,
  essencia_sombria: 8,
  raiz: 5,
  po_cristal: 6,
  essencia_rara: 5,
  tinta_runica: 4,
};

function scenario(o: Partial<ScenarioDef> & { id: string; seed: number }): ScenarioDef {
  return {
    duration: 300,
    startCash: 400,
    startReputation: 60,
    stations: {},
    recipes: ['cura', 'visao', 'transformacao'] as RecipeId[],
    demand: baseDemand,
    startStock: baseStock,
    supplierLeadTime: 10,
    policies: {},
    upgrades: [],
    events: [],
    wipHoldingCost: 0.03,
    spoilTime: 0,
    graceTime: 50,
    acceptWindow: 25,
    rentPerSec: 0.4,
    firstArrival: 2,
    ...o,
  };
}

const SPEEDS = [1, 2, 4];

export const PHASES: PhaseDef[] = [
  // ------------------------------------------------------------------ TUTORIAL
  {
    id: 'tutorial',
    mode: 'tutorial',
    number: 0,
    title: 'Aprendiz de Bruxa',
    subtitle: 'A loja empoeirada',
    tocStep: 'Primeiros passos',
    goalText: 'Aprenda a operar a loja com a Vó Morgana.',
    scenario: scenario({
      id: 'tutorial',
      seed: 1201,
      duration: 1800,
      acceptWindow: 120,
      startCash: 300,
      startReputation: 60,
      recipes: ['cura', 'visao'],
      demand: { ordersPerMin: 1.6, mix: { cura: 0.6, visao: 0.4 }, maxLines: 1, qtyMin: 1, qtyMax: 2 },
      startStock: { erva: 8, agua_lunar: 2, cogumelo: 6, essencia_sombria: 4 },
      policies: { autoAccept: false, autoReorder: false },
      firstArrival: 9999,
    }),
    objectives: [{ kind: 'tutorial', target: 1, label: 'Concluir as lições da Vó Morgana' }],
    intro: [],
    outroWin: [
      { who: 'mentora', text: 'Muito bem, menina. Agora você sabe o básico: pedidos entram, poções fluem, moedas saem pela porta… e entram pelo balcão.' },
      { who: 'mentora', text: 'Mas uma loja não é uma soma de estações. É uma corrente. E toda corrente tem um elo mais fraco. Vamos encontrá-lo no Desafio dos Cinco Círculos.' },
    ],
    outroLose: [],
    concept: 'Uma loja é um sistema: as poções só chegam ao cliente depois de passar por todas as etapas da receita.',
    question: {
      question: 'Na loja, o que realmente gera dinheiro para a Lina?',
      options: [
        'Manter todas as estações ocupadas o tempo todo.',
        'Poções entregues e pagas pelos clientes.',
        'Ter muitos ingredientes guardados na despensa.',
      ],
      correct: 1,
      explanation:
        'Só a venda gera ganho. Estação ocupada produzindo o que ninguém comprou, ou ingrediente parado na prateleira, é dinheiro preso — não ganho.',
    },
    lockedPolicies: ['release', 'drum', 'bufferSize', 'priority', 'inspection', 'keepBusy', 'setupExternal', 'breakCover'],
    hypothesisEnabled: false,
    showLoadLens: false,
    speedOptions: [1, 2],
    refProfit: 100,
    refWip: 4,
    revealConstraint: null,
  },

  // ------------------------------------------------------------------ FASE 1
  {
    id: 'fase1',
    mode: 'desafio',
    number: 1,
    title: 'A Loja Entupida',
    subtitle: 'Primeiro Círculo — Identificar',
    tocStep: '1. Identificar a restrição',
    goalText: 'Descubra qual estação limita as entregas da loja e registre sua hipótese.',
    scenario: scenario({
      id: 'fase1',
      seed: 4242,
      stations: { embalagem: { breakEvery: 50, breakDuration: 10 } },
      policies: { release: 'empurrar', autoAccept: true, autoReorder: true },
    }),
    objectives: [
      { kind: 'hypothesis', target: 1, label: 'Registrar a hipótese correta sobre a restrição' },
      { kind: 'delivered', target: 18, label: 'Entregar pelo menos 18 poções' },
      { kind: 'reputation', target: 1, label: 'Manter a reputação acima de zero' },
    ],
    intro: [
      { who: 'mentora', text: 'Primeiro Círculo, Lina. A loja está entupida: clientes reclamando, poções atrasadas, aprendizes correndo para todo lado.' },
      { who: 'aprendiz', text: 'É a embalagem, Vó! Toda hora eu olho e a moça da embalagem está parada tomando chá!' },
      { who: 'mentora', text: 'Tico acha. Eu não acho nada: eu observo. Clique nas estações, abra a Análise e veja onde o trabalho se acumula e quanto cada uma consegue produzir.' },
      { who: 'mentora', text: 'Quando tiver certeza, registre sua hipótese na estação que você acredita que limita a loja inteira. Eu confiro os dados.' },
    ],
    outroWin: [
      { who: 'mentora', text: 'Isso! O caldeirão. Ele trabalha sem parar e a fila na frente dele só cresce. Cada minuto do caldeirão é um minuto da loja inteira.' },
      { who: 'aprendiz', text: 'Mas a embalagem vivia parada…' },
      { who: 'mentora', text: 'E podia ficar! Ela produz mais do que chega até ela. Parada não é o mesmo que gargalo, Tico.' },
    ],
    outroLose: [{ who: 'mentora', text: 'Ainda não. Observe onde o trabalho se acumula e qual estação está sempre ocupada. Tente de novo.' }],
    concept:
      'A restrição é o recurso que limita o desempenho do sistema inteiro. Indícios: trabalha praticamente 100% do tempo, tem fila crescente na frente e sua capacidade (para o mix de pedidos) é a menor da loja.',
    question: {
      question: 'A embalagem ficava parada várias vezes por dia. Por que ela NÃO era a restrição?',
      options: [
        'Porque ela é barata de operar.',
        'Porque, mesmo com as pausas, ela consegue embalar mais poções do que o caldeirão consegue entregar a ela.',
        'Porque ela fica no fim do processo, e a restrição sempre fica no começo.',
      ],
      correct: 1,
      explanation:
        'Uma estação só limita a loja se sua capacidade for menor que o que o sistema precisa dela. A embalagem tem folga: ficar parada esperando poções é normal para um recurso que não é restrição. A posição no processo não importa.',
    },
    lockedPolicies: ['release', 'drum', 'bufferSize', 'priority', 'inspection', 'keepBusy', 'setupExternal', 'breakCover'],
    hypothesisEnabled: true,
    showLoadLens: false,
    speedOptions: SPEEDS,
    refProfit: 650,
    refWip: 14,
    revealConstraint: null,
  },

  // ------------------------------------------------------------------ FASE 2
  {
    id: 'fase2',
    mode: 'desafio',
    number: 2,
    title: 'O Caldeirão Nunca Para',
    subtitle: 'Segundo Círculo — Explorar',
    tocStep: '2. Explorar a restrição',
    goalText: 'Tire o máximo do caldeirão que você já tem — sem comprar nada.',
    scenario: scenario({
      id: 'fase2',
      seed: 777,
      demand: { ...baseDemand, ordersPerMin: 3.3 },
      stations: { caldeirao: { breakEvery: 45, breakDuration: 9, setupTime: 3 } },
      policies: { release: 'corda', drum: 'caldeirao', bufferSize: 1, priority: 'fifo', inspection: 'final', autoAccept: true, autoReorder: true },
    }),
    objectives: [
      { kind: 'delivered', target: 24, label: 'Entregar pelo menos 24 poções' },
      { kind: 'netProfit', target: 550, label: 'Lucro líquido do dia de pelo menos 550 moedas' },
      { kind: 'reputation', target: 1, label: 'Manter a reputação acima de zero' },
    ],
    intro: [
      { who: 'mentora', text: 'Segundo Círculo. Já sabemos que o caldeirão manda no ritmo da loja. Um minuto perdido no caldeirão é um minuto perdido da loja inteira.' },
      { who: 'mentora', text: 'E ele perde muitos minutos: espera a bancada preparar cada kit, para para limpeza, a equipe sai para o chá e ainda ferve poção que vai ser reprovada no fim.' },
      { who: 'protagonista', text: 'Posso comprar outro caldeirão?' },
      { who: 'mentora', text: 'Ainda não. Antes de gastar, aproveite o que você já tem. Clique no caldeirão e veja para onde vai o tempo dele. As decisões estão no painel Fluxo e na própria estação.' },
    ],
    outroWin: [
      { who: 'mentora', text: 'Viu? Mesmo caldeirão, mesma equipe, mais poções entregues. A capacidade estava lá — só estava sendo desperdiçada.' },
    ],
    outroLose: [
      { who: 'mentora', text: 'O caldeirão continuou parando por motivos evitáveis. Abra o painel do caldeirão e veja quanto tempo ele passa ocioso, limpando ou em pausa.' },
    ],
    concept:
      'Explorar a restrição é tirar o máximo dela sem investir: nunca deixá-la sem trabalho (pulmão), tirar dela tarefas que outros podem fazer (preparação em paralelo), cobrir pausas, não gastar seu tempo com itens defeituosos e priorizar o que gera mais ganho por minuto dela.',
    question: {
      question: 'Por que vale a pena pagar uma aprendiz extra para limpar o caldeirão em paralelo, mas não para limpar a bancada de preparo?',
      options: [
        'Porque o caldeirão é mais caro.',
        'Porque um minuto ganho no caldeirão vira um minuto a mais para a loja inteira; um minuto ganho no preparo, que já tem folga, não muda as entregas.',
        'Porque a bancada de preparo nunca precisa de limpeza.',
      ],
      correct: 1,
      explanation:
        'O ganho da loja é limitado pela restrição. Acelerar um recurso com folga só aumenta a folga dele; acelerar a restrição aumenta as entregas de todos.',
    },
    lockedPolicies: ['release', 'drum', 'keepBusy'],
    hypothesisEnabled: false,
    showLoadLens: true,
    speedOptions: SPEEDS,
    refProfit: 800,
    refWip: 6,
    revealConstraint: 'caldeirao',
  },

  // ------------------------------------------------------------------ FASE 3
  {
    id: 'fase3',
    mode: 'desafio',
    number: 3,
    title: 'A Rebelião dos Aprendizes',
    subtitle: 'Terceiro Círculo — Subordinar',
    tocStep: '3. Subordinar tudo à restrição',
    goalText: 'Faça a loja inteira trabalhar no ritmo do caldeirão e controle o estoque em processo.',
    scenario: scenario({
      id: 'fase3',
      seed: 3003,
      demand: { ...baseDemand, ordersPerMin: 3.6 },
      stations: { caldeirao: { breakEvery: 45, breakDuration: 9, setupTime: 3 } },
      wipHoldingCost: 0.08,
      spoilTime: 45,
      policies: {
        release: 'empurrar',
        drum: 'caldeirao',
        bufferSize: 4,
        priority: 'ganho',
        inspection: 'entrada',
        keepBusy: true,
        setupExternal: { caldeirao: true },
        breakCover: { caldeirao: true },
        autoAccept: true,
        autoReorder: true,
      },
    }),
    objectives: [
      { kind: 'avgWip', target: 9, label: 'Estoque em processo médio de no máximo 9 poções' },
      { kind: 'netProfit', target: 500, label: 'Lucro líquido do dia de pelo menos 500 moedas' },
      { kind: 'canceled', target: 2, label: 'No máximo 2 pedidos cancelados' },
    ],
    intro: [
      { who: 'aprendiz', text: 'Vó, organizei tudo! Agora ninguém fica parado: assim que um pedido chega a gente já prepara tudo, e quando não tem pedido a gente adianta Poção de Cura!' },
      { who: 'mentora', text: 'Hmm. E onde está tudo isso que vocês adiantaram, Tico?' },
      { who: 'aprendiz', text: '…na frente do caldeirão. Esperando. Algumas ervas murcharam.' },
      { who: 'mentora', text: 'Lina, o caldeirão já está bem explorado. Agora o resto da loja precisa seguir o ritmo dele. No painel Fluxo você decide como o trabalho é liberado.' },
    ],
    outroWin: [
      { who: 'mentora', text: 'A bancada agora fica ociosa às vezes — e está tudo bem! Ela trabalha no compasso do caldeirão. Menos poção parada, menos erva murcha, pedidos mais rápidos.' },
    ],
    outroLose: [
      { who: 'mentora', text: 'Poções demais esperando na frente do caldeirão. Produzir mais do que a restrição consegue processar só cria fila, desperdício e atraso.' },
    ],
    concept:
      'Subordinar é fazer todos os recursos não-restritivos trabalharem para sustentar a restrição, e não para se manter ocupados. O sistema tambor-pulmão-corda libera trabalho no ritmo do tambor (a restrição), mantendo só um pequeno pulmão na frente dela.',
    question: {
      question: 'Depois de amarrar a corda ao caldeirão, a bancada de preparo passou a ficar parada parte do dia. O que isso significa?',
      options: [
        'Que a bancada tem gente demais e deve ser fechada.',
        'Que é desperdício: ela deveria continuar adiantando poções.',
        'Que ela tem capacidade de sobra; ficar ociosa é melhor do que produzir estoque que a restrição não consegue processar.',
      ],
      correct: 2,
      explanation:
        'Ociosidade num recurso não-restritivo é esperada. A produção extra não aumentaria as entregas (o caldeirão continuaria no mesmo ritmo) e só criaria filas, ingredientes murchos e custos de estoque.',
    },
    lockedPolicies: [],
    hypothesisEnabled: false,
    showLoadLens: true,
    speedOptions: SPEEDS,
    refProfit: 850,
    refWip: 6,
    revealConstraint: 'caldeirao',
  },

  // ------------------------------------------------------------------ FASE 4
  {
    id: 'fase4',
    mode: 'desafio',
    number: 4,
    title: 'O Grande Investimento',
    subtitle: 'Quarto Círculo — Elevar',
    tocStep: '4. Elevar a restrição',
    goalText: 'A procura aumentou. Decida se, onde e quando investir para atender mais clientes.',
    scenario: scenario({
      id: 'fase4',
      seed: 4004,
      startCash: 650,
      demand: { ...baseDemand, ordersPerMin: 4.7, mix: { cura: 0.5, visao: 0.3, transformacao: 0.2 } },
      stations: { caldeirao: { breakEvery: 45, breakDuration: 9, setupTime: 3 } },
      wipHoldingCost: 0.06,
      spoilTime: 45,
      policies: {
        release: 'corda',
        drum: 'caldeirao',
        bufferSize: 4,
        priority: 'ganho',
        inspection: 'entrada',
        keepBusy: false,
        setupExternal: { caldeirao: true },
        breakCover: { caldeirao: true },
        autoAccept: true,
        autoReorder: true,
      },
      upgrades: ['caldeirao_extra', 'cristal_fervura', 'alambique_duplo', 'serpentina_gelo', 'embaladora_encantada', 'bancada_extra'],
      events: [{ at: 20, kind: 'feira', recipe: 'visao', duration: 60 }],
    }),
    objectives: [
      { kind: 'delivered', target: 37, label: 'Entregar pelo menos 37 poções' },
      { kind: 'netProfit', target: 900, label: 'Lucro líquido do dia de pelo menos 900 moedas' },
      { kind: 'cash', target: 1000, label: 'Terminar o dia com pelo menos 1000 moedas em caixa' },
    ],
    intro: [
      { who: 'comerciante', text: 'Lina, querida! A notícia correu: a loja Brasaverde voltou. Trouxe catálogo de equipamentos — tudo de primeira, parcelamento em três luas.' },
      { who: 'mentora', text: 'A procura cresceu e o caldeirão já está explorado e com a loja subordinada a ele. Agora sim faz sentido pensar em aumentar a capacidade.' },
      { who: 'mentora', text: 'Mas cada moeda gasta precisa voltar. Compare preço, custo de operação e quanto a melhoria aumenta as entregas. E depois de investir… olhe de novo para a loja.' },
    ],
    outroWin: [
      { who: 'mentora', text: 'Bom investimento. Repare na Análise: depois que o caldeirão ganhou capacidade, a carga da destilação subiu muito. O elo mais fraco da corrente está mudando de lugar.' },
    ],
    outroLose: [
      { who: 'mentora', text: 'O dinheiro saiu, mas as entregas não acompanharam. Investimento só aumenta o ganho da loja quando aumenta a capacidade da restrição.' },
    ],
    concept:
      'Elevar a restrição é aumentar sua capacidade com investimento (equipamento, pessoas, tecnologia). Só vale depois de explorar e subordinar, e só se o ganho extra pagar o investimento e a despesa adicional. Investir fora da restrição quase não muda as entregas.',
    question: {
      question: 'Você comprou outro caldeirão, mas a quantidade de pedidos entregues não aumentou na mesma proporção. Qual a explicação mais provável?',
      options: [
        'O caldeirão novo veio com defeito.',
        'Outra etapa (a destilação) passou a limitar o sistema: a restrição mudou de lugar.',
        'Os clientes ficaram com medo do caldeirão novo.',
      ],
      correct: 1,
      explanation:
        'Ao elevar a restrição, a capacidade dela pode ultrapassar a de outra estação. A partir daí, o ganho é limitado pela nova restrição — é o momento de voltar ao passo 1.',
    },
    lockedPolicies: [],
    hypothesisEnabled: false,
    showLoadLens: true,
    speedOptions: SPEEDS,
    refProfit: 1100,
    refWip: 7,
    revealConstraint: 'caldeirao',
  },

  // ------------------------------------------------------------------ FASE 5
  {
    id: 'fase5',
    mode: 'desafio',
    number: 5,
    title: 'A Nova Maldição',
    subtitle: 'Quinto Círculo — Recomeçar',
    tocStep: '5. Voltar ao passo 1',
    goalText: 'A loja mudou. Encontre a nova restrição, amarre a loja a ela e volte a lucrar.',
    scenario: scenario({
      id: 'fase5',
      seed: 5005,
      startCash: 600,
      recipes: ['cura', 'visao', 'transformacao', 'precisao'],
      demand: { ordersPerMin: 4.4, mix: { cura: 0.3, visao: 0.35, transformacao: 0.15, precisao: 0.2 }, maxLines: 2, qtyMin: 1, qtyMax: 2 },
      stations: { caldeirao: { breakEvery: 45, breakDuration: 9, setupTime: 3 }, destilacao: { setupTime: 2, breakEvery: 50, breakDuration: 8 } },
      ownedUpgrades: ['caldeirao_extra'],
      wipHoldingCost: 0.06,
      spoilTime: 45,
      policies: {
        release: 'corda',
        drum: 'caldeirao',
        bufferSize: 4,
        priority: 'fifo',
        inspection: 'entrada',
        keepBusy: false,
        setupExternal: { caldeirao: true },
        breakCover: { caldeirao: true },
        autoAccept: true,
        autoReorder: true,
      },
      upgradesNeedHypothesis: true,
      upgrades: ['alambique_duplo', 'alquimista_destilacao', 'serpentina_gelo', 'embaladora_encantada', 'cristal_fervura', 'bancada_extra'],
      events: [{ at: 90, kind: 'cristal_temporario', duration: 45 }],
    }),
    objectives: [
      { kind: 'hypothesis', target: 1, label: 'Identificar a nova restrição' },
      { kind: 'netProfit', target: 900, label: 'Lucro líquido do dia de pelo menos 900 moedas' },
      { kind: 'canceled', target: 3, label: 'No máximo 3 pedidos cancelados' },
    ],
    intro: [
      { who: 'narrador', text: 'Uma semana depois. O segundo caldeirão borbulha ao lado do ancestral. E uma maldição nova chegou à cidade: todos querem o Elixir de Precisão Arcana.' },
      { who: 'aprendiz', text: 'Vó, a corda está amarrada no caldeirão e mesmo assim tem fila enorme em algum lugar!' },
      { who: 'mentora', text: 'A loja mudou, Lina. A solução de ontem pode ser o problema de hoje. Quem limita a loja agora? Investigue, registre sua hipótese e reorganize tudo em torno da resposta.' },
    ],
    outroWin: [
      { who: 'mentora', text: 'Você encontrou o novo elo fraco e reorganizou a loja em volta dele. É assim para sempre: identificar, explorar, subordinar, elevar… e recomeçar.' },
      { who: 'protagonista', text: 'Então o trabalho nunca termina?' },
      { who: 'mentora', text: 'Nunca. Isso se chama melhoria contínua. E é por isso que a loja de uma bruxa é sempre interessante.' },
    ],
    outroLose: [
      { who: 'mentora', text: 'A corda continuou amarrada no lugar antigo. Quando a restrição muda, todas as decisões tomadas em torno dela precisam ser revistas.' },
    ],
    concept:
      'Quando uma restrição é elevada, outra assume seu lugar. A inércia — continuar gerenciando a loja em torno da restrição antiga — é o maior perigo. O ciclo recomeça no passo 1.',
    question: {
      question: 'Depois de identificar a destilação como nova restrição, o que deveria mudar primeiro?',
      options: [
        'Comprar imediatamente mais um caldeirão, que funcionou da última vez.',
        'Amarrar a corda (tambor) à destilação e priorizar as poções que geram mais ganho por minuto de destilação.',
        'Aumentar o pulmão do caldeirão para 20 poções.',
      ],
      correct: 1,
      explanation:
        'O tambor precisa ser a restrição atual. Antes de investir de novo, explore a nova restrição (prioridade por ganho por minuto dela, pulmão, sem desperdício) e subordine o resto a ela.',
    },
    lockedPolicies: [],
    hypothesisEnabled: true,
    showLoadLens: false,
    speedOptions: SPEEDS,
    refProfit: 1200,
    refWip: 8,
    revealConstraint: null,
  },

  // ------------------------------------------------------------------ BRUXA MESTRA
  {
    id: 'mestra',
    mode: 'mestra',
    number: 6,
    title: 'Bruxa Mestra',
    subtitle: 'Um dia imprevisível',
    tocStep: 'Todos os passos, em ciclo',
    goalText: 'Um dia longo com demanda instável, eventos e orçamento apertado. Mantenha a loja lucrativa.',
    scenario: scenario({
      id: 'mestra',
      seed: 9091,
      duration: 540,
      startCash: 500,
      startReputation: 55,
      recipes: ['cura', 'visao', 'transformacao', 'precisao'],
      demand: { ordersPerMin: 3.2, mix: { cura: 0.45, visao: 0.3, transformacao: 0.15, precisao: 0.1 }, maxLines: 2, qtyMin: 1, qtyMax: 2 },
      stations: {
        caldeirao: { breakEvery: 45, breakDuration: 9, setupTime: 3 },
        embalagem: { breakEvery: 60, breakDuration: 8 },
      },
      wipHoldingCost: 0.06,
      spoilTime: 45,
      policies: { release: 'empurrar', drum: 'preparo', bufferSize: 4, priority: 'fifo', inspection: 'final', keepBusy: false, autoAccept: true, autoReorder: true },
      upgradesNeedHypothesis: true,
      upgrades: ['caldeirao_extra', 'cristal_fervura', 'alambique_duplo', 'alquimista_destilacao', 'serpentina_gelo', 'embaladora_encantada', 'bancada_extra'],
      dynamicEvents: { enabled: true, intensity: 1 },
      events: [
        { at: 200, kind: 'mudanca_demanda', demand: { ordersPerMin: 3.8, mix: { cura: 0.25, visao: 0.3, transformacao: 0.15, precisao: 0.3 } } },
        { at: 380, kind: 'mudanca_demanda', demand: { ordersPerMin: 3.4, mix: { cura: 0.4, visao: 0.25, transformacao: 0.25, precisao: 0.1 } } },
      ],
    }),
    objectives: [
      { kind: 'netProfit', target: 1300, label: 'Lucro líquido do dia de pelo menos 1300 moedas' },
      { kind: 'reputation', target: 40, label: 'Terminar com reputação de pelo menos 40' },
      { kind: 'canceled', target: 4, label: 'No máximo 4 pedidos cancelados' },
    ],
    intro: [
      { who: 'mentora', text: 'Hoje eu não vou dizer nada, Bruxa Mestra. A demanda vai mudar, o tempo vai fechar e alguém vai pedir uma poção impossível.' },
      { who: 'mentora', text: 'Você tem os cinco passos. Use-os quantas vezes precisar.' },
    ],
    outroWin: [{ who: 'mentora', text: 'Um dia inteiro de caos, e a loja terminou de pé e lucrando. Você não precisa mais de mim, Bruxa Mestra.' }],
    outroLose: [{ who: 'mentora', text: 'O caos venceu hoje. Reveja a Análise: quando a demanda mudou, a restrição mudou junto?' }],
    concept:
      'Em ambientes instáveis, a restrição pode mudar com a demanda, com eventos e com as próprias melhorias. Gerenciar pela restrição é um ciclo contínuo de observação e ajuste.',
    question: {
      question: 'Às 200 segundos a demanda passou a ter muito mais Elixir de Precisão. Qual estação tende a se tornar a restrição?',
      options: ['O caldeirão, pois toda poção passa por ele.', 'A destilação, porque a Precisão a usa intensamente (e não usa o caldeirão).', 'O balcão.'],
      correct: 1,
      explanation:
        'A Precisão Arcana leva 14 s na destilação e não passa pelo caldeirão. Quando o mix muda, a carga das estações muda — e com ela, a restrição.',
    },
    lockedPolicies: [],
    hypothesisEnabled: true,
    showLoadLens: false,
    speedOptions: SPEEDS,
    refProfit: 1600,
    refWip: 9,
    revealConstraint: null,
  },
];

export function getPhase(id: string): PhaseDef {
  const p = PHASES.find((x) => x.id === id);
  if (!p) throw new Error('Fase desconhecida: ' + id);
  return p;
}
