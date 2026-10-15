# Validar o modo rápido com quem nunca jogou

**Ainda não foi feito.** Os testes automáticos conferem que o jogo funciona e que os números ensinam a coisa certa, mas só pessoas de verdade mostram se a experiência é clara. Este roteiro leva cerca de 15 minutos por pessoa (ou por dupla).

## Quem e como

- 3 a 5 pessoas que **não conhecem o jogo** e, de preferência, ainda não estudaram TOC.
- Cada uma no próprio celular, abrindo o link (ou o QR Code) e tocando em **Modo rápido**.
- **Não explique nada antes.** Diga só: "É um jogo sobre uma loja de poções. Jogue como achar melhor e fale em voz alta o que está pensando."
- Cronometre e anote. Só ajude se a pessoa ficar travada por mais de 1 minuto. Anote quando e por quê.

## Durante a partida: o que observar

| # | Pergunta | Sinal de que funcionou | Anote |
|---|---|---|---|
| 1 | Começou sem ajuda? | tocou nas estações nos primeiros 30 s | tempo até o primeiro toque útil |
| 2 | Identificou a restrição? | escolheu o Caldeirão em até 2 tentativas | tentativas; se conversou com alguém antes |
| 3 | Usou as conversas? | tocou na Vó Morgana ou num aprendiz quando teve dúvida | quem, quantas vezes, se pediu "Me explica melhor" |
| 4 | Entendeu por que priorizar a restrição? | ao ver "ajudar o Preparo não mudou nada", comentou algo como "porque tudo passa pelo caldeirão" | frase dita |
| 5 | Diferenciou explorar de elevar? | não tentou comprar nada no passo 2 | comentário |
| 6 | Entendeu subordinar? | ao trocar "todo mundo ocupado" pela corda, notou menos poções espalhadas | frase dita |
| 7 | Viu a restrição mudar? | escolheu a Destilação no passo 5 | tentativas |
| 8 | Duração | 6 a 10 minutos | tempo total |

## Depois da partida (2 minutos, sem consultar o jogo)

1. "Com suas palavras: o que limitava a loja, e como você descobriu?"
2. "Por que ajudar o Preparo não adiantou?"
3. "Qual a diferença entre o que você fez no passo 2 (sem gastar) e no passo 4 (investir)?"
4. "Por que não é bom deixar todo mundo sempre ocupado?"
5. "O que aconteceu depois que você comprou o segundo caldeirão?"
6. "O que foi confuso ou chato?"

Considere que o modo rápido funcionou para essa pessoa se ela acertar, com as próprias palavras, pelo menos 4 das 5 primeiras perguntas.

## O que fazer com o resultado

- **Travou sempre na mesma etapa** (por exemplo, 3 de 5 pessoas): o texto do cartão daquela etapa está longo ou ambíguo. Encurte a frase em `src/game/turma.ts` (método `enter`).
- **Ninguém conversou com os personagens:** o "!" da Vó Morgana não chama atenção. Considere mostrar o "!" desde o início do passo 1.
- **Acertou no jogo, mas não soube explicar depois:** o efeito medido passou rápido demais. Aumente o tempo de medição (`startMeasure`) ou deixe o resultado mais curto e direto.
- **Durou mais de 10 minutos:** veja em que etapa o tempo foi gasto. A partida já estende o dia sozinha; o problema costuma ser a leitura dos cartões.
- **Precisou de explicação longa para entender o que fazer:** simplifique a instrução daquela etapa antes de testar com mais pessoas.

Registre os resultados (sem nomes) numa tabela simples e repita o teste depois de cada mudança.
