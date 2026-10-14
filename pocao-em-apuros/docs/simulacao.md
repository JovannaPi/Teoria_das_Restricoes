# Regras da simulação

Todos os valores estão em `src/data/` e podem ser ajustados sem mexer na lógica.

## Tempo

- Relógio interno separado do relógio real: passo fixo de **0,1 s de jogo** (`DT`). A interface acumula tempo real × velocidade (1×, 2×, 4×) e executa quantos passos inteiros couberem. A velocidade não depende dos quadros por segundo (testado: avançar em pedaços irregulares dá o mesmo resultado).
- **1 s de jogo = 2 minutos no relógio da loja**; um dia normal tem 300 s (08:00 às 18:00).
- Pausado (botão, espaço, ou qualquer janela aberta), nenhum passo é executado: produção, prazos, despesas e eventos congelam.

## Fluxo de uma poção

1. Um cliente chega (processo de chegada com aleatoriedade determinística; o fluxo de pedidos não depende das ações do jogador, para que estratégias possam ser comparadas).
2. O pedido é aceito (automaticamente ou pelo jogador). Poções prontas na prateleira atendem primeiro.
3. **Liberação**: cada poção que falta vira um trabalho. Os ingredientes são consumidos **uma única vez** na liberação; sem ingredientes não há liberação.
   - *Empurrar*: libera tudo imediatamente.
   - *Corda* (tambor-pulmão-corda): só libera uma poção que passa pelo tambor se o número de poções liberadas que ainda não terminaram a etapa do tambor for menor que o pulmão. Poções que não passam pelo tambor são liberadas livremente.
   - *Manter todos ocupados*: quando a bancada fica ociosa, ela adianta poções sem pedido (estoque especulativo).
4. Cada receita tem uma **rota** (sequência de estações e tempos). Uma poção só entra na fila da estação seguinte depois de concluir a anterior; só é entregue depois de passar pelo balcão.
5. Estação: `postos` tarefas simultâneas no máximo. Tempo efetivo = tempo da etapa ÷ velocidade + limpeza de lote (se não for feita em paralelo). A fila é atendida pela regra de prioridade: ordem de chegada, prazo ou maior ganho por segundo do tambor. Uma poção priorizada manualmente vai na frente.
6. Paradas: intervalos da equipe (se não cobertos), manutenção, instalação de melhoria ou interrupção pelo jogador. Durante a parada, as tarefas congelam.
7. **Qualidade**: cada liberação pode vir com ingrediente ruim; a mistura pode desandar no caldeirão. A verificação final (no resfriamento) refuga a poção, gastando o tempo de todas as estações por onde ela já passou. Com a inspeção na entrada, ingredientes ruins são descartados no fim do preparo, antes do caldeirão (+1,5 s de bancada). Ingredientes preparados que esperam mais que o limite estragam e são descartados quando chegam à frente da fila.
8. **Entrega**: a poção vai para o pedido dela, ou para outro pedido aberto da mesma receita, ou para a prateleira. Um pedido nunca recebe mais do que pediu e é concluído uma única vez.
9. Atraso: entrega depois do prazo paga 60% do preço. Passada a tolerância, o cliente cancela (−10 de reputação) e as poções dele ficam sem dono.

## Economia (definições da TOC)

| Indicador | Definição no jogo |
|---|---|
| Receita | soma paga pelos clientes |
| CTV (custo totalmente variável) | custo médio dos ingredientes das poções **vendidas** |
| **Ganho** | Receita − CTV das vendidas |
| **Despesa operacional (DO)** | aluguel + equipe das estações + políticas pagas + despesa das melhorias + manutenção do estoque (por poção por segundo) + refugo (ingredientes perdidos) + depreciação das melhorias |
| **Lucro líquido** | Ganho − DO |
| **Investimento** | ingredientes na despensa + poções em processo + prontas na prateleira (a custo) + valor contábil das melhorias |
| Caixa | dinheiro inicial + receita − compras de ingredientes (pagas na entrega) − despesas pagas − compras de melhorias |

Identidade verificada nos testes: **variação do caixa = lucro líquido − variação do investimento**.

## Restrição

`analysis.ts` calcula, para cada estação, a carga = (trabalho exigido pela demanda atual, incluindo retrabalho esperado) ÷ (postos × disponibilidade). A estação com maior carga é a restrição; se nenhuma passa de 92%, a restrição é o mercado. O cálculo usa os parâmetros **atuais** (melhorias, eventos, políticas, ajuda da Lina), então a restrição muda de lugar sozinha quando a loja muda. Os testes confirmam que a restrição analítica coincide com a estação mais utilizada na prática.

Uma hipótese do jogador é verificada depois de 20 s de jogo, contra esse cálculo, e a resposta mostra as evidências observadas (utilização, fila média, capacidade para o mix e demanda).

## Eventos

Agendados por fase ou, no modo Bruxa Mestra, sorteados por um diretor com intervalo mínimo entre eventos e **no máximo um evento negativo ativo por vez**: tempestade (entregas de ingredientes 3× mais lentas), manutenção, cliente urgente (paga o dobro, prazo curto), lote ruim, feira (mais demanda de uma receita), aprendiz ausente, desconto da comerciante e cristal de aceleração (o jogador escolhe a estação).
