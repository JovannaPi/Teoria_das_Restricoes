import type { EventKind, IngredientId, RecipeId, StationId } from '../sim/types';
import { STATIONS } from './stations';
import { RECIPES, INGREDIENTS } from './recipes';

export interface EventText {
  title: string;
  text: string;
}

// Textos explicam a consequência operacional, sem dizer qual é a decisão correta.
export function describeEvent(
  kind: EventKind,
  opts: { station?: StationId; recipe?: RecipeId; ingredient?: IngredientId; duration?: number },
): EventText {
  const st = opts.station ? STATIONS[opts.station].short : '';
  const rc = opts.recipe ? RECIPES[opts.recipe].short : '';
  const ing = opts.ingredient ? INGREDIENTS[opts.ingredient].name : '';
  const dur = opts.duration ? Math.round(opts.duration * 2) : 0; // minutos no relógio da loja
  switch (kind) {
    case 'tempestade':
      return {
        title: 'Tempestade mágica',
        text: `Raios roxos sobre a estrada! As entregas da comerciante vão demorar o triplo por ${dur} minutos.`,
      };
    case 'manutencao':
      return {
        title: `${st}: manutenção`,
        text: `A estação ${st} precisa de reparos e ficará parada por ${dur} minutos. O que estiver dentro dela espera.`,
      };
    case 'cliente_vip':
      return {
        title: 'Cliente importante',
        text: `A Arquimaga do Conselho quer ${rc} com urgência e paga o dobro — mas o prazo é curto.`,
      };
    case 'lote_ruim':
      return {
        title: 'Lote de qualidade inferior',
        text: `O último carregamento de ${ing} veio fraco. Poções feitas com ele têm muito mais chance de falhar na verificação por ${dur} minutos.`,
      };
    case 'feira':
      return {
        title: 'Feira de magia na praça',
        text: `Todo mundo quer ${rc}! Chegam mais clientes e a procura por ${rc} dobra durante ${dur} minutos.`,
      };
    case 'aprendiz_ausente':
      return {
        title: `${st}: aprendiz ausente`,
        text: `Uma aprendiz da estação ${st} foi ao casamento da prima goblin. A estação trabalha com menos gente por ${dur} minutos.`,
      };
    case 'desconto':
      return {
        title: 'Oferta da comerciante',
        text: `Madame Trufa oferece ${ing} com 40% de desconto por ${dur} minutos. Comprar estoque agora custa menos — mas o dinheiro fica parado na prateleira.`,
      };
    case 'cristal_temporario':
      return {
        title: 'Cristal de aceleração',
        text: `Um cristal caiu do céu! Ele deixa uma estação 50% mais rápida por ${dur} minutos. Escolha onde usá-lo.`,
      };
    case 'mudanca_demanda':
      return {
        title: 'O mercado mudou',
        text: 'Os clientes começaram a pedir outras poções. A composição dos pedidos mudou.',
      };
  }
}

export const EVENT_DURATIONS: Record<EventKind, number> = {
  tempestade: 60,
  manutencao: 18,
  cliente_vip: 0,
  lote_ruim: 50,
  feira: 70,
  aprendiz_ausente: 45,
  desconto: 40,
  cristal_temporario: 45,
  mudanca_demanda: 0,
};
