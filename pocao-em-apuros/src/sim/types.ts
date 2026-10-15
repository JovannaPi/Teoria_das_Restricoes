// Tipos centrais da simulação. Tudo aqui é dado puro (serializável em JSON),
// para que o estado possa ser salvo, carregado e testado sem a interface.

export type StationId = 'preparo' | 'caldeirao' | 'destilacao' | 'resfriamento' | 'embalagem' | 'balcao';
export type RecipeId = 'cura' | 'visao' | 'transformacao' | 'precisao' | 'brilho';
export type IngredientId =
  | 'erva'
  | 'agua_lunar'
  | 'cogumelo'
  | 'essencia_sombria'
  | 'raiz'
  | 'po_cristal'
  | 'essencia_rara'
  | 'tinta_runica';

export type PriorityRule = 'fifo' | 'prazo' | 'ganho';
export type ReleaseMode = 'empurrar' | 'corda';
export type InspectionPoint = 'final' | 'entrada';

export interface StationDef {
  id: StationId;
  name: string;
  short: string;
  description: string;
  verb: string; // o que a estação faz ("mistura", "destila"...)
  slots: number;
  costPerSec: number; // despesa operacional (pessoal + manutenção)
  setupTime: number; // preparação por lote (s)
  breakEvery: number; // 0 = sem pausas
  breakDuration: number;
}

export interface RouteStep {
  station: StationId;
  time: number; // segundos de simulação por poção
}

export interface RecipeDef {
  id: RecipeId;
  name: string;
  short: string;
  flavor: string;
  ingredients: Partial<Record<IngredientId, number>>;
  route: RouteStep[];
  price: number;
  dueTime: number; // prazo base em segundos de simulação
  latePenalty: number; // fração do preço perdida quando atrasa
  defectRate: number; // chance de o lote de ingredientes vir defeituoso
  processFailRate: number; // chance de a mistura desandar no caldeirão
  color: string; // cor do líquido
}

export interface IngredientDef {
  id: IngredientId;
  name: string;
  unitCost: number;
  reorderPoint: number;
  reorderQty: number;
}

export interface StationParams {
  slots: number;
  speedMult: number;
  setupTime: number;
  breakEvery: number;
  breakDuration: number;
  costPerSec: number;
  locked: boolean; // estação indisponível no cenário
}

export interface DemandConfig {
  ordersPerMin: number;
  mix: Partial<Record<RecipeId, number>>;
  maxLines: number; // receitas diferentes por pedido (1 ou 2)
  qtyMin: number;
  qtyMax: number;
}

export interface Policies {
  release: ReleaseMode;
  drum: StationId; // tambor escolhido pelo jogador
  bufferSize: number; // pulmão (poções liberadas que ainda não passaram pelo tambor)
  priority: PriorityRule;
  inspection: InspectionPoint;
  keepBusy: boolean; // aprendizes produzem antecipadamente quando ociosos
  setupExternal: Partial<Record<StationId, boolean>>;
  breakCover: Partial<Record<StationId, boolean>>;
  autoAccept: boolean;
  autoReorder: boolean;
}

export type PolicyKey = keyof Policies;

export type UpgradeId =
  | 'caldeirao_extra'
  | 'cristal_fervura'
  | 'alambique_duplo'
  | 'alquimista_destilacao'
  | 'serpentina_gelo'
  | 'embaladora_encantada'
  | 'bancada_extra';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  station: StationId;
  price: number;
  installTime: number;
  stopsStation: boolean; // a estação para durante a instalação
  opCostPerSec: number; // aumento da despesa operacional
  lifeDays: number; // vida útil (para depreciação)
  effect: { slots?: number; speedMult?: number };
}

export type EventKind =
  | 'tempestade'
  | 'manutencao'
  | 'cliente_vip'
  | 'lote_ruim'
  | 'feira'
  | 'aprendiz_ausente'
  | 'desconto'
  | 'cristal_temporario'
  | 'mudanca_demanda';

export interface ScheduledEvent {
  at: number;
  kind: EventKind;
  station?: StationId;
  recipe?: RecipeId;
  ingredient?: IngredientId;
  duration?: number;
  demand?: Partial<DemandConfig>;
  message?: string;
}

export interface ActiveEvent {
  id: number;
  kind: EventKind;
  start: number;
  end: number;
  station?: StationId;
  recipe?: RecipeId;
  ingredient?: IngredientId;
  title: string;
  text: string;
}

export interface ScenarioDef {
  id: string;
  seed: number;
  duration: number; // segundos de simulação do dia
  startCash: number;
  startReputation: number;
  stations: Partial<Record<StationId, Partial<StationParams>>>;
  recipes: RecipeId[];
  demand: DemandConfig;
  startStock: Partial<Record<IngredientId, number>>;
  supplierLeadTime: number;
  policies: Partial<Policies>;
  upgrades: UpgradeId[];
  upgradesNeedHypothesis?: boolean; // melhorias só liberadas após identificar a restrição
  ownedUpgrades?: UpgradeId[];
  events: ScheduledEvent[];
  dynamicEvents?: { enabled: boolean; intensity: number };
  wipHoldingCost: number; // por poção em processo por segundo
  spoilTime: number; // 0 = ingredientes preparados não estragam
  graceTime: number; // tolerância após o prazo antes de o cliente desistir
  acceptWindow: number; // quanto tempo o cliente espera a aceitação
  rentPerSec: number;
  firstArrival: number;
}

export interface StationState {
  id: StationId;
  slots: number;
  speedMult: number;
  setupTime: number;
  breakEvery: number;
  breakDuration: number;
  costPerSec: number;
  locked: boolean;
  queue: number[];
  active: ActiveTask[];
  paused: boolean;
  nextBreakAt: number;
  breakUntil: number;
  downUntil: number;
  downReason: string;
  // acumuladores (segundos-slot)
  busyTime: number;
  setupSpent: number;
  starvedTime: number;
  stoppedTime: number;
  processed: number;
  maxQueue: number;
  installing: { upgrade: UpgradeId; until: number } | null;
}

export interface ActiveTask {
  job: number;
  setupLeft: number;
  remaining: number;
  total: number;
}

export type JobLocation = 'fila' | 'processo' | 'prateleira';

export interface Job {
  id: number;
  recipe: RecipeId;
  orderId: number | null;
  step: number;
  location: JobLocation;
  station: StationId | null;
  defect: 'nenhum' | 'ingrediente' | 'processo';
  releasedAt: number;
  queuedAt: number;
  speculative: boolean;
  materialCost: number;
  spoiled: boolean;
  boosted: boolean; // priorizada manualmente pelo jogador
}

export type OrderStatus = 'aguardando' | 'aceito' | 'concluido' | 'cancelado' | 'recusado' | 'desistiu';

export interface OrderLine {
  recipe: RecipeId;
  qty: number;
  delivered: number;
}

export interface Order {
  id: number;
  client: ClientLook;
  lines: OrderLine[];
  status: OrderStatus;
  arrivedAt: number;
  acceptBy: number;
  acceptedAt: number;
  dueAt: number;
  closedAt: number;
  revenue: number;
  late: boolean;
  vip: boolean;
  priceMult: number;
}

export interface ClientLook {
  name: string;
  species: number;
  palette: number;
  seed: number;
}

export interface Accounting {
  revenue: number;
  ctvSold: number; // custo totalmente variável das unidades vendidas
  materialsPurchased: number;
  scrapCost: number; // materiais perdidos em refugo (despesa)
  opCash: number; // despesas operacionais pagas em dinheiro
  wipHolding: number; // parte do opCash: manutenção do estoque em processo
  depreciation: number;
  equipment: number; // valor investido em equipamentos
  lostToLateness: number; // receita perdida por atrasos
}

export interface Stats {
  delivered: number;
  deliveredOnTime: number;
  deliveredLate: number;
  ordersCompleted: number;
  ordersCanceled: number;
  ordersRefused: number;
  ordersExpired: number;
  ordersArrived: number;
  failures: number;
  failuresCaughtEarly: number;
  spoiled: number;
  speculativeMade: number;
  released: number;
  wipIntegral: number;
  maxWip: number;
  leadTimeSum: number;
  leadTimeCount: number;
  orderLeadSum: number;
  orderLeadCount: number;
  starvedForIngredients: number; // segundos em que algum pedido não pôde ser liberado por falta de ingredientes
}

export interface Series {
  t: number[];
  delivered: number[];
  wip: number[];
  cash: number[];
  throughput: number[]; // ganho acumulado
  queues: Record<StationId, number[]>;
  busy: Record<StationId, number[]>; // busyTime acumulado (para utilização por janela)
}

export interface DecisionRecord {
  t: number;
  kind: string;
  label: string;
  station?: StationId;
  deliveredBefore: number; // entregas nos 60s anteriores
  deliveredAfter: number | null; // entregas nos 60s seguintes (preenchido depois)
  wipBefore: number;
  wipAfter: number | null;
  onConstraint: boolean | null;
}

export interface Hypothesis {
  t: number;
  station: StationId | 'mercado';
  resolveAt: number;
  correct: boolean | null;
  truth: StationId | 'mercado' | null;
  evidence: string[];
}

export interface PendingDelivery {
  ingredient: IngredientId;
  qty: number;
  arriveAt: number;
  cost: number;
}

export interface LogEntry {
  t: number;
  kind: 'info' | 'bom' | 'ruim' | 'evento' | 'decisao';
  text: string;
}

// Notificações transitórias para a camada visual/sonora (não afetam regras).
export type SimNotice =
  | { type: 'job-move'; job: number; recipe: RecipeId; from: StationId | null; to: StationId | 'prateleira' }
  | { type: 'job-start'; station: StationId; recipe: RecipeId }
  | { type: 'job-done'; station: StationId; recipe: RecipeId }
  | { type: 'delivered'; order: number; recipe: RecipeId; amount: number; late: boolean }
  | { type: 'order-arrived'; order: number }
  | { type: 'order-accepted'; order: number }
  | { type: 'order-closed'; order: number; status: OrderStatus }
  | { type: 'failure'; station: StationId; recipe: RecipeId; reason: string }
  | { type: 'stock-arrived'; ingredient: IngredientId; qty: number }
  | { type: 'event'; event: ActiveEvent }
  | { type: 'upgrade-ready'; upgrade: UpgradeId; station: StationId }
  | { type: 'hypothesis'; correct: boolean; station: StationId | 'mercado' }
  | { type: 'decision-needed'; kind: 'cristal'; eventId: number };

export interface SimState {
  version: number;
  scenarioId: string;
  t: number;
  duration: number;
  finished: boolean;
  rngDemand: number;
  rngProc: number;
  cash: number;
  startCash: number;
  reputation: number;
  stock: Record<IngredientId, number>;
  stockValue: Record<IngredientId, number>; // custo médio acumulado do estoque
  pending: PendingDelivery[];
  supplierLeadTime: number;
  stations: Record<StationId, StationState>;
  jobs: Record<number, Job>;
  nextJobId: number;
  orders: Record<number, Order>;
  nextOrderId: number;
  nextArrivalAt: number;
  recipes: RecipeId[];
  demand: DemandConfig;
  policies: Policies;
  helper: StationId | null;
  upgradesOwned: { id: UpgradeId; activeAt: number; applied: boolean }[];
  upgradesAvailable: UpgradeId[];
  upgradesNeedHypothesis: boolean;
  acct: Accounting;
  stats: Stats;
  series: Series;
  nextSampleAt: number;
  events: ActiveEvent[];
  scheduled: ScheduledEvent[];
  nextEventId: number;
  dynamicEvents: { enabled: boolean; intensity: number; nextAt: number };
  pendingCrystal: number | null; // evento aguardando escolha de estação
  log: LogEntry[];
  decisions: DecisionRecord[];
  hypotheses: Hypothesis[];
  deliveryTimes: number[];
  wipHoldingCost: number;
  spoilTime: number;
  graceTime: number;
  acceptWindow: number;
  rentPerSec: number;
  notices: SimNotice[];
}
