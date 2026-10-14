# Os cinco passos da TOC dentro do jogo

| Passo | Decisões reais no jogo | Efeito medido pela simulação |
|---|---|---|
| **1. Identificar** | Analisar a tabela de estações (utilização, filas, tempo sem trabalho, capacidade por receita) e os gráficos; registrar uma hipótese numa estação ou no mercado | A mentora confere a hipótese com a carga calculada e mostra as evidências. A carga teórica só aparece depois da identificação |
| **2. Explorar** | Pulmão do tambor; limpeza do caldeirão em paralelo; cobertura de intervalos; inspeção antes do caldeirão; prioridade por ganho por minuto do tambor; Lina ajudando na restrição; priorizar poções na fila | Menos tempo ocioso, de limpeza e de parada na restrição e menos refugo depois dela → mais entregas sem investir. Aplicar a mesma decisão fora da restrição custa dinheiro e quase não muda as entregas |
| **3. Subordinar** | Liberação pela corda amarrada ao tambor; desligar a produção antecipada; tamanho do pulmão | Estoque em processo e tempo de atravessamento caem; menos ingredientes estragam; menos custo de manutenção do estoque. A bancada passa a ficar ociosa às vezes, e isso não reduz as entregas |
| **4. Elevar** | Comprar melhorias (segundo caldeirão, cristal, alambique, alquimista, serpentina, embaladora, bancada), com preço, tempo de instalação, despesa e depreciação; ver a estimativa de capacidade antes de comprar | A capacidade da estação muda de verdade; investir fora da restrição quase não muda o resultado. Depois do segundo caldeirão, a destilação passa a ser a estação mais carregada |
| **5. Recomeçar** | Na fase 5 a demanda e a loja mudaram, mas a corda continua no caldeirão. É preciso identificar de novo, reamarrar a corda e explorar a nova restrição; investir só depois de identificar | Manter a configuração antiga perde (testado); reidentificar e reorganizar vence |

## Validação pedagógica automatizada

`tests/balance.test.ts` joga cada fase com estratégias automáticas que usam as mesmas ações do jogador e respeitam os bloqueios da fase:

| Estratégia | Comportamento |
|---|---|
| passiva | não decide nada |
| indiscriminada | empurra tudo, mantém todos ocupados, ordem de chegada |
| foco | identifica a estação mais carregada e aplica todas as explorações nela |
| sincronizada | foco + corda + sem produção antecipada |
| investe_antecipado | compra no início as melhorias que não são da restrição |
| investe_gargalo | sincronizada + investe na restrição + reamarra a corda na nova restrição (passo 5) |

Verificações em 4 sementes de demanda (a oficial da fase e mais 3):

- Fase 1: identificar corretamente vence.
- Fase 2: sem explorar perde em todas; explorando vence.
- Fase 3: passiva e indiscriminada perdem em todas; sincronizar vence.
- Fase 4: não investir ou investir fora da restrição perde em todas; investir na restrição vence.
- Fase 5: manter a corda antiga perde em todas; reidentificar vence.
- Bruxa Mestra: gerenciar pela restrição vence; a produção indiscriminada perde.

"Vence" exige a semente oficial (a que o jogo usa; reiniciar repete o mesmo dia) e pelo menos 3 das 4 sementes.
