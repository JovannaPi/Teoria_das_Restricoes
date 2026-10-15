// Conversas com os personagens da loja. Cada fala é montada na hora, a partir do estado real da
// simulação: a equipe de cada estação conta o que vive ali (fila, tempo parado, ritmo) e a
// Vó Morgana ensina o passo da TOC em que o jogador está.
//
// As dicas sobem de nível aos poucos: primeiro uma pergunta ou um sinal para observar (nível 0),
// depois o porquê (nível 1) e só então a orientação direta (nível 2). O nível sobe quando o jogador
// pede "Me explica melhor", quando volta a perguntar ou quando erra seguidas vezes.
import { STATIONS, STATION_ORDER } from '../data/stations';
import { UPGRADES } from '../data/upgrades';
import { LOOKS, workerLook, type Look } from '../render/sprites';
import { analyzeCapacity, recentUtilization } from '../sim/analysis';
import { wipCount } from '../sim/engine';
import type { SimState, StationId } from '../sim/types';
import type { Game } from './game';
import { heroName } from './hero';

export type TocStage = 'tutorial' | 'identificar' | 'explorar' | 'subordinar' | 'elevar' | 'repetir' | 'manter' | 'fim';

export interface TalkLine {
  who: string;
  role: string;
  look: Look;
  text: string;
}

/** A equipe de cada estação, com um porta-voz que tem nome e jeito próprios. */
export const CREW: Record<StationId, { name: string; role: string; trait: string }> = {
  preparo: { name: 'Tico', role: 'aprendiz do Preparo', trait: 'apressado, quer todo mundo ocupado' },
  caldeirao: { name: 'Brasa', role: 'aprendiz do Caldeirão', trait: 'forte e orgulhosa do caldeirão' },
  destilacao: { name: 'Ondina', role: 'aprendiz da Destilação', trait: 'meticulosa e paciente' },
  resfriamento: { name: 'Nevasca', role: 'aprendiz do Resfriamento', trait: 'calma, confere cada frasco' },
  embalagem: { name: 'Fita', role: 'aprendiz da Embalagem', trait: 'organizada' },
  balcao: { name: 'Seu Anselmo', role: 'atendente do Balcão', trait: 'conhece todos os clientes' },
};

export function npcName(id: string): string {
  if (id === 'mentora') return 'Vó Morgana';
  if (id === 'lina') return heroName();
  return CREW[id.split(':')[1] as StationId]?.name ?? id;
}

const fmt = (x: number) => x.toFixed(1).replace('.', ',');
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** o/a conforme quem fala pela estação (Tico e Seu Anselmo; as demais são aprendizes) */
const gx = (id: StationId) => (id === 'preparo' || id === 'balcao' ? 'o' : 'a');
const the = (id: StationId) => (['destilacao', 'embalagem'].includes(id) ? 'a' : 'o');

/** A restrição atual pelos dados (ou null quando a loja tem folga: o limite é a procura). */
function constraintNow(s: SimState): StationId | null {
  const a = analyzeCapacity(s);
  return a.constraint === 'mercado' ? null : a.constraint;
}

/** Em que passo da TOC o jogador está, pelo que ele já decidiu na partida. */
export function tocStage(g: Game): TocStage {
  const s = g.sim!;
  if (g.phase?.mode === 'tutorial') return 'tutorial';
  if (g.guide && !g.guide.skipped) {
    return (['identificar', 'identificar', 'identificar', 'explorar', 'subordinar', 'elevar', 'repetir', 'fim'] as TocStage[])[g.guide.index] ?? 'fim';
  }
  const c = constraintNow(s);
  if (!c) return 'manter';
  const known = s.hypotheses.filter((h) => h.correct).map((h) => h.station);
  const elevatedOther = s.upgradesOwned.some((u) => UPGRADES[u.id].station !== c && known.includes(UPGRADES[u.id].station));
  if (!known.includes(c) && g.phase?.revealConstraint !== c) return known.length || elevatedOther ? 'repetir' : 'identificar';
  const st = s.stations[c];
  const canExplore = (st.setupTime > 0 && !s.policies.setupExternal[c]) || (st.breakEvery > 0 && !s.policies.breakCover[c]);
  if (canExplore && s.helper !== c) return 'explorar';
  if (s.policies.release !== 'corda' || s.policies.drum !== c) return 'subordinar';
  if (analyzeCapacity(s).loads[c].load > 1 && !s.upgradesOwned.some((u) => UPGRADES[u.id].station === c)) return 'elevar';
  return 'manter';
}

