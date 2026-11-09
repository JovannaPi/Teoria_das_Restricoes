# Colocar o jogo online com placar da turma

São dois passos, feitos uma única vez: **publicar o jogo** (GitHub Pages) e **liberar o placar** (Firebase).

## 1. Publicar o jogo (GitHub Pages)

1. Mescle a branch do jogo na `main` do repositório `Teoria_das_Restricoes`.
2. No GitHub, abra **Settings → Pages**. Em *Build and deployment*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, e salve.
3. Em 1 a 2 minutos o jogo fica em:
   **`https://jovannapi.github.io/Teoria_das_Restricoes/pocao/`**

É esse link que os alunos abrem no celular. Depois de abrir, podem tocar em **Instalar no celular** (Android) ou **Compartilhar → Adicionar à Tela de Início** (iPhone).

## 2. Liberar o placar (Firebase do Calend.rio)

O placar usa o mesmo projeto Firebase do Calend.rio (`calendario-3b725`), numa coleção separada chamada `pocao_placar`. Nada do Calend.rio é lido nem alterado.

1. Abra o [console do Firebase](https://console.firebase.google.com/) → projeto **calendario-3b725** → **Firestore Database** → aba **Regras**.
2. **Não apague o que já existe.** Dentro do bloco `match /databases/{database}/documents { ... }`, cole este trecho (por exemplo, logo antes do `}` final desse bloco):

```
    // ---- Poção em Apuros: placar da turma ----
    match /pocao_placar/{doc} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly(['jogadorId', 'jogador', 'bruxa', 'visual', 'fase', 'pontos', 'estrelas', 'venceu', 'lucro', 'entregas', 'temporada', 'criadoEm'])
        && request.resource.data.jogadorId is string && request.resource.data.jogadorId.size() <= 40
        && request.resource.data.jogador is string && request.resource.data.jogador.size() > 0 && request.resource.data.jogador.size() <= 24
        && request.resource.data.bruxa is string && request.resource.data.bruxa.size() > 0 && request.resource.data.bruxa.size() <= 18
        && request.resource.data.visual is string && request.resource.data.visual.size() <= 120
        && request.resource.data.fase in ['turma', 'fase1', 'fase2', 'fase3', 'fase4', 'fase5', 'mestra']
        && request.resource.data.pontos is int && request.resource.data.pontos >= 0 && request.resource.data.pontos <= 100
        && request.resource.data.estrelas is int && request.resource.data.estrelas >= 0 && request.resource.data.estrelas <= 3
        && request.resource.data.venceu is bool
        && request.resource.data.lucro is int
        && request.resource.data.entregas is int && request.resource.data.entregas >= 0
        && request.resource.data.temporada is string && request.resource.data.temporada.size() <= 30
        && request.resource.data.criadoEm == request.time;
      allow update, delete: if false;
    }
```

3. Para o **painel da sala da turma** (telão ao vivo), cole também, logo abaixo do trecho anterior:

```
    // ---- Poção em Apuros: sala da turma (painel ao vivo) ----
    match /pocao_sala/{doc} {
      allow read: if true;
      allow create, update: if request.resource.data.keys().hasOnly(['sala', 'jogadorId', 'bruxa', 'passo', 'erros', 'preparo', 'ocupado', 'fora', 'capFim', 'pontos', 'atualizadoEm'])
        && request.resource.data.sala is string && request.resource.data.sala.size() >= 4 && request.resource.data.sala.size() <= 6
        && request.resource.data.jogadorId is string && request.resource.data.jogadorId.size() <= 40
        && doc == request.resource.data.sala + '_' + request.resource.data.jogadorId
        && request.resource.data.bruxa is string && request.resource.data.bruxa.size() <= 18
        && request.resource.data.passo is int && request.resource.data.passo >= 0 && request.resource.data.passo <= 7
        && request.resource.data.erros is int && request.resource.data.erros >= 0 && request.resource.data.erros <= 20
        && request.resource.data.preparo is bool && request.resource.data.ocupado is bool && request.resource.data.fora is bool
        && request.resource.data.capFim is int && request.resource.data.capFim >= 0 && request.resource.data.capFim <= 300
        && request.resource.data.pontos is int && request.resource.data.pontos >= -1 && request.resource.data.pontos <= 100
        && request.resource.data.atualizadoEm == request.time;
      allow delete: if false;
    }
```

4. Clique em **Publicar**.

Pronto: qualquer pessoa com o link pode jogar e entrar no placar, **sem criar conta**. Os resultados só podem ser adicionados (ninguém consegue apagar ou editar o resultado de outra pessoa pelo jogo).

## Como o placar funciona

- Na primeira partida, cada aluno dá um nome à sua bruxa (já vem um nome mágico sugerido). É esse nome que aparece no placar — não é pedido nenhum dado pessoal.
- Ao terminar uma fase, o resultado é enviado automaticamente. Sem internet, ele fica guardado no celular e é enviado quando a conexão voltar.
- **Só fases vencidas contam.** Para cada fase vale a melhor pontuação do aluno (0 a 100). O **Geral** soma as 7 partidas (Desafio da Turma, Círculos 1 a 5 e Bruxa Mestra): no máximo 700 pontos. No seminário, a aba **Desafio da Turma** mostra só o desafio do dia. Empate: quem venceu mais fases e, depois, quem chegou primeiro.
- No menu, **Placar da turma** mostra o Geral e cada fase. **Projetar na sala** abre o placar em tela cheia, com letras grandes, atualizando ao vivo, para mostrar no projetor.
- Dica para a aula: ative o **Modo professor** (em Desafio dos Cinco Círculos) só no seu aparelho, se quiser mostrar fases sem jogar as anteriores.

## Sala da turma (painel ao vivo no projetor)

1. No projetor, abra `https://jovannapi.github.io/Teoria_das_Restricoes/pocao/?painel` (ou, na tela do QR Code, toque em **Abrir sala da turma**). O jogo cria uma sala com um código de 4 letras e mostra o QR Code **da sala**.
2. Os alunos apontam a câmera para esse QR e tocam em **Modo rápido**. No celular aparece "Você está na sala ABCD".
3. O telão mostra, ao vivo e **sem nomes**: quantos entraram e terminaram, em que passo cada um está, quantos acharam o gargalo de primeira, quantos ajudaram o Preparo, deixaram todo mundo ocupado ou investiram fora do gargalo, e quantas poções por minuto a loja da turma consegue no fim. Embaixo: o **ranking da sala** (nome da bruxa) e **perguntas para o debate** montadas com o que a própria turma fez.
4. **Nova sala** troca o código (outra turma). Reabrir `?painel` no mesmo computador volta para a sala aberta nas últimas 12 horas.

Cada celular envia só: código da sala, identificador anônimo do aparelho, nome da bruxa, passo atual, número de erros ao identificar, as três armadilhas (sim/não), a capacidade final e a pontuação. Nenhum dado pessoal.

## Durante e depois da competição

- **Começar um placar novo** (outra turma, outro semestre): troque `SEASON` em `src/online/config.ts`, rode `npm run publicar` e envie. Os resultados antigos continuam guardados, mas deixam de aparecer.
- **Remover um resultado** (por exemplo, nome ofensivo ou resultado suspeito): no console do Firebase → Firestore → coleção `pocao_placar`, apague o documento.
- **Limite honesto:** a pontuação é calculada no aparelho do aluno. As regras bloqueiam valores fora do intervalo (máximo 100 por fase), mas um aluno com conhecimento técnico poderia enviar um resultado inventado dentro desse limite. Para uma competição em sala, confira os primeiros colocados pedindo que mostrem a avaliação da fase no próprio celular.
- Cada aparelho tem um identificador anônimo. Se um aluno jogar em dois aparelhos, aparece duas vezes (com o mesmo nome).
