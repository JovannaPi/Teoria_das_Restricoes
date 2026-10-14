# Poção em Apuros

Jogo 2D de gerenciamento de uma loja de poções para estudantes de Engenharia de Produção aprenderem, jogando, a **Teoria das Restrições (TOC)** e seus cinco passos de focalização.

O jogador é **Lina Brasaverde**, herdeira de uma loja de poções em ruínas. Com a ajuda da **Vó Morgana**, precisa descobrir qual estação limita a loja, tirar o máximo dela, fazer o resto da loja trabalhar no ritmo dela, decidir quando investir e recomeçar quando a restrição muda de lugar.

**Para seminário:** o botão **Jogar** abre o **Desafio da Turma**, uma partida guiada de 6 a 8 minutos que passa pelos cinco passos e termina com a análise de cada passo usando os números da própria partida. A turma entra por **QR Code** (gerado pelo próprio jogo a partir do endereço público), sem cadastro nem instalação. Roteiro, slide e perguntas de debriefing: **[docs/seminario.md](docs/seminario.md)**.

Cada aluno dá nome e visual à **sua bruxa** (sem dados pessoais) e compete no **placar online da turma**, que pode ser projetado na sala.

**Feito primeiro para celular**: funciona em pé e deitado, por toque, no navegador (instalar como app é opcional). Também funciona no computador.

## Colocar online com placar

Veja **[docs/placar-online.md](docs/placar-online.md)**: publicar no GitHub Pages e colar as regras do Firebase (uma vez só).

## Como jogar agora

| Onde | Como |
|---|---|
| Celular ou computador, versão publicada | Abra `pocao/index.html` no endereço do site do repositório (por exemplo, GitHub Pages: `https://<usuário>.github.io/Teoria_das_Restricoes/pocao/`). No Android, toque em **Instalar no celular**; no iPhone, use **Compartilhar → Adicionar à Tela de Início**. |
| Sem internet e sem servidor | Abra o arquivo `pocao/pocao-em-apuros.html` direto no navegador. É o jogo inteiro num único arquivo, bom para mandar aos alunos. |
| Desenvolvimento | `cd pocao-em-apuros && npm install && npm run dev` |

Em sala de aula: no menu, em **Desafio dos Cinco Círculos**, o **Modo professor** libera todas as fases de uma vez.

## Comandos

```bash
npm install          # instala as dependências de desenvolvimento (Vite, TypeScript, Vitest, playwright-core)
npm run dev          # servidor local com recarga automática
npm run build        # verificação de tipos + build em dist/ (PWA + arquivo único)
npm run preview      # serve o build em http://localhost:4173
npm test             # testes da simulação, da economia e do balanceamento (Vitest)
npm run balance      # relatório das estratégias automáticas em cada fase
npm run test:e2e     # teste ponta a ponta no Chromium (precisa do build antes)
npm run publicar     # build + cópia para ../pocao/ (pasta publicada com o site)
npm run qr -- <url>  # QR Code em alta resolução da URL PÚBLICA + teste de leitura
```

O jogo não tem dependências em tempo de execução: nenhum servidor, conta ou conexão. Progresso, configurações e partida em andamento ficam no `localStorage` do navegador.

## Modos e fases

| Modo | Fase | Passo da TOC | O que o jogador faz | Vence se |
|---|---|---|---|---|
| **Desafio da Turma** (botão Jogar) | Uma encomenda urgente | Os cinco, em sequência | 6 etapas guiadas por dicas curtas: observar, descobrir o gargalo (hipótese), melhorar sem comprar, a procura aumenta e dá para investir, descobrir a nova restrição, resultado | chegar ao fim do expediente (a avaliação mostra cada passo) |
| Aprendiz de Bruxa | Tutorial | Primeiros passos | 10 lições em que se aprende fazendo: selecionar estação, aceitar pedido, comprar ingrediente, mover a Lina, mudar a velocidade, observar filas, abrir a Análise | concluir as lições |
| Cinco Círculos | 1. A Loja Entupida | Identificar | Analisa filas, utilização e capacidade e **registra hipóteses**, que a mentora confere com os dados | hipótese certa + 18 entregas + reputação > 0 |
| | 2. O Caldeirão Nunca Para | Explorar | Pulmão, limpeza em paralelo, cobertura de intervalos, inspeção antes do caldeirão, prioridade por ganho, ajuda da Lina (compras bloqueadas) | 24 entregas + lucro ≥ 550 |
| | 3. A Rebelião dos Aprendizes | Subordinar | Troca "empurrar tudo / manter todos ocupados" pela **corda** (tambor-pulmão-corda) | estoque em processo médio ≤ 9 + lucro ≥ 500 + no máximo 2 cancelamentos |
| | 4. O Grande Investimento | Elevar | Compara melhorias (preço, instalação, despesa, depreciação, estimativa de capacidade) | 37 entregas + lucro ≥ 900 + caixa ≥ 1000 |
| | 5. A Nova Maldição | Recomeçar | A restrição mudou para a destilação; a corda ainda está no caldeirão (inércia). Investir só depois de identificar | hipótese certa + lucro ≥ 900 + no máximo 3 cancelamentos |
| Bruxa Mestra | Dia longo | Ciclo completo | Eventos dinâmicos controlados, mudanças de demanda, orçamento apertado | lucro ≥ 1300 + reputação ≥ 40 + no máximo 4 cancelamentos |

