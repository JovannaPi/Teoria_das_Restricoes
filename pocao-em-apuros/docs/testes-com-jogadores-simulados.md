# Testes com "jogadores novatos" simulados

**O que é:** outras instâncias de IA, sem acesso ao código nem a esta documentação, jogaram o modo rápido vendo **só capturas de tela** de um celular simulado no Chromium e tocando por coordenadas, com o jogo correndo em tempo real enquanto "pensavam". Dois perfis por rodada: uma estudante cuidadosa (celular 390×844) e um estudante impaciente (celular 360×640). Ninguém explicou nada antes.

**O que não é:** teste com pessoas. Serve para achar problemas grosseiros antes da aula; a validação com alunos continua em [validacao-com-alunos.md](validacao-com-alunos.md).

O controle remoto usado está descrito no fim deste arquivo.

## Rodada 1 (versão "enxuta" com cartões curtos)

Notas — jogar sem explicação: 6 e 7; aprendi algo: 7 e 7. Os dois chegaram ao fim e explicaram o gargalo com as próprias palavras.

| Problema encontrado | Causa | Correção |
|---|---|---|
| "Boa!" com "6,0 → 6,0" e "parado 11% → 35%" | o "antes" era medido depois de a decisão valer; o "% parado" contava mal | o "antes" é medido antes; o resultado é "o Caldeirão fazia X poções por minuto; agora faz Y" |
| "No começo: 1,3 poções por minuto" | medido logo na abertura da loja | resumo usa o que a loja consegue entregar (o mesmo número das etapas) |
| Passo 5 virava chute (filas em 0–2) | a Destilação quase dava conta da nova procura | Destilação um pouco mais lenta (fila cresce à vista) |
| Toques caíam no lugar errado | o cartão mudava de altura e a faixa de estações pulava | cartão com altura fixa |
| "Névoa do Caldeirão ajuda…", "Tico" | nomes nunca apresentados | "Você ajuda no…"; texto sem o nome do aprendiz |
| Esperas de 25–40 s sem retorno | — | esperas de 4 a 22 s com contagem regressiva |
| Morgana difícil de achar | o "!" some ao ver a loja inteira | botão "Pedir uma dica à Vó Morgana" no cartão depois de um erro |
| "refugo", "1 poções", "na Caldeirão", aviso vermelho "Sem conexão" | — | "estragou", plural e gênero corrigidos, aviso neutro |
| Avaliação abria no meio | foco no primeiro botão | abre no topo |
| Área da loja rolava sozinha (achado nos testes automáticos) | botão com foco dentro de área com overflow | a área nunca rola |

## Rodada 2

Notas — jogar sem explicação: 8 e 8; aprendi algo: 6 e 6.

| Problema encontrado | Correção |
|---|---|
| Resumo dizia "4,4 → 7,5" e a avaliação "1,3 → 6,0" | os dois usam o mesmo número |
| "Poções paradas" com números que não batiam e queda pequena ("22 → 21") | o passo 3 compara a escolha com a outra numa **cópia da loja no mesmo instante** ("No ritmo do Caldeirão: 25. Se todo mundo continuasse ocupado: 37") |
| Passo 5 ainda aceitava chute | as opções só aparecem quando a fila da nova restrição já está à vista |
| "Limpar em paralelo", "Cobrir as pausas", "Subordinar", "Elevar", "gargalo" × "restrição" | uma linha de explicação em cada opção; nomes dos passos com o significado ("Subordinar: seguir o ritmo"); "é a restrição (o gargalo)" |
| "corda", "tambor", marcador vermelho no Caldeirão depois da mudança | fora do modo rápido |
| Horário da loja (08:00…) confundia o "por minuto" | horário escondido no modo rápido (a barra do dia continua) |
| "Caldeirã" cortado, "Destilar" × "Destilação" | nomes completos na faixa quando só há 4 estações |
| Pontuação sem explicação | mostra as partes que compõem a nota |

## Rodada 3

Notas — jogar sem explicação: 8 e 6; aprendi algo: 7 e 7.

