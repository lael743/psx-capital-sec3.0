# M6.2.2 — Contas a Receber: auditoria e estabilização

## 1. Escopo

Central de consulta de recebíveis (`/pagamentos`), em modo **somente leitura**: nenhuma escrita, schema ou fluxo
financeiro foi alterado. A tela antiga de pagamentos foi substituída pela central, mantendo o histórico de
recebimentos em aba própria.

## 2. Prova de recebimento (P0)

Antes desta rodada, um título podia aparecer como **Recebido** apenas por existir um pagamento vinculado. Agora:

| Situação | Regra |
| --- | --- |
| Recebido | crédito na conta (chave em `applied_ledger_keys`) **e** lançamento de caixa do mesmo evento, conferidos pelo núcleo |
| A confirmar | existe indício de recebimento sem prova completa (pagamento agregado, evento sem lançamento) |
| Vencido | nenhum recebimento e vencimento passado |
| Inconsistente | contradição comprovada entre efeito financeiro e valor aplicado (nunca por falta de vínculo) |
| Resolvido | devolução com resolução **e** efeito financeiro correspondente |

Consequências diretas:
- resolução de cheque devolvido só comprova recebimento quando houve efeito financeiro real;
- registros legados (resoluções sem efeito rastreável) deixam de ser classificados como contradição;
- recebimentos manuais e Asaas provam a **operação**, nunca um título específico; parcela sem vínculo confiável
  aparece como **A confirmar**, não como vencida;
- evento duplicado (mesma identidade de origem) não é somado duas vezes.

## 3. Deduplicação conservadora (P1)

A fusão de registros passou a exigir identidade forte: identificador da origem **mais** valor e vencimento
compatíveis. Coincidência apenas de valor é tratada como **indício** e exibida como alerta — nunca como
mesmo recebível. Nenhum título é ocultado do total; quando um filtro esconde pendências, a tela avisa quantos
ficaram fora.

## 4. Paginação e completude

- carregamento em lotes com deduplicação por identidade e término garantido;
- falha de recarga **não** mantém dados da carga anterior (a tela mostra o erro e permite tentar novamente);
- limitações de leitura (permissões, lotes truncados, dados legados) são declaradas no topo da tela, para que a
  ausência de um título nunca seja confundida com inexistência do registro.

## 5. Interface

- indicadores: A vencer, Vencido, Recebido (comprovado), A confirmar, Resolvido, Inconsistente, Com alerta;
- valores por **valor de face do título**; recebimentos agregados ficam no Histórico (com total, eventos e ticket médio);
- coluna **Origem** exibe o grau real do vínculo (cheque, parcela, sem vínculo, agregado);
- aviso explícito de que o saldo é da operação — não existe saldo comprovado por título individual.

## 6. Verificação

- 397 testes da suíte: 392 verdes; as 4 falhas restantes são as pré-existentes de `d21Seguranca.test.js`
  (auxiliar de teste divergente do RLS de produção de `Operation`), fora do escopo desta rodada;
- 38 testes da central verdes (17 originais + 21 novos de regressão: evidência bancária, legado, duplicidade,
  paginação, contagem de ocultos);
- build de produção sem erros;
- verificação em tela: 20 títulos carregados, indicadores coerentes com os cards, filtro por situação
  retornando exatamente os 3 resolvidos, busca sem correspondência exibindo estado vazio, aviso de filtros
  ocultos aparecendo e desaparecendo corretamente, histórico com 1 evento, sem erros de console e sem
  rolagem horizontal no desktop e no celular.

## 7. Pendências declaradas (não tratadas aqui)

1. `Cheque`, `CashFlow` e `Banco` seguem com escrita aberta a `role: 'user'` — é a próxima frente de segurança (M6.3).
2. Auxiliar de `d21Seguranca.test.js` precisa ser alinhado ao RLS real de `Operation` para a suíte fechar verde.
3. Migração dos escritores diretos de `Cheque` para as funções de servidor (fim da coexistência).
4. Arquivamento de `applied_ledger_keys` / `ledger_claims` quando o volume crescer.