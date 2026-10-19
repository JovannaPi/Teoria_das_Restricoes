import type { IngredientDef, IngredientId, RecipeDef, RecipeId } from '../sim/types';

export const INGREDIENTS: Record<IngredientId, IngredientDef> = {
  erva: { id: 'erva', name: 'Erva curativa', unitCost: 3, reorderPoint: 8, reorderQty: 14 },
  agua_lunar: { id: 'agua_lunar', name: 'Água lunar', unitCost: 2, reorderPoint: 8, reorderQty: 14 },
  cogumelo: { id: 'cogumelo', name: 'Cogumelo luminoso', unitCost: 5, reorderPoint: 6, reorderQty: 10 },
  essencia_sombria: { id: 'essencia_sombria', name: 'Essência sombria', unitCost: 6, reorderPoint: 5, reorderQty: 8 },
  raiz: { id: 'raiz', name: 'Raiz metamórfica', unitCost: 9, reorderPoint: 4, reorderQty: 6 },
  po_cristal: { id: 'po_cristal', name: 'Pó de cristal', unitCost: 7, reorderPoint: 5, reorderQty: 8 },
  essencia_rara: { id: 'essencia_rara', name: 'Essência rara', unitCost: 14, reorderPoint: 3, reorderQty: 5 },
  tinta_runica: { id: 'tinta_runica', name: 'Tinta rúnica', unitCost: 6, reorderPoint: 4, reorderQty: 6 },
};

export const INGREDIENT_ORDER: IngredientId[] = [
  'erva',
  'agua_lunar',
  'cogumelo',
  'essencia_sombria',
  'raiz',
  'po_cristal',
  'essencia_rara',
  'tinta_runica',
];

// Tempos em segundos de simulação (1 s de simulação = 2 minutos no relógio da loja).
export const RECIPES: Record<RecipeId, RecipeDef> = {
  // receita única do modo rápido: quatro estações, sem resfriar nem embalar
  brilho: {
    id: 'brilho',
    name: 'Poção do Brilho',
    short: 'Brilho',
    flavor: 'Ilumina a casa por uma noite inteira. A favorita da cidade.',
    ingredients: { erva: 1, agua_lunar: 1 },
    route: [
      { station: 'preparo', time: 4 },
      { station: 'caldeirao', time: 8 },
      { station: 'destilacao', time: 8 },
      { station: 'balcao', time: 2 },
    ],
    price: 40,
    dueTime: 90,
    latePenalty: 0.4,
    defectRate: 0,
    processFailRate: 0,
    color: '#f2c14e',
  },
  cura: {
    id: 'cura',
    name: 'Poção de Cura Menor',
    short: 'Cura',
    flavor: 'O remédio de todo dia. Barata, rápida e sempre procurada.',
    ingredients: { erva: 2, agua_lunar: 1 },
    route: [
      { station: 'preparo', time: 5 },
      { station: 'caldeirao', time: 7 },
      { station: 'resfriamento', time: 8 },
      { station: 'embalagem', time: 4 },
      { station: 'balcao', time: 2 },
    ],
    price: 34,
    dueTime: 75,
    latePenalty: 0.4,
    defectRate: 0.04,
    processFailRate: 0.0,
    color: '#e0566b',
  },
  visao: {
    id: 'visao',
    name: 'Elixir da Visão Noturna',
    short: 'Visão',
    flavor: 'Faz enxergar no escuro por uma noite inteira. Corujas ficam com inveja.',
    ingredients: { cogumelo: 2, essencia_sombria: 1 },
    route: [
      { station: 'preparo', time: 6 },
      { station: 'caldeirao', time: 9 },
      { station: 'destilacao', time: 12 },
      { station: 'resfriamento', time: 9 },
      { station: 'embalagem', time: 4 },
      { station: 'balcao', time: 2 },
    ],
    price: 82,
    dueTime: 100,
    latePenalty: 0.4,
    defectRate: 0.06,
    processFailRate: 0.03,
    color: '#4cc7b8',
  },
  transformacao: {
    id: 'transformacao',
    name: 'Poção de Transformação',
    short: 'Transformação',
    flavor: 'Transforma quem bebe em outra criatura por uma hora. Exige precisão absoluta.',
    ingredients: { raiz: 1, po_cristal: 1, essencia_rara: 1 },
    route: [
      { station: 'preparo', time: 8 },
      { station: 'caldeirao', time: 12 },
      { station: 'destilacao', time: 9 },
      { station: 'resfriamento', time: 12 },
      { station: 'embalagem', time: 6 },
      { station: 'balcao', time: 2 },
    ],
    price: 160,
    dueTime: 130,
    latePenalty: 0.4,
    defectRate: 0.12,
    processFailRate: 0.05,
    color: '#9b6bdf',
  },
  precisao: {
    id: 'precisao',
    name: 'Elixir de Precisão Arcana',
    short: 'Precisão',
    flavor: 'Encomenda especial de magos-arquitetos. Não ferve: é destilado gota a gota sobre runas.',
    ingredients: { po_cristal: 1, tinta_runica: 1, essencia_sombria: 1 },
    route: [
      { station: 'preparo', time: 7 },
      { station: 'destilacao', time: 16 },
      { station: 'resfriamento', time: 6 },
      { station: 'embalagem', time: 8 },
      { station: 'balcao', time: 2 },
    ],
    price: 150,
    dueTime: 120,
    latePenalty: 0.4,
    defectRate: 0.05,
    processFailRate: 0.0,
    color: '#f2b13c',
  },
};

export const RECIPE_ORDER: RecipeId[] = ['cura', 'visao', 'transformacao', 'precisao'];

export function materialCost(recipe: RecipeId, priceMult: (i: IngredientId) => number = () => 1): number {
  const r = RECIPES[recipe];
  let c = 0;
  for (const [ing, q] of Object.entries(r.ingredients) as [IngredientId, number][]) {
    c += INGREDIENTS[ing].unitCost * q * priceMult(ing);
  }
  return c;
}

/** Ganho unitário (preço − custo totalmente variável) com preços-base. */
export function unitThroughput(recipe: RecipeId): number {
  return RECIPES[recipe].price - materialCost(recipe);
}
