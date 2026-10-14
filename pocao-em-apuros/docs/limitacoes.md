# Limitações conhecidas

- **Arte**: toda a pixel art (cenário, 4 personagens fixos, 7 aprendizes, clientes de 7 espécies, estações, frascos, ícones) é gerada por código em `src/render/`. É consistente e original, mas mais simples que arte desenhada à mão por um artista. Para substituir por arte final: retratos de diálogo, folhas de sprites dos personagens com mais quadros de animação, ilustrações das receitas e o cenário da loja.
- **Áudio**: efeitos e ambiente sintetizados (WebAudio). Não há trilha musical composta.
- **Movimento das poções** entre estações é visual (0,5 s); na regra, a transferência é instantânea. A caminhada da Lina, sim, custa tempo de jogo.
- **Aprendizes** ficam fixos nas estações; quem se move entre estações é a Lina (recurso flexível). Não há atribuição livre de aprendizes a estações.
- **Pulmão** é um único número para o tambor; não há pulmões de expedição ou de montagem (TPC completo).
- Os **clientes visíveis** são limitados (5 no balcão, 15 na espera); os demais aparecem nos painéis.
- **Celular**: em pé, a cena da loja é pequena; por isso há a faixa de estações tocáveis e o painel fixo. Deitado, a loja fica maior. O jogo não obriga a girar o aparelho. Travar a orientação só funciona em tela cheia nos navegadores que permitem (Android/Chrome).
- **Testes em aparelhos físicos** ainda não foram feitos: tudo foi validado no Chromium com emulação de celular e toque (ver `testes.md`, seção "O que ainda NÃO foi testado").
- **Publicação**: o jogo está pronto em `pocao/`, mas o endereço público só existe depois de mesclar na `main` e ligar o GitHub Pages. O QR Code é gerado a partir do endereço em que o jogo está aberto, para nunca apontar para um endereço inventado ou local.
- **Desafio da Turma**: os tempos das etapas (dicas aos 70 s, revelação da mentora aos 130 s etc.) foram escolhidos por simulação e ainda precisam ser ajustados com uma turma real.
- O **salvamento** do progresso é por aparelho (localStorage). Só os resultados das fases vão para o placar online.
- A **pontuação do placar** é calculada no aparelho do aluno; as regras do Firebase limitam os valores, mas não impedem um resultado inventado dentro do limite (ver `placar-online.md`).
- O build publicado em `../pocao/` precisa ser servido por http(s) para o modo app/offline funcionar; `pocao-em-apuros.html` funciona aberto direto, mas sem instalação.