/** Sinal de dificuldade: erros seguidos de identificação na partida. */
export function struggle(g: Game): number {
  const s = g.sim!;
  const wrong = s.hypotheses.filter((h) => h.correct === false).length;
  const guideWrong = g.guide?.wrongTries ?? 0;
  return wrong >= 2 || guideWrong >= 2 ? 1 : 0;
}

// ---------------------------------------------------------------- mentora

function mentorText(g: Game, stage: TocStage, level: number): string {
  const s = g.sim!;
  const a = analyzeCapacity(s);
  const c = constraintNow(s) ?? (s.policies.drum as StationId);
  const C = STATIONS[c].short;
  const quick = !!g.guide && !g.guide.skipped;
  switch (stage) {
    case 'tutorial':
      return 'Siga as lições do cartão: cada uma ensina um controle da loja. Quando quiser, ande pela loja e converse com a equipe — cada um sabe muito da própria estação.';
    case 'identificar':
      return [
        'Uma loja é como uma corrente: só aguenta o que o elo mais fraco aguenta. Se você fosse uma poção, em que estação passaria mais tempo esperando?',
        'Procure dois sinais juntos: fila crescendo na frente da estação e a estação ocupada quase o tempo todo. Um sinal sozinho engana — tem gente ocupada que ainda dá conta, e gente parada que só espera trabalho chegar.',
        `Compare o que cada estação faz com o que chega: a loja recebe ${fmt(a.demandPerMin)} poções/min e ${the(c)} ${C} faz só ${fmt(a.loads[c].mixCapacityPerMin)}/min. As outras fazem mais do que isso. Quem não dá conta do que chega é a restrição.`,
      ][level];
    case 'explorar': {
      const st = s.stations[c];
      const why = [
        st.setupTime > 0 && !s.policies.setupExternal[c] ? 'ele para para ser limpo entre um lote e outro' : '',
        st.breakEvery > 0 && !s.policies.breakCover[c] ? 'a equipe dele faz pausa para o chá e ninguém assume' : '',
      ].filter(Boolean);
      return [
        `Antes de gastar uma moeda: em que momentos ${the(c)} ${C} fica parado, mesmo com poções esperando na frente dele?`,
        `Cada minuto que ${the(c)} ${C} perde é um minuto que a loja inteira perde, porque tudo passa por ele.${why.length ? ` Repare: ${why.join(' e ')}.` : ''} Um minuto ganho numa estação que não é a restrição não vale nada para as entregas.`,
        quick
          ? `No cartão, escolha uma melhoria para ${the(c)} ${C}: limpar em paralelo, cobrir as pausas ou ${heroName()} ajudar lá. Ajudar outra estação não aumenta as entregas.`
          : `Toque ${the(c) === 'a' ? 'na' : 'no'} ${C} e use as decisões sem custo: limpeza em paralelo, cobrir as pausas, ou ${heroName()} ajudar lá. Ajudar outra estação não aumenta as entregas.`,
      ][level];
    }
    case 'subordinar':
      return [
        `Conte as poções espalhadas pela loja: são ${wipCount(s)}. Elas estão ajudando a entregar mais, ou só esperando?`,
        `Se as estações antes ${the(c) === 'a' ? 'da' : 'do'} ${C} produzem mais rápido do que ${the(c) === 'a' ? 'ela' : 'ele'}, o excesso vira fila: ocupa espaço, estraga e atrasa. Ficar parado de vez em quando, fora da restrição, não é desperdício.`,
        quick
          ? `No cartão, escolha liberar o trabalho no ritmo ${the(c) === 'a' ? 'da' : 'do'} ${C}: só entra poção nova quando ${the(c) === 'a' ? 'ela' : 'ele'} tiver espaço.`
          : `Em Fluxo, troque "empurrar" pela corda, com o tambor ${the(c) === 'a' ? 'na' : 'no'} ${C}: só entra poção nova quando ${the(c) === 'a' ? 'ela' : 'ele'} tiver espaço.`,
      ][level];
    case 'elevar': {
      const up = s.upgradesAvailable.find((u) => UPGRADES[u].station === c);
      return [
        `Você já tirou ${the(c) === 'a' ? 'da' : 'do'} ${C} o que dava sem gastar. Se ainda falta capacidade para a procura, o que resta fazer?`,
        'Investir é o passo 4, não o 1: só vale depois de explorar e subordinar, e só na restrição. Comprar capacidade para outra estação aumenta a despesa e não as entregas.',
        up
          ? `${UPGRADES[up].name} aumenta a capacidade ${the(c) === 'a' ? 'da' : 'do'} ${C}, que limita a loja: ${UPGRADES[up].price} moedas. Compare com o que a loja deixa de entregar.`
          : `Procure em Melhorias o que aumenta a capacidade ${the(c) === 'a' ? 'da' : 'do'} ${C}. Só isso aumenta as entregas.`,
      ][level];
    }
    case 'repetir':
      return [
        'A loja mudou. A restrição de antes ainda é a de agora? Olhe as filas de novo, sem pressa.',
        'Quando um elo fica forte, outro passa a ser o mais fraco. Cuidado com a inércia: regras feitas para a restrição antiga podem atrapalhar agora.',
        `Agora quem não dá conta é ${the(c)} ${C}: faz ${fmt(a.loads[c].mixCapacityPerMin)} poções/min e chegam ${fmt(a.demandPerMin)}/min. Volte ao passo 1 com ${the(c) === 'a' ? 'ela' : 'ele'}.`,
      ][level];
    case 'fim':
      return 'Você passou pelos cinco passos. Veja o resultado no cartão e compare com o começo do dia.';
    default:
      return `A loja está no ritmo ${the(c) === 'a' ? 'da' : 'do'} ${C}. Continue de olho: se a procura mudar, a restrição pode mudar de lugar — e aí recomeçamos pelo passo 1.`;
  }
}

