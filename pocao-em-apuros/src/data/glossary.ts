// Glossário acessível, com o significado de cada termo dentro do jogo.
export interface GlossaryEntry {
  term: string;
  def: string;
  inGame: string;
}

export const FIVE_STEPS = [
  {
    n: 1,
    name: 'Identificar a restrição',
    text: 'Descobrir qual recurso limita o resultado do sistema inteiro. Indícios: trabalha quase 100% do tempo, tem fila crescente na frente e a menor capacidade para o mix de pedidos.',
    inGame: 'Fase 1. Painel Análise + botão "Registrar hipótese" na estação.',
  },
  {
    n: 2,
    name: 'Explorar a restrição',
    text: 'Tirar o máximo da restrição sem investir: nunca deixá-la parada, sem trabalho ou fazendo tarefas que outros podem fazer, e usar seu tempo nas poções que geram mais ganho.',
    inGame: 'Fase 2. Pulmão, limpeza em paralelo, cobertura de intervalos, inspeção antes do caldeirão, prioridade por ganho, ajuda da Lina.',
  },
  {
    n: 3,
    name: 'Subordinar tudo à restrição',
    text: 'Fazer os recursos não-restritivos trabalharem no ritmo da restrição. Ociosidade planejada em recursos não-restritivos é normal e desejável.',
    inGame: 'Fase 3. Liberação pela corda (tambor-pulmão-corda) e desligar a produção antecipada.',
  },
  {
    n: 4,
    name: 'Elevar a restrição',
    text: 'Aumentar a capacidade da restrição com investimento, quando explorar e subordinar já não bastam e o ganho extra paga o custo.',
    inGame: 'Fase 4. Painel Melhorias.',
  },
  {
    n: 5,
    name: 'Voltar ao passo 1 (sem deixar a inércia virar restrição)',
    text: 'Se a restrição mudou de lugar, recomece. As regras criadas para a restrição antiga podem virar o novo problema.',
    inGame: 'Fase 5 e Bruxa Mestra.',
  },
];

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'Restrição (gargalo)',
    def: 'Qualquer coisa que limita o desempenho de um sistema em relação à sua meta. Pode ser um recurso (uma estação), o mercado (falta de demanda) ou uma política.',
    inGame: 'A estação cuja carga exigida pela demanda é a maior — e passa de ~92% da capacidade disponível.',
  },
  {
    term: 'Capacidade',
    def: 'Quanto um recurso consegue produzir por unidade de tempo.',
    inGame: 'Poções por minuto: 60 ÷ (tempo da etapa ÷ velocidade + preparação de lote) × postos × disponibilidade.',
  },
  {
    term: 'Carga',
    def: 'Razão entre o trabalho que a demanda exige de um recurso e a capacidade que ele tem disponível.',
    inGame: 'Carga acima de 1 (100%) significa que a estação não dá conta: a fila na frente dela cresce sem parar.',
  },
  {
    term: 'Utilização',
    def: 'Fração do tempo em que o recurso esteve trabalhando.',
    inGame: 'Tempo ocupado ÷ (postos × tempo decorrido). Alta utilização numa estação não-restritiva não é uma virtude.',
  },
  {
    term: 'Ganho (throughput)',
    def: 'Velocidade com que o sistema gera dinheiro por meio das vendas: receita menos os custos totalmente variáveis das unidades vendidas.',
    inGame: 'Receita das poções entregues − custo dos ingredientes dessas poções. Poção feita e não vendida não gera ganho.',
  },
  {
    term: 'Custo totalmente variável (CTV)',
    def: 'Custo que só existe porque uma unidade foi produzida e vendida.',
    inGame: 'Os ingredientes de cada poção (pelo custo médio do estoque).',
  },
  {
    term: 'Investimento (I)',
    def: 'Dinheiro imobilizado no sistema em coisas que se pretende vender ou usar: estoques e equipamentos.',
    inGame: 'Ingredientes na despensa + poções em processo + poções prontas na prateleira (a custo) + valor contábil das melhorias.',
  },
  {
    term: 'Despesa operacional (DO)',
    def: 'Todo o dinheiro gasto para transformar investimento em ganho.',
    inGame: 'Aluguel, equipe das estações, políticas pagas, manutenção do estoque em processo, perdas por refugo e depreciação das melhorias.',
  },
  {
    term: 'Lucro líquido (LL)',
    def: 'Ganho menos despesa operacional.',
    inGame: 'LL = Ganho − DO. É o principal resultado de cada fase.',
  },
  {
    term: 'Retorno sobre o investimento (RSI)',
    def: 'Lucro líquido dividido pelo investimento.',
    inGame: 'Mostrado no painel de finanças, para comparar o efeito das melhorias.',
  },
  {
    term: 'Faturamento ≠ lucro',
    def: 'Receita é o dinheiro que entra pelas vendas; lucro é o que sobra depois dos custos.',
    inGame: 'O painel de finanças mostra receita, ganho e lucro separados.',
  },
  {
    term: 'Estoque em processo (EP / WIP)',
    def: 'Unidades que já começaram a ser produzidas mas ainda não foram vendidas.',
    inGame: 'Poções liberadas que estão em filas ou sendo processadas. Custa manutenção, ocupa espaço, estraga e alonga os prazos.',
  },
  {
    term: 'Tempo de atravessamento (lead time)',
    def: 'Tempo entre a liberação do trabalho e a entrega ao cliente.',
    inGame: 'Medido para cada poção, da liberação até o balcão. Filas longas = atravessamento longo.',
  },
  {
    term: 'Tambor-pulmão-corda (TPC / DBR)',
    def: 'Método de programação da TOC: a restrição (tambor) dita o ritmo; um pulmão de trabalho protege a restrição; a corda só libera trabalho novo quando algo sai do pulmão.',
    inGame: 'Painel Fluxo → "Liberação pela corda". Você escolhe o tambor e o tamanho do pulmão.',
  },
  {
    term: 'Pulmão (buffer)',
    def: 'Pequena quantidade de trabalho mantida antes da restrição para que ela nunca pare por falta de material.',
    inGame: 'Número de poções liberadas que ainda não passaram pelo tambor.',
  },
  {
    term: 'Recurso não-restritivo',
    def: 'Recurso com capacidade maior do que o sistema precisa dele.',
    inGame: 'Estações com folga. Podem e devem ficar ociosas às vezes.',
  },
  {
    term: 'Ganho por minuto da restrição',
    def: 'Critério para decidir o mix de produtos: prioriza o que gera mais ganho por unidade de tempo do recurso restritivo.',
    inGame: 'Painel Fluxo → prioridade "Maior ganho por minuto do tambor". O painel Receitas mostra esse valor por estação.',
  },
  {
    term: 'Preparação de lote (setup)',
    def: 'Tempo gasto preparando um recurso entre um item e outro.',
    inGame: 'A limpeza do caldeirão. Pode ser feita em paralelo (setup externo) por uma aprendiz extra.',
  },
  {
    term: 'Refugo e retrabalho',
    def: 'Unidades defeituosas descartadas ou refeitas. Se o defeito é descoberto depois da restrição, o tempo dela foi desperdiçado.',
    inGame: 'Poções reprovadas no resfriamento voltam ao começo. A inspeção antes do caldeirão descarta ingredientes ruins antes.',
  },
  {
    term: 'Inércia',
    def: 'Continuar seguindo regras e decisões criadas para uma restrição que já mudou de lugar.',
    inGame: 'Fase 5: a corda continua amarrada ao caldeirão, mas a restrição agora é outra.',
  },
  {
    term: 'Restrição de mercado',
    def: 'Quando todos os recursos têm folga, quem limita o ganho é a demanda.',
    inGame: 'Opção "A demanda (mercado)" ao registrar uma hipótese.',
  },
];
