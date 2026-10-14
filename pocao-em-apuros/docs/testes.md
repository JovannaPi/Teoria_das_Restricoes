# Testes executados

## Automatizados (Vitest) — `npm test`: 42/42 passando

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

`tests/turma.test.ts` (2): no Desafio da Turma a restrição começa no caldeirão e passa para a destilação depois do segundo caldeirão; decidir pela TOC entrega mais (38 contra 17 poções), lucra mais e tem menos estoque em processo que não decidir, em 3 dias diferentes.

`tests/ranking.test.ts` (3): o placar soma a melhor pontuação de cada fase vencida, ignora derrotas e o tutorial, desempata corretamente e codifica a aparência da bruxa.

`tests/qr.test.ts` (2): o QR gerado é lido de volta com o mesmo endereço; endereços locais (localhost, rede da casa, arquivo) são recusados.

## Ponta a ponta no navegador — `npm run test:e2e`: 132/132 passando

Chromium real; o jogo é jogado pela interface (cliques e toques), com o tempo acelerado pelo mesmo caminho dos quadros reais.

- O jogo inicia; menu e painéis da tela inicial sem botões mortos.
- **Tutorial completo**: selecionar o balcão, aceitar pedido, entrega da poção, comprar água lunar, ligar a reposição, Lina ajudar no caldeirão, velocidade 2×, pergunta de observação, Análise, conclusão e avaliação.
- **Fase 1**: todos os painéis e janelas sem botões mortos; pausa congela relógio e tarefas; hipótese errada recusada com evidências; hipótese certa confirmada; salvar e continuar; recarregar a página e continuar; fim do dia com fase concluída; pergunta de reflexão com explicação.
- **Fase 4**: investimento com confirmação debita o caixa e a melhoria aumenta a capacidade.
- Layouts 1440×900, 1024×768, 390×844 e 844×390 sem rolagem horizontal e com a loja visível.
- **Celular em pé (toque)**: barra de abas e faixa de estações; alvos de toque ≥ 32 px; aceitar pedido; Lina ajudar; tocar na loja seleciona a estação; Análise; menu "Mais" sem botões mortos.
- **Celular deitado (toque)**: a loja ocupa mais de 70% da altura; o painel desliza ao tocar na aba; decisão aplicada por toque; tocar de novo fecha.
- **Modo rápido num celular de 375×667, só por toque** (35 verificações): Jogar com 65 px e visível sem rolar; nome sugerido; sem janela de objetivos em sequência; tocar numa estação abre o painel de baixo e fechar volta para a loja; pergunta do acúmulo com erro explicado pelos números; identificar com erro explicado ("não é o mesmo") e acerto com evidências, sem janela extra; explorar com o efeito medido (tempo parado antes → depois); subordinar com estoque em processo antes → depois; elevar com confirmação em dois toques e efeito; recomeçar com a nova restrição (destilação); os 5 passos cabem nos 5 minutos de jogo; resultado com passo 1 "em parte" (houve erro proposital) e 2 a 5 "feito"; reflexão contextualizada; jogar de novo; pular e reabrir as dicas.
- **Modo completo num celular de 360×740** (13 verificações): barra "Agora" com objetivo e Hipótese; abas Loja, Pedidos, Estoque, Fluxo, Análise, Mais; botões principais ≥ 40×40 px; Pedidos, Estoque e Fluxo abrem como painel de baixo dentro da tela; Investimentos dentro de Fluxo; tocar nos indicadores mostra todos; Análise em cartões sem tabela larga; gráfico mostra valores com toque; hipótese errada explicada com dados; sem rolagem lateral.
- **Loja ampliada no celular**, em 320×568, 360×740, 375×667, 390×844, 412×915 e 844×390 (deitado), no modo rápido e na fase 1: escala da loja ≥ 1,25× a anterior (na prática 1,3× a 2,4×), loja na largura toda e ≥ 40% da altura em pé, nada cobrindo a loja (faixa, cartão da mentora e abas ficam fora dela), sem rolagem lateral.
- **Câmera por toque (390×844)**: arrastar com o dedo move a loja e não seleciona nada; tocar em Preparo, Resfriamento e Balcão na faixa seleciona e mostra a estação dentro da loja; o painel da estação abre abaixo da loja; toque perto (fora do desenho) seleciona a estação mais próxima; "Ver tudo" mostra a loja inteira e "Aproximar" volta.
- **Computador (1280×800)**: sem câmera, loja inteira em 16:9 dentro da área.
- **Chrome com "Site para computador"** (janela de 980 px numa tela de 412 px, toque): a página se amplia para a largura da tela, usa o layout de celular com a loja ampliada, sem rolagem lateral; tocar na loja acerta a estação certa.
- Tela inicial em 320×568, 414×896 e 1280×800: Jogar visível e tocável, sem rolagem lateral.
- Criação da bruxa: aparece antes da primeira partida, exige um nome, aplica o visual; o nome aparece nos diálogos.
- Placar: avaliação informa o envio (ou que ficou guardado sem internet); placar e modo projeção abrem e fecham sem botões mortos.
- Apresentador: recusa gerar QR para endereço local; com um endereço https, o QR do slide é **lido de volta** com o mesmo endereço; o slide tem título, instrução, tempo e endereço alternativo.
- Desempenho: quadro médio de 8,5 ms com a CPU 4× mais lenta e a loja cheia (meta: < 16 ms).
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

## O que ainda NÃO foi testado (precisa ser feito antes do seminário)

Os testes acima rodam no Chromium, emulando tela e toque de celular. **Nenhum aparelho físico foi usado**, e do ambiente de desenvolvimento não foi possível acessar o GitHub Pages nem o Firebase pelo navegador. Ainda é preciso:

- [ ] Publicar no GitHub Pages e abrir o endereço público.
- [ ] Abrir num **Android (Chrome)** e num **iPhone (Safari)** reais, pela **rede móvel**.
- [ ] Ler o QR Code **projetado na sala** com os dois celulares.
- [ ] Colar as regras do Firebase e confirmar que um resultado aparece no placar de outro aparelho.
- [ ] Jogar o Desafio da Turma inteiro com 2 ou 3 pessoas que nunca jogaram e cronometrar (meta: 6 a 8 minutos).
- [ ] Trocar de app no meio da partida e voltar (a partida deve estar pausada e salva).