// ---------------------------------------------------------------- equipe das estações

function crewText(g: Game, id: StationId, level: number): string {
  const s = g.sim!;
  const a = analyzeCapacity(s);
  const st = s.stations[id];
  const q = st.queue.length;
  const u = recentUtilization(s, id, 40);
  const c = constraintNow(s);
  const isC = c === id;
  const C = c ? STATIONS[c].short : null;
  const onBreak = s.t < st.breakUntil;
  if (level === 0) {
    if (id === 'preparo' && !isC && C) {
      return s.policies.release === 'corda'
        ? `Agora só preparo quando ${the(c!)} ${C} pede. Fico parado às vezes, mas a loja ficou mais leve — e as entregas não caíram.`
        : `Eu preparo tudo o mais rápido que dá! Só que a pilha na frente ${the(c!) === 'a' ? 'da' : 'do'} ${C} não para de crescer: ${s.stations[c!].queue.length} poções. Será que adianta eu correr?`;
    }
    if (id === 'balcao' && !isC) {
      const waiting = Object.values(s.orders).filter((o) => o.status === 'aguardando' || o.status === 'aceito').length;
      const late = Object.values(s.orders).filter((o) => o.status === 'aceito' && s.t > o.dueAt).length;
      return `${waiting} clientes esperando${late ? `, ${late} já atrasados` : ''}. Eu entrego rapidinho — o problema é que as poções demoram a chegar até mim.`;
    }
    if (isC && (u < 0.6 || q < 2)) {
      // começo do dia: ainda não há números que mostrem o problema; ela aponta onde olhar
      return `Aqui cada poção demora mais do que em qualquer outro lugar da loja. A loja mal abriu, mas repare na fila na minha frente daqui a pouco.`;
    }
    if (isC) {
      const extra = onBreak ? ' E agora mesmo estamos na pausa do chá.' : '';
      return `Não paro um segundo: ocupad${gx(id)} ${pct(u)} do tempo, e mesmo assim tem ${q} poções esperando na minha frente. Do jeito que chegam, eu não dou conta!${extra}`;
    }
    if (u < 0.6) return `Fico parad${gx(id)} ${pct(1 - u)} do tempo esperando poção chegar. Fila aqui: ${q}. Trabalho sobra para mim quando a loja anda.`;
    return `Estou ocupad${gx(id)} ${pct(u)} do tempo, mas dou conta: a fila aqui é de ${q}. Estar ocupad${gx(id)} não quer dizer estar atrasad${gx(id)}.`;
  }
  // nível 1+: o porquê, ligado à estação
  if (isC) {
    const losses = [
      st.setupTime > 0 && !s.policies.setupExternal[id] ? 'perco tempo limpando entre um lote e outro' : '',
      st.breakEvery > 0 && !s.policies.breakCover[id] ? 'na pausa do chá ninguém fica no meu lugar' : '',
    ].filter(Boolean);
    return `Faço ${fmt(a.loads[id].mixCapacityPerMin)} poções por minuto, e a loja recebe ${fmt(a.demandPerMin)}. Se eu paro um minuto, a loja inteira perde um minuto.${losses.length ? ` E ainda ${losses.join(' e ')}.` : ''}`;
  }
  if (!C) return 'Hoje a loja dá conta de tudo o que chega. Quem limita é a procura: o que vale agora é atender bem.';
  if (id === 'preparo')
    return `A Vó diz que manter todo mundo ocupado não é o objetivo: o objetivo é entregar. Se eu produzo mais rápido que ${the(c!)} ${C}, só faço fila.`;
  return `Correr mais aqui não adianta: o ritmo da loja é o ritmo ${the(c!) === 'a' ? 'da' : 'do'} ${C}. Faço ${fmt(a.loads[id].mixCapacityPerMin)} por minuto, mais do que ${the(c!) === 'a' ? 'ela' : 'ele'}.`;
}