| Problema encontrado | Correção |
|---|---|
| Comprou o alambique **e** o 2º caldeirão: nenhuma estação ficava sobrecarregada, mas o passo 5 pedia uma restrição e dizia "faz 9,9, chegam 9,8: segura a loja" | o passo 5 nunca afirma que uma estação segura a loja sem ela estar sobrecarregada (teste novo cobre esse caminho) |
| No celular pequeno, os botões ficavam escondidos embaixo do cartão | o cartão rola sozinho até o resultado, com os botões logo abaixo |
| Passo 5 com filas de 0 a 2 | Destilação mais lenta (6,7/min): a nova restrição fica clara qualquer que tenha sido a melhoria do passo 2 |
| "Poções paradas" não batia com as filas visíveis | passa a contar as filas das estações (o mesmo que o jogador vê) |
| Instalação de 22 s, caixa sem explicação, nome sorteado na avaliação | instalação em segundos, linha do caixa, "você" na avaliação |

## Rodada 4

Notas — jogar sem explicação: 8 e 8; aprendi algo: 7 e 7.

| Problema encontrado | Correção |
|---|---|
| Passo 5 sem decisão quando o jogador comprou também o alambique | a procura sobe de novo e o jogador procura a nova fila |
| "Lucro líquido 0/40" na nota, sem o lucro nunca ter sido objetivo | no modo rápido, essa parte da nota vira "entregas por minuto (começo → fim)", o número que o jogo mostra o tempo todo |
| Avaliação "Feito" mesmo com dinheiro desperdiçado | passo 4 fica "Em parte" quando houve compra fora da restrição |
| O alambique não dizia qual estação melhora | cada investimento diz "melhora: Destilação · 340 moedas" |
| Previsões de fila que não se cumpriam ("vai diminuindo") | removidas; o resultado diz só o que a estação faz e o que chega |
| Tentativa de tirar as poções que estragam | desfeita: sem elas, "todo mundo ocupado" bate num teto e a diferença para a corda some (57 × 58). As poções continuam estragando, e agora o jogo conta quantas estragaram |

## Rodada 5

Notas — jogar sem explicação: 8 e 7; aprendi algo: 8 e 7.

| Problema encontrado | Correção |
|---|---|
| Passo 5: com a corda na restrição antiga, o excesso fica **fora das filas** (clientes esperando) e "olhe as filas" não funcionava | no passo 5 todo pedido volta a entrar na hora; a fila aparece na frente da nova restrição; depois de identificá-la, a corda é amarrada nela (o passo 5 da TOC, literalmente) |
| Fila que cai sem entregas (poções estragando) | o resultado do passo 3 diz quantas poções feitas antes da hora estragaram |
| Caixa que muda sem explicação | "Caixa 756: 1.000 do começo + 440 de vendas − 684 de ingredientes e despesas" |
| "Chegaram mais clientes" vago | "antes chegavam 6,0 poções por minuto; agora, 9,8" |
| Texto do passo 3 congelado enquanto a fila cresce | número ao vivo |
| "Em parte" por ter testado uma opção e corrigido | testar e corrigir conta como "Feito" (com a nota do que foi testado); só dinheiro gasto à toa deixa "Em parte" |
| A bruxa ficava ajudando o Preparo depois de escolher outra melhoria | ela fica livre |

## O que os jogadores simulados ainda apontam

- **Duração:** jogadores simulados terminam em 3 a 5 minutos (eles leem rápido). Alunos de verdade tendem a demorar mais; medir na aula.
- **Capacidade de cada estação na faixa** (poções/min em cada botão): pedida por vários. Não foi feita de propósito: tornaria a identificação um cálculo em vez de uma observação, e a professora pediu menos informação na tela.

## Controle remoto usado

`node server.mjs <porta> <pasta> <largura> <altura>` abre o jogo publicado num Chromium com toque e atende `/look`, `/tap?x=&y=`, `/drag?x1=&y1=&x2=&y2=` e `/wait?ms=`, devolvendo uma captura nova a cada comando e registrando o estado do jogo num `log.jsonl` (para conferir o que o jogador viu com o que de fato aconteceu).
