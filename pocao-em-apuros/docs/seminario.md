# Seminário: Desafio da Turma

Material para usar o **Poção em Apuros** numa aula sobre Teoria das Restrições. A turma joga no próprio celular, pelo navegador, a partir de um QR Code: sem cadastro, sem instalar nada e sem pedir dados pessoais.

## Antes da aula (uma vez)

1. **Publique o jogo** e libere o placar: siga [placar-online.md](placar-online.md). O endereço fica `https://jovannapi.github.io/Teoria_das_Restricoes/pocao/` **depois** de publicado no GitHub Pages.
2. **Teste o endereço público** num celular usando a **rede móvel** (com o Wi-Fi desligado): abra, toque em **Jogar** e jogue um minuto.
3. **Gere o QR Code a partir do endereço que funcionou:**
   - **No projetor (recomendado):** abra `.../pocao/?apresentar`, ou, no jogo, **Mais modos → Apresentar: QR Code da turma**. O slide gera o QR do endereço em que o jogo está aberto. Se aparecer um aviso de "endereço local", você abriu uma cópia do seu computador: abra o link público.
   - **Para colocar nos seus slides:** no mesmo slide, toque em **Baixar QR em alta resolução** (PNG de 2048 px). Ou, no computador: `npm run qr -- https://SEU-ENDEREÇO/pocao/`. O comando gera `docs/seminario/qr-code.png` e confere a leitura do código, tanto nítido quanto simulando a foto de uma projeção.
4. **Teste o QR projetado:** aponte 2 celulares diferentes (um Android e um iPhone, se possível) para o código na tela da sala.

O slide de acesso já contém: título, QR Code em destaque, "Aponte a câmera e jogue", tempo estimado (6 a 8 minutos), uma frase sobre o desafio e o endereço escrito para quem não conseguir ler o código.

## Roteiro do apresentador (≈ 25 minutos)

| Tempo | O que fazer |
|---|---|
| 0–2 min | "Vocês vão administrar uma loja de poções atrasada. O objetivo é entregar mais pedidos e lucrar." **Não fale em gargalo ainda.** |
| 2–4 min | Projete o slide do QR. Peça que todos toquem em **Jogar**. Quem não tiver celular joga em dupla. |
| 4–12 min | Partida (6 minutos de jogo a 1×, com pausas para ler). A mentora dá dicas curtas em 6 etapas: observar → descobrir o gargalo → melhorar sem comprar → a procura aumenta e dá para investir → descobrir a nova restrição → resultado. |
| 12–14 min | Cada um lê a **avaliação dos cinco passos** no próprio celular e responde a pergunta final. Projete o **placar** (Mais modos → Apresentar → Projetar placar). |
| 14–25 min | Debriefing com as perguntas abaixo. |

**O que pedir para observarem durante a partida** (sem entregar a resposta):

- onde as poções se acumulam;
- quais estações ficam paradas e se isso é um problema;
- o que muda quando a loja passa a liberar o trabalho "pela corda";
- o que acontece depois de investir.

Durante a partida, **não diga qual estação é o gargalo**. Se alguém travar, a mentora dá uma dica depois de um tempo e, se precisar, revela os dados para a partida continuar. Isso aparece na avaliação como oportunidade de melhoria.

## Perguntas para o debriefing

1. Qual estação limitou a produção no começo? **Quais evidências** permitiram identificá-la (fila, ocupação, capacidade)?
2. A embalagem vivia parada para o chá. Por que ela **não** era o gargalo?
3. O que dava para melhorar **antes de comprar** equipamentos? Quanto isso mudou as entregas?
4. Por que as outras estações devem **acompanhar o ritmo** da restrição, em vez de produzir o máximo possível?
5. O que aconteceu depois que a restrição foi **elevada** (segundo caldeirão)? Quem passou a limitar a loja?
6. Qual é a diferença entre **aumentar a produção local** de uma estação e **melhorar o resultado global** da loja?
7. Quem investiu numa estação que não era a restrição: o que aconteceu com as entregas e com o lucro?

## Se algo der errado

| Problema | Saída |
|---|---|
| O QR não lê | Leia em voz alta o endereço escrito no slide. |
| Internet da sala ruim | O jogo carrega uma vez (≈ 100 KB comprimido) e depois roda inteiro no celular, sem depender da rede. Só o envio ao placar precisa de internet; sem rede, o resultado fica guardado e é enviado depois. |
| Sem internet nenhuma | Envie antes da aula o arquivo `pocao/pocao-em-apuros.html` (o jogo inteiro num arquivo). Funciona offline, mas sem placar. |
| Alguém fechou o navegador | Ao abrir de novo, aparece **Continuar**: a partida foi salva automaticamente e volta pausada. |
| Celular lento | O jogo reduz os efeitos visuais sozinho em aparelhos mais simples ou com "reduzir animações" ligado. |