// ---------------------------------------------------------------- montagem

export function talkLines(g: Game, npc: string, level: number): TalkLine[] {
  const s = g.sim!;
  if (npc === 'lina') {
    const goal = g.guide && !g.guide.skipped ? g.guide.currentText() : document.querySelector('#phase-bar .pb-text')?.textContent?.trim() || g.phase?.goalText || '';
    return [
      {
        who: heroName(),
        role: 'você',
        look: LOOKS.lina,
        text: `O que eu preciso fazer agora? ${goal} Se eu ficar em dúvida, posso conversar com a Vó Morgana (no fundo da loja) ou com quem trabalha em cada estação.`,
      },
    ];
  }
  if (npc === 'mentora') {
    const stage = tocStage(g);
    return [{ who: 'Vó Morgana', role: 'mentora', look: LOOKS.morgana, text: mentorText(g, stage, Math.min(2, level)) }];
  }
  const id = npc.split(':')[1] as StationId;
  const crew = CREW[id];
  const look = workerLook(STATION_ORDER.indexOf(id) * 2);
  const lines: TalkLine[] = [{ who: crew.name, role: crew.role, look, text: crewText(g, id, Math.min(1, level)) }];
  if (level === 0 && s.t < 60 && !g.talkHeard.has(npc)) {
    lines.unshift({ who: crew.name, role: crew.role, look, text: `Oi! Eu cuido ${the(id) === 'a' ? 'da' : 'do'} ${STATIONS[id].short}: aqui a gente ${STATIONS[id].verb}.` });
  }
  return lines;
}

/** Chave do nível de dica: a mesma pessoa, no mesmo passo, vai aprofundando. */
export function talkKey(g: Game, npc: string): string {
  return npc === 'mentora' ? `mentora:${tocStage(g)}` : npc;
}
