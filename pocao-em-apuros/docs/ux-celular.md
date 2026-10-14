# Reestruturação de UX para celular (v3)

## Auditoria: o que foi encontrado

Reproduzido no Chromium com emulação de celular (375×667 e 360×740, toque), antes das mudanças:

| # | Problema | Onde |
|---|---|---|
| 1 | No celular em pé, o painel de detalhes ficava fixo embaixo da loja e disputava espaço com a faixa de estações, a dica e os pedidos; sobrava pouco para ler. | `styles.css` (layout em pé) |
| 2 | Ações bloqueadas da fase apareciam com cadeado no painel da estação, poluindo a lista de decisões. | `ui/side.ts` |
| 3 | A tabela da Análise tinha 669 px numa tela de 315 px (rolagem lateral). | `ui/modals.ts` |
| 4 | Os valores dos gráficos só apareciam passando o mouse (sem toque). | `ui/charts.ts` |
| 5 | Sete abas no rodapé, e a Hipótese (decisão central das fases 1 e 5) escondida em "Mais". | `ui/hud.ts` |
| 6 | Duas janelas em sequência no início das fases (diálogo e depois objetivos), e outra janela para o resultado de cada hipótese. | `game/game.ts` |
| 7 | No modo rápido, cada etapa juntava várias instruções num texto longo, e era preciso navegar pelos painéis para agir. | `game/turma.ts` |
| 8 | Avisos de refugo cobriam os botões de decisão no celular. | `game/game.ts`, `styles.css` |
| 9 | A loja animada da tela inicial continuava calculando quadros durante a partida. | `ui/title.ts` |
| 10 | No toque, o navegador avisa que o ponteiro "saiu" logo depois de soltar o dedo; isso escondia o valor do gráfico. | `ui/charts.ts` |

Preservado: motor de simulação, as 5 fases do modo completo e seus parâmetros de balanceamento, condições de vitória e derrota, políticas, finanças, melhorias, eventos, placar, QR Code e salvamento.

## O que mudou para o jogador

**Modo rápido (botão Jogar, ~5 min).** Um cartão da mentora com **uma decisão por etapa**, com botões grandes dentro do próprio cartão (não precisa abrir painéis):

1. Tocar em duas estações para ver o que fazem.
2. "Onde as poções estão se acumulando?" A resposta é conferida com as filas reais; um erro é explicado com os números.
3. **Identificar:** escolher a estação que limita a loja. Acerto mostra as evidências (ocupação, fila, capacidade × procura). Erro explica com os dados ("estar ocupada não é o mesmo que ser a restrição"; "parada não é o mesmo que gargalo"). Depois de 3 erros, a mentora mostra os dados para a partida seguir.
4. **Explorar:** escolher **uma** melhoria sem custo (cobrir pausas, limpar em paralelo ou levar a bruxa para ajudar). Depois de ~25 s de jogo o cartão mostra o efeito medido: o tempo parado da restrição antes → depois, e as entregas por minuto.
5. **Subordinar:** "liberar no ritmo da restrição (corda)" ou "continuar liberando tudo". O cartão mostra as poções espalhadas pela loja antes → depois.
6. **Elevar:** a procura aumenta; escolher entre 3 investimentos (com preço) ou não investir. A compra pede um segundo toque de confirmação. O efeito medido diz se o investimento foi na restrição.
7. **Recomeçar:** "a loja mudou — qual estação limita agora?". A restrição antiga deixa de ser a resposta.
8. Fim: "ver o resultado agora" ou continuar até o fim do dia. Resultado com os cinco passos calculados da partida.

"Pular dicas" libera todas as decisões e deixa jogar livre; "Mostrar dicas da mentora" volta ao roteiro.

**Celular (em pé):**
- Barra superior compacta (caixa, reputação, relógio, pausa e velocidade); tocar nos indicadores mostra os demais (lucro, entregues).
- Faixa de 6 estações tocáveis com a fila de cada uma.
- Barra **Agora** (modo completo): o objetivo atual e o botão da ação principal (por exemplo, **Hipótese**).
- Painéis abrem **de baixo** e ocupam só o espaço abaixo das estações: a loja e a faixa continuam visíveis e tocáveis. Fechar (×) volta exatamente para onde estava.
- Barra inferior: **Loja, Pedidos, Estoque, Fluxo, Análise, Mais**. Investimentos ficam em Fluxo → "Investimentos".
- Botões principais com 48 px de altura; ações bloqueadas não aparecem.
- Análise em cartões; gráficos respondem ao toque.

**Celular deitado:** a loja ocupa a tela, as abas ficam num trilho à direita e o painel desliza da direita.

**Computador:** mesma organização, com o painel fixo à direita e as abas no topo.

## Arquivos alterados nesta etapa

`src/game/turma.ts` (modo rápido reescrito), `src/game/game.ts`, `src/game/fivesteps.ts`, `src/game/tutorial.ts`, `src/data/phases.ts` (modo rápido: 300 s e diálogo de 1 fala), `src/ui/side.ts`, `src/ui/hud.ts`, `src/ui/modals.ts`, `src/ui/charts.ts`, `src/ui/title.ts`, `src/ui/online.ts`, `src/ui/presenter.ts`, `src/ui/styles.css`, `src/main.ts`, `index.html`, `tests/e2e/smoke.mjs`.

## Mudanças de regra (documentadas)

- **Duração do modo rápido:** 360 → 300 s de jogo (5 minutos a 1×), para caber no tempo pedido. As fases do modo completo não mudaram.
- **Relatório dos cinco passos:** o passo 2 (explorar) conta como "Feito" com **uma** decisão que recupere tempo da restrição (antes eram duas), coerente com o modo rápido de uma decisão por etapa.
- **Hipótese no modo rápido:** verificada na hora, sem os 20 s de espera do modo completo, para que o retorno venha logo depois da ação.
