# PSX Capital — Auditoria técnica inicial

**Branch:** `audit/financial-source-of-truth`  
**Escopo:** auditoria estática inicial do frontend e dos fluxos financeiros.  
**Estado:** diagnóstico preliminar; nenhum teste de build ou integração foi executado nesta etapa.

## Diretrizes de implementação

- Preservar as telas, navegação e fluxos atuais; mudanças incrementais e compatíveis.
- Não reescrever o aplicativo do zero.
- Definir uma fonte de verdade para cada fato financeiro e evitar somar o mesmo recebimento em mais de um módulo.
- Aplicar filtros coerentes de período, data-base, produto e visão (realizado/previsto) em indicadores, tabelas, gráficos e exportações.
- Não alterar regras de juros, taxas, reconhecimento de lucro ou saldo sem validar a regra de negócio e os dados existentes.
- As integrações Asaas precisam ser auditadas no backend antes de mexer no fluxo de emissão.

## Achados confirmados na leitura do código

### P0/P1 — indicadores podem misturar fatos financeiros diferentes

1. `src/pages/Dashboard.jsx` calcula recebimentos somando todos os registros de `Payment` e também cheques com status `compensado`. Sem uma regra explícita de exclusividade entre essas fontes, existe risco de dupla contagem se a compensação do cheque também gerar um pagamento.
2. O gráfico mensal do Dashboard atribui receitas pela `payment_date`, mas agrupa `realized_profit` da operação pela `due_date`. São datas-base diferentes, portanto as duas séries não representam necessariamente o mesmo período contábil.
3. O Dashboard soma `realized_profit` das operações visíveis sem filtro de período para o indicador geral, enquanto o lucro do gráfico usa mês de vencimento. É necessário definir se cada cartão mostra posição acumulada, resultado realizado no período ou projeção.
4. A inadimplência do Dashboard é calculada por quantidade de operações com `due_date` passada, enquanto cobranças também depende de `Operation.due_date`. Isso não prova que parcelas individuais sejam corretamente refletidas; é preciso rastrear o esquema de `installment_schedule` e os pagamentos parciais.
5. `src/pages/Bancos.jsx` apresenta saldo atual das contas e soma cheques pendentes depositados para exibir um saldo projetado. A separação entre saldo bancário conciliado e projeção precisa ficar explícita para evitar interpretação como caixa disponível.

### P1 — limites de consulta podem produzir totais incompletos

1. `src/lib/fetchAll.js` pagina em lotes de 500, mas interrompe silenciosamente ao atingir 25.000 registros. Quem consome a função pode acreditar que recebeu todos os dados.
2. `src/pages/Boletos.jsx` carrega no máximo 500 operações.
3. `src/pages/Bancos.jsx` carrega no máximo 100 contas bancárias.
4. `src/pages/Cobranca.jsx` carrega no máximo 500 operações e 300 clientes.
5. `src/pages/FluxoCaixa.jsx` carrega no máximo 300 lançamentos de caixa e calcula os cartões com base somente nesses registros. O CSV também exporta a lista carregada, podendo ser parcial.

### P1 — emissão Asaas precisa de idempotência e reconciliação verificadas no backend

1. `src/pages/Boletos.jsx` e `src/components/asaas/AsaasBatchModal.jsx` invocam `asaasCreateCharge` com `operation_id`, `billing_type` e `generate_all_parcels`.
2. O lote processa operações sequencialmente e registra o resultado no estado da interface. A interface sozinha não garante idempotência, prevenção de cobranças duplicadas, persistência consistente de cada parcela nem reconciliação de pagamentos.
3. Os arquivos de função backend não foram localizados nos caminhos convencionais `functions/asaasCreateCharge.js` ou `.ts`. Antes de alterar a integração, localizar o caminho real das funções Base44 e verificar criação, persistência, callbacks/webhooks, autenticação, tratamento de retries e estados.

### P1 — regras de cálculo exigem validação antes de qualquer alteração

1. `src/lib/finance.js` arredonda para cima a taxa diária percentual em `roundedDailyRatePercent`. Exemplo documentado: 4% ao mês vira 0,14% ao dia em vez de usar a proporção exata. Isso pode alterar valores; não será mudado sem confirmar a regra comercial/contratual.
2. Os modos de cálculo de operação e parcelas devem ser comparados com contratos, títulos gerados e valores persistidos antes de consolidar um motor único.

## Plano incremental

1. **Mapeamento:** localizar funções backend e modelos/entidades; mapear todos os pontos de criação, edição, baixa, estorno, compensação e recebimento.
2. **Contrato de dados financeiros:** definir, por tipo de evento, identificador único, origem, operação/parcela relacionada, data do fato, competência, vencimento, valor, status e reversão/auditoria.
3. **Motor de consulta:** centralizar critérios de período e data-base sem mudar o layout. Distinguir explicitamente:
   - movimentos ocorridos no período;
   - posição da carteira em uma data-base;
   - valores realizados;
   - valores previstos;
   - vencidos e a vencer.
4. **Conciliação:** definir como Payment, Cheque, CashFlow, contas bancárias e cobranças Asaas se relacionam, com prevenção de dupla contagem.
5. **Asaas:** verificar idempotência, mapeamento de parcela, persistência de IDs externos, webhook e reconciliação; depois corrigir em mudanças pequenas.
6. **Cobertura:** testes para limites de paginação, filtros de datas, pagamentos parciais, estornos, cheques compensados/devolvidos, reprocessamento Asaas e reconciliação de saldo.
7. **Validação:** executar lint, typecheck, build e testes disponíveis após cada etapa. Não declarar validado aquilo que não tiver sido executado.

## Critério de aceite dos filtros

Uma seleção de período deve afetar de forma consistente os cartões, tabelas, gráficos e exportações do mesmo relatório. A data-base escolhida deve ser visível e explícita. A posição atual da carteira não deve ser confundida com movimentação ocorrida no período. Quando não houver dados suficientes para calcular uma métrica com segurança, a interface deve sinalizar isso em vez de apresentar um total aparentemente completo.
