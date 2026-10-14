# Testes executados

## Automatizados (Vitest) — `npm test`: 34/34 passando

`tests/engine.test.ts` (27 testes):

- Cada poção percorre exatamente a rota da sua receita, em ordem.
- Ingredientes são consumidos uma única vez por poção liberada; sem ingredientes não há liberação.
- Um pedido só é concluído depois que todas as poções passam por todas as etapas; nunca recebe mais do que pediu; nunca é concluído duas vezes.
- Nenhuma estação processa mais tarefas simultâneas do que seus postos; a vazão respeita os tempos.
- A fila FIFO é atendida em ordem; priorizar coloca a poção na frente.
- Avançar em pedaços irregulares dá o mesmo resultado (independe de quadros); sem passos, nada muda (pausa).
- Interromper uma estação congela as tarefas dela.
- Ganho = receita − CTV; lucro = ganho − DO; identidade do caixa em 4 cenários.
- Comprar melhoria debita o caixa; sem dinheiro ou em fase bloqueada, não compra.
- A restrição analítica coincide com a estação mais utilizada na prática (fases 1, 2 e 5).
- Investir no caldeirão aumenta seus postos depois da instalação e a destilação passa a ser a mais carregada.
- Hipóteses certas e erradas são verificadas contra os dados.
- A fase 5 exige hipótese antes de investir.
- Estado salvo em JSON continua a partida exatamente igual.
- Todas as fases rodam até o fim sem erros.

`tests/balance.test.ts` (7 testes): validação pedagógica de cada fase (ver `toc-no-jogo.md`).

## Ponta a ponta no navegador — `npm run test:e2e`: 47/47 passando

Chromium real; o jogo é jogado pela interface (cliques e toques), com o tempo acelerado pelo mesmo caminho dos quadros reais.

- O jogo inicia; menu e painéis da tela inicial sem botões mortos.
- **Tutorial completo**: selecionar o balcão, aceitar pedido, entrega da poção, comprar água lunar, ligar a reposição, Lina ajudar no caldeirão, velocidade 2×, pergunta de observação, Análise, conclusão e avaliação.
- **Fase 1**: todos os painéis e janelas sem botões mortos; pausa congela relógio e tarefas; hipótese errada recusada com evidências; hipótese certa confirmada; salvar e continuar; recarregar a página e continuar; fim do dia com fase concluída; pergunta de reflexão com explicação.
- **Fase 4**: investimento com confirmação debita o caixa e a melhoria aumenta a capacidade.
- Layouts 1440×900, 1024×768, 390×844 e 844×390 sem rolagem horizontal e com a loja visível.
- **Celular em pé (toque)**: barra de abas e faixa de estações; alvos de toque ≥ 32 px; aceitar pedido; Lina ajudar; tocar na loja seleciona a estação; Análise; menu "Mais" sem botões mortos.
- **Celular deitado (toque)**: a loja ocupa mais de 70% da altura; o painel desliza ao tocar na aba; decisão aplicada por toque; tocar de novo fecha.
- Versão em arquivo único abre sem servidor.
- Nenhum erro no console.

## Partidas de teste com estratégias diferentes (`npm run balance`, semente oficial)

| Fase | Passiva | Indiscriminada | Foco no gargalo | Sincronizada | Investimento antecipado | Investe no gargalo |
|---|---|---|---|---|---|---|
| 1 | vence (acerta na 2ª hipótese) | vence | vence | vence | vence | vence |
| 2 | perde (11 entregas) | perde | vence (33) | vence | perde | vence |
| 3 | perde (estoque em processo 27) | perde (lucro negativo) | perde (estoque 18) | vence (estoque 6,5) | perde | vence |
| 4 | perde | perde | perde | perde | perde (caixa negativo) | vence |
| 5 | perde | perde | vence | vence | perde | vence |

Problemas de balanceamento encontrados e corrigidos durante esses testes: demanda baixa demais fazia a restrição "sumir" quando o jogador explorava (demanda aumentada); a meta de entregas da fase 4 era impossível (recalibrada); na fase 4 caldeirão e destilação ficavam sobrecarregados juntos (composição da demanda ajustada para que a destilação só vire restrição depois do investimento); a fase 5 vencia sem mudar nada (a destilação ganhou limpeza e intervalos exploráveis, e a fila começa por ordem de chegada).