Cada fase termina com uma **avaliação**: objetivos, resultados, restrição no fim do dia (pelos dados), pontuação explicada, as decisões tomadas com suas consequências medidas (entregas e estoque antes e depois), o conceito da TOC e uma pergunta de reflexão com explicação.

## Arquitetura

```
pocao-em-apuros/
├─ index.html              página única (HUD, loja, painel, faixa de estações, abas, modais)
├─ public/                 manifesto do app, service worker (offline) e ícones
├─ src/
│  ├─ sim/                 SIMULAÇÃO PURA — sem DOM; roda em testes
│  │  ├─ types.ts          tipos de todo o estado (serializável em JSON)
│  │  ├─ engine.ts         relógio de passo fixo, pedidos, liberação, estações, qualidade, entregas, contabilidade
│  │  ├─ analysis.ts       capacidade, carga, restrição analítica, utilização observada
│  │  ├─ actions.ts        todas as ações do jogador (validação + registro de decisões)
│  │  ├─ mods.ts           efeitos temporários dos eventos
│  │  └─ rng.ts            aleatoriedade determinística (salvar/carregar reproduz a partida)
│  ├─ data/                PARÂMETROS CENTRALIZADOS: receitas, ingredientes, estações, melhorias, fases, eventos, personagens, glossário
│  ├─ game/                controlador (laço, pausa, velocidade, fim de fase), objetivos e pontuação, tutorial, salvamento
│  ├─ render/              pixel art gerada por código: cenário, personagens, estações, partículas, iluminação
│  ├─ ui/                  HUD, painel lateral, faixa inferior, modais, gráficos, tela inicial, estilos (responsivos)
│  └─ audio/sfx.ts         sons sintetizados com WebAudio (sem arquivos de áudio)
├─ tests/                  testes do motor, balanceamento por estratégias, E2E no navegador
├─ scripts/                pós-build (arquivo único), ícones, publicação, relatório de balanceamento
└─ docs/                   regras da simulação, TOC no jogo, testes, limitações
```

A regra produtiva vive só em `src/sim/`. A cena e a interface **leem** o estado e enviam ações por `src/sim/actions.ts`; nenhum número exibido é inventado pela interface. Toda ação de botão passa por um registro central (`data-action` → handler), e o teste E2E falha se algum botão não tiver handler.

Tecnologia: **TypeScript + Vite**, Canvas 2D próprio, HTML/CSS para a interface. Phaser foi avaliado e dispensado: não há física, e um motor pequeno mantém o jogo leve (≈ 70 KB comprimido) e capaz de rodar como arquivo único offline.

## Documentação

- [docs/simulacao.md](docs/simulacao.md) — regras da simulação, economia e indicadores
- [docs/toc-no-jogo.md](docs/toc-no-jogo.md) — como cada passo da TOC vira decisão no jogo
- [docs/testes.md](docs/testes.md) — testes executados e resultados
- [docs/seminario.md](docs/seminario.md) — Desafio da Turma: QR Code, roteiro do apresentador e debriefing
- [docs/placar-online.md](docs/placar-online.md) — publicar online e configurar o placar da turma
- [docs/limitacoes.md](docs/limitacoes.md) — limitações conhecidas e recursos visuais
