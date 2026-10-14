# Limitações conhecidas

- **Arte**: toda a pixel art (cenário, 4 personagens fixos, 7 aprendizes, clientes de 7 espécies, estações, frascos, ícones) é gerada por código em `src/render/`. É consistente e original, mas mais simples que arte desenhada à mão por um artista. Para substituir por arte final: retratos de diálogo, folhas de sprites dos personagens com mais quadros de animação, ilustrações das receitas e o cenário da loja.
- **Áudio**: efeitos e ambiente sintetizados (WebAudio). Não há trilha musical composta.
- **Movimento das poções** entre estações é visual (0,5 s); na regra, a transferência é instantânea. A caminhada da Lina, sim, custa tempo de jogo.
- **Aprendizes** ficam fixos nas estações; quem se move entre estações é a Lina (recurso flexível). Não há atribuição livre de aprendizes a estações.
- **Pulmão** é um único número para o tambor; não há pulmões de expedição ou de montagem (TPC completo).
- Os **clientes visíveis** são limitados (5 no balcão, 15 na espera); os demais aparecem nos painéis.
- **Celular**: em pé, a loja é pequena (por isso há a faixa de estações tocáveis); a experiência é melhor deitado. Travar a orientação em paisagem só funciona em tela cheia nos navegadores que permitem (Android/Chrome). No iPhone, a tela cheia completa só existe instalando na Tela de Início.
- O **salvamento** é por navegador (localStorage); não há nuvem nem ranking de turma.
- O build publicado em `../pocao/` precisa ser servido por http(s) para o modo app/offline funcionar; `pocao-em-apuros.html` funciona aberto direto, mas sem instalação.
