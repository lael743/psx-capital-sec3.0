# PSX Capital — M3: semântica dos valores da operação

Documento de referência da M3. Descreve o significado **real** de cada campo
financeiro da `Operation`, sua fonte, quem o escreve e de quem ele depende.
Nenhuma fórmula foi alterada antes deste mapeamento.

> Regra geral: `Operation` continua sendo, na M3, o documento do agregado
> financeiro. A separação em entidades próprias (parcela, cobrança) é proposta
> para uma etapa posterior e **não** foi feita aqui.

---

## 1. Campos e significados

| Campo | Significado real hoje | Fonte / quem calcula |
|---|---|---|
| `gross_value` | **Valor líquido liberado ao cedente** (repasse). Apesar do nome, NÃO é o valor bruto. | `OperacaoForm.save`: `gross_value = valorLiquido` |
| `net_value` | Mesmo valor de `gross_value` (duplicado por compatibilidade). | `OperacaoForm.save` |
| `total_receivable` | **Obrigação principal**: soma dos valores de face (mais tarifas e outras despesas no modo padrão). Cresce apenas por evento autorizado: taxa de devolução incorporada (M2.1) e mora explícita na baixa manual (M3). **Não** inclui taxa de devolução cobrada separadamente. | `OperacaoForm`, `AdicionarTituloModal`, `EditarCondicoesModal`, `chequeEvento` (taxa), `recebimentoManual` (mora) |
| `amount_paid` | **Total recebido e aplicado à obrigação**. Soma de todos os eventos de recebimento (cheque compensado, Asaas, manual, baixa). Nunca ultrapassa `total_receivable`. | `chequeWrite`, `asaasReceiptFlow`, `receiptEvent` |
| `balance_due` | `max(0, total_receivable − amount_paid)`. Derivado puro. | `chequeWrite`, `asaasReceiptFlow`, `receiptEvent`, `chequeEvento` |
| `projected_profit` | `total_receivable − líquido`, no momento da criação. | `OperacaoForm.save` |
| `realized_profit` | `amount_paid − gross_value − capital_cost`, **somente quando a operação está quitada**. Fora da quitação, preserva o último valor registrado (um estorno parcial não zera lucro). | `chequeCore.computeRealizedProfit` — usado por `chequeWrite`, `asaasReceiptFlow` e `receiptEvent` |
| `cheques_compensados_total` | Marcador da parcela de `amount_paid` que veio de cheques. Permite recalcular por **diferença**. | `chequeWrite` |
| `receipt_keys` (novo, M3) | Chaves dos eventos de recebimento já aplicados a `amount_paid`. É a **prova** da aplicação e a guarda contra repetição. | `receiptEvent` |

## 2. Juros, taxas e despesas

| Componente | Onde vive | Tratamento |
|---|---|---|
| Deságio / juros da antecipação | `Cheque.desagio`, `installment_schedule[i].interest` | Já embutido no valor de face. Não é campo da operação. |
| `tarifa_operacao`, `tarifa_por_titulo` | `Operation` | No modo **padrão**, são repassadas ao cedente e somadas em `total_receivable`. Nos outros modos, descontadas do líquido. |
| `outras_despesas` | Título (`Cheque.outras_despesas`) | Somadas a `total_receivable` no modo padrão; descontadas do líquido no modo inverso. |
| `capital_cost` | `Operation` | Custo opcional de capital. Entra no lucro realizado. **Nunca é inventado** — se ausente, é zero. |
| Taxa de devolução **incorporada** | `Operation.total_receivable` via `taxa_incorporada_eventos` | Somada uma única vez por chave (M2.1). |
| Taxa de devolução **separada** | Recebimento próprio no cheque (`taxa_eventos`) | **Não** toca `total_receivable` nem `amount_paid` da obrigação. |
| Mora da baixa manual | `Payment.acrescimo` + `total_receivable` via evento | Regra explícita: `saldo × taxa% × dias_atraso/30`, validada no servidor antes de aplicar (M3). |

## 3. Dependências (quem lê cada campo)

- `gross_value`: Dashboard ("Total Emprestado"), Boletos (fallback), `buildDadosContrato`,
  `ContratoModal`, `computeRealizedProfit`, `getClientFullData`, `syncOperationsToContaCorrente`.
- `total_receivable`: Dashboard ("A Receber"), Operações, Boletos, Cobrança, ClienteDetail,
  `syncOperationsToContaCorrente` (`debit_amount`), contratos e recibos.
- `amount_paid`: Dashboard, Operações, ClienteDetail, `syncOperationsToContaCorrente`
  (`amortized_amount`), `getClientFullData`.
- `balance_due`: Operações, OperacaoDetail, Cobrança, `chequeEventFlow` (guarda de resolução).
- `realized_profit`: Dashboard ("Lucro Realizado" e série de lucro), ClienteDetail,
  `syncClientTotals` (totais do cliente).

## 4. Regras fechadas na M3

1. **Um único escritor por campo.** `amount_paid`, `total_receivable` e `balance_due`
   nunca são recalculados em memória no navegador. Todo recebimento entra por evento
   com identidade, aplicado no servidor.
2. **Uma única regra de derivados.** `balance_due`, `status` de quitação e
   `realized_profit` saem de `chequeCore` (`computeBalanceDue`,
   `isOperationSettled`, `computeRealizedProfit`) nos três canais.
3. **Lucro realizado no mesmo instante em todos os canais:** quando o saldo em aberto
   chega a zero. Mesma operação, mesmos valores econômicos → mesmo lucro,
   independentemente de ter sido liquidada por cheque, Asaas ou baixa manual.
4. **Saldo nunca negativo.** O valor aplicado é limitado ao saldo em aberto; excedente
   é recusado com mensagem, não absorvido.
5. **Repetição não soma duas vezes.** A chave do evento é gravada na mesma escrita
   atômica do incremento (`receipt_keys`), no padrão já usado por
   `asaas_eventos_processados` e `taxa_incorporada_eventos`.

## 5. Limitações assumidas (não resolvidas nesta fase)

- **Mora e lucro realizado.** A mora da baixa manual é receita recebida e é
  registrada (`Payment.acrescimo` + obrigação), mas a fórmula de lucro
  (`amount_paid − gross_value − capital_cost`) já a inclui por construção, porque
  `amount_paid` e `total_receivable` crescem juntos. Se o negócio quiser tratar
  mora como linha separada de receita, isso exige um campo próprio — decisão de
  negócio, não de código.
- **Sincronização do extrato do cliente.** `syncOperationsToContaCorrente`
  reescreve `debit_amount`/`amortized_amount` da linha do extrato a partir de
  `total_receivable`/`amount_paid`. Por isso a mora continua sendo incorporada à
  obrigação: tirá-la da obrigação faria a sincronização apagar a cobrança da mora
  do extrato. Resolver isso exige alterar a sincronização (M4).
- **Duas verdades de parcela** (`Cheque` + `installment_schedule`), rascunho com
  `status: 'ativo'` e portas de etapa sem validação continuam como na auditoria.
  Fora do escopo declarado da M3.
- `Payment` e `Operation` seguem sem RLS por campo; a proteção nova é a
  autorização no servidor do recebimento, não a restrição de escrita direta
  pelo SDK (M4).