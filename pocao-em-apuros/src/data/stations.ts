import type { StationDef, StationId } from '../sim/types';

// Parâmetros-base das estações. Os cenários de cada fase ajustam estes valores.
export const STATION_ORDER: StationId[] = ['preparo', 'caldeirao', 'destilacao', 'resfriamento', 'embalagem', 'balcao'];

export const STATIONS: Record<StationId, StationDef> = {
  preparo: {
    id: 'preparo',
    name: 'Bancada de Ingredientes',
    short: 'Preparo',
    verb: 'separa, corta e mói',
    description: 'Separa, corta e mói ervas, cristais e raízes. É aqui que a poção começa a existir.',
    slots: 2,
    costPerSec: 0.25,
    setupTime: 0,
    breakEvery: 0,
    breakDuration: 0,
  },
  caldeirao: {
    id: 'caldeirao',
    name: 'Caldeirão Ancestral',
    short: 'Caldeirão',
    verb: 'mistura e cozinha',
    description: 'Mistura e cozinha a base de todas as poções que levam fervura. Precisa ser limpo entre um lote e outro.',
    slots: 1,
    costPerSec: 0.3,
    setupTime: 3,
    breakEvery: 0,
    breakDuration: 0,
  },
  destilacao: {
    id: 'destilacao',
    name: 'Mesa de Destilação',
    short: 'Destilação',
    verb: 'concentra e refina',
    description: 'Um alambique de cobre que concentra e refina elixires mais delicados.',
    slots: 1,
    costPerSec: 0.3,
    setupTime: 0,
    breakEvery: 0,
    breakDuration: 0,
  },
  resfriamento: {
    id: 'resfriamento',
    name: 'Estação de Resfriamento',
    short: 'Resfriamento',
    verb: 'estabiliza e verifica',
    description: 'Bacias de gelo lunar estabilizam as poções. Aqui também acontece a verificação final de qualidade.',
    slots: 2,
    costPerSec: 0.15,
    setupTime: 0,
    breakEvery: 0,
    breakDuration: 0,
  },
  embalagem: {
    id: 'embalagem',
    name: 'Bancada de Embalagem',
    short: 'Embalagem',
    verb: 'envasa e etiqueta',
    description: 'Coloca cada poção no frasco certo, aplica o lacre e a etiqueta.',
    slots: 1,
    costPerSec: 0.15,
    setupTime: 0,
    breakEvery: 0,
    breakDuration: 0,
  },
  balcao: {
    id: 'balcao',
    name: 'Balcão de Atendimento',
    short: 'Balcão',
    verb: 'atende e entrega',
    description: 'Registra pedidos, recebe clientes e entrega as poções prontas.',
    slots: 1,
    costPerSec: 0.15,
    setupTime: 0,
    breakEvery: 0,
    breakDuration: 0,
  },
};

// Custos das políticas de exploração (por segundo de simulação, por estação).
export const POLICY_COSTS = {
  setupExternal: 0.12, // aprendiz extra limpando/carregando em paralelo
  breakCover: 0.15, // cobertura de intervalos
  inspectionEntryExtra: 1.5, // segundos extras no preparo por poção
  helperBonus: 1.2, // multiplicador de velocidade quando a protagonista ajuda
};
