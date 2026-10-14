# Limitações conhecidas

- **Arte**: toda a pixel art (cenário, 4 personagens fixos, 7 aprendizes, clientes de 7 espécies, estações, frascos, ícones) é gerada por código em `src/render/`. É consistente e original, mas mais simples que arte desenhada à mão por um artista. Para substituir por arte final: retratos de diálogo, folhas de sprites dos personagens com mais quadros de animação, ilustrações das receitas e o cenário da loja.
- **Áudio**: efeitos e ambiente sintetizados (WebAudio). Não há trilha musical composta.
- **Movimento das poções** entre estações é visual (0,5 s); na regra, a transferência é instantânea. A caminhada da Lina, sim, custa tempo de jogo.
- **Aprendizes** ficam fixos nas estações; quem se move entre estações é a Lina (recurso flexível). Não há atribuição livre de aprendizes a estações.
- **Pulmão** é um único número para o tambor; não há pulmões de expedição ou de montagem (TPC completo).
- Os **clientes visíveis** são limitados (5 no balcão, 15 na espera); os demais aparecem nos painéis.
- **Celular**: em pé, a cena da loja é pequena; por isso há a faixa de estações tocáveis e o painel fixo. Deitado, a loja fica maior. O jogo não obriga a girar o aparelho. Travar a orientação só funciona em tela cheia nos navegadores que permitem (Android/Chrome).
- **"Site para computador"**: o ajuste automático foi validado no Chromium emulando esse modo; num aparelho real, se algo ainda parecer pequeno, desligar "Site para computador" no menu ⋮ do Chrome resolve.
- **Testes em aparelhos físicos** ainda não foram feitos: tudo foi validado no Chromium com emulação de celular e toque (ver `testes.md`, seção "O que ainda NÃO foi testado").
- **Publicação**: o jogo está pronto em `pocao/`, mas o endereço público só existe depois de mesclar na `main` e ligar o GitHub Pages. O QR Code é gerado a partir do endereço em que o jogo está aberto, para nunca apontar para um endereço inventado ou local.
- **Modo rápido**: os textos e a espera de ~25 s para medir cada efeito foram ajustados por simulação; ainda precisam ser testados com pessoas que nunca jogaram (o critério de sucesso — entender a primeira decisão sem ajuda — só se confirma assim).
- O modo rápido mede o efeito de cada decisão numa janela curta (~25 s de jogo); com poucos pedidos nesse intervalo, os números de "entregas por minuto" podem variar bastante.
- O **salvamento** do progresso é por aparelho (localStorage). Só os resultados das fases vão para o placar online.
- A **pontuação do placar** é calculada no aparelho do aluno; as regras do Firebase limitam os valores, mas não impedem um resultado inventado dentro do limite (ver `placar-online.md`).
- O build publicado em `../pocao/` precisa ser servido por http(s) para o modo app/offline funcionar; `pocao-em-apuros.html` funciona aberto direto, mas sem instalação.
