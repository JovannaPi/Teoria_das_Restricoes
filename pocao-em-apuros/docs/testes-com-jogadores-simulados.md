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

## Controle remoto usado

`node server.mjs <porta> <pasta> <largura> <altura>` abre o jogo publicado num Chromium com toque e atende `/look`, `/tap?x=&y=`, `/drag?x1=&y1=&x2=&y2=` e `/wait?ms=`, devolvendo uma captura nova a cada comando e registrando o estado do jogo num `log.jsonl` (para conferir o que o jogador viu com o que de fato aconteceu).
