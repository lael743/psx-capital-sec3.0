/**
 * Sincronização cheque ↔ operação ↔ parcela.
 *
 * Toda a lógica de alocação e de cálculo é PURA e vive em `@/lib/chequeCore`
 * (ver testes em src/lib/chequeCore.test.js). Este módulo apenas lê, aplica e
 * grava.
 *
 * REGRA OFICIAL DAS DATAS:
 *   compensation_date = VENCIMENTO do título.
 *   compensated_at    = data EFETIVA da compensação.
 *   A alocação cheque↔parcela usa o VENCIMENTO (compensation_date).
 */
import { base44 } from '@/api/base44Client';
import { daysOverdue } from '@/lib/finance';
import {
  allocateInstallments,
  sumCompensated,
  computeAmountPaid,
  computeBalanceDue,
  computeOperationStatus,
  computeRealizedProfit,
} from '@/lib/chequeCore';

/** Recalcula os totais do cliente a partir de todas as suas operações. */
async function syncClientTotals(clientId, opId, totalPaidForOp) {
  if (!clientId) return;
  const client = await base44.entities.Client.get(clientId).catch(() => null);
  if (!client) return;
  const clientOps = await base44.entities.Operation.filter({ client_id: clientId });
  const totalPaid = clientOps.reduce(
    (s, o) => s + (o.id === opId ? totalPaidForOp : (o.amount_paid || 0)), 0
  );
  const totalProfit = clientOps.reduce((s, o) => s + (o.realized_profit || 0), 0);
  await base44.entities.Client.update(clientId, { total_paid: totalPaid, total_profit: totalProfit });
}

/**
 * Aplica à operação o estado derivado do conjunto atual de cheques.
 * Usada tanto pela compensação quanto pelo estorno — mesma regra, mesmo cálculo.
 *
 * @param {object} op - operação já carregada
 * @param {Array}  allCheques - todos os cheques da operação (estado ATUAL)
 * @param {string} [excludeChequeId] - cheque a desconsiderar (estorno)
 */
async function applyOperationState(op, allCheques, excludeChequeId) {
  const installment_schedule = allocateInstallments(op.installment_schedule, allCheques, excludeChequeId);
  const totalCheques = sumCompensated(allCheques, excludeChequeId);

  // `amount_paid` acumula cheques compensados E pagamentos independentes
  // (registro manual, baixa de lançamento, Asaas). Recalcular o campo inteiro a
  // partir dos cheques APAGARIA esses pagamentos — era o defeito do estorno.
  // Aplicamos apenas a DIFERENÇA da parcela de cheques.
  const amount_paid = computeAmountPaid(op, totalCheques);
  const balance_due = computeBalanceDue(op.total_receivable, amount_paid);
  const isQuitado = balance_due <= 0.01;

  const status = computeOperationStatus(op, isQuitado, daysOverdue(op.due_date));
  const realized_profit = computeRealizedProfit(op, amount_paid, isQuitado);

  await base44.entities.Operation.update(op.id, {
    amount_paid,
    cheques_compensados_total: totalCheques,
    balance_due,
    status,
    realized_profit,
    installment_schedule,
  });

  await syncClientTotals(op.client_id, op.id, amount_paid);
}

async function loadOperation(operationId) {
  if (!operationId) return null;
  try {
    return await base44.entities.Operation.get(operationId);
  } catch (e) {
    // Operação não existe mais (deletada) — nada a sincronizar
    return null;
  }
}

/**
 * Ao compensar um cheque vinculado a uma operação:
 *  1. Aloca as parcelas de forma determinística (uma parcela por cheque)
 *  2. Recalcula amount_paid, balance_due e o status da operação
 *  3. Atualiza os totais do cliente
 *
 * Chame APÓS compensar o cheque no banco de dados.
 */
export async function syncChequeCompensation(cheque) {
  const op = await loadOperation(cheque.operation_id);
  if (!op) return;
  const allCheques = await base44.entities.Cheque.filter({ operation_id: cheque.operation_id });
  await applyOperationState(op, allCheques);
}

/**
 * Reverso da compensação: reaplica o mesmo cálculo desconsiderando o cheque
 * estornado. Não zera o lucro realizado de forma indiscriminada.
 */
export async function syncChequeReversal(cheque) {
  const op = await loadOperation(cheque.operation_id);
  if (!op) return;
  const allCheques = await base44.entities.Cheque.filter({ operation_id: cheque.operation_id });
  await applyOperationState(op, allCheques, cheque.id);
}

/**
 * syncTitulosByOperacaoStatus
 * Sincroniza o status dos títulos (Cheque) vinculados a uma operação
 * conforme o status/etapa da operação:
 *  - Operação quitada (status 'quitado' — pagamento real registrado) → títulos pendentes → 'compensado'
 *  - Operação rejeitada/cancelada → títulos pendentes → 'cancelado'
 *  - Operação reaberta (rascunho/nova) → títulos cancelados → 'pendente'
 *
 * A etapa 'finalizada' NÃO altera status dos cheques: é uma etapa de
 * formalização, não de compensação. A compensação é gerenciada pelo fluxo
 * de tesouraria (página de Cheques) ou pelo registro de pagamento real.
 *
 * Apenas títulos 'pendente' (ou 'cancelado' no caso de reabertura) são alterados,
 * preservando resoluções manuais (devolvido, resolvido_*).
 *
 * @param {object} op - A operação atualizada (com id, etapa, status)
 */
export async function syncTitulosByOperacaoStatus(op) {
  if (!op || !op.id) return;
  const cheques = await base44.entities.Cheque.filter({ operation_id: op.id });
  if (!cheques || cheques.length === 0) return;

  const isPago = op.status === 'quitado';
  const isCancelada = op.etapa === 'rejeitada';
  const isReaberta = ['rascunho', 'nova'].includes(op.etapa || '');

  let targetStatus = null;
  if (isPago) targetStatus = 'compensado';
  else if (isCancelada) targetStatus = 'cancelado';
  else if (isReaberta) targetStatus = 'pendente';

  if (!targetStatus) return;

  const toUpdate = cheques.filter((c) => {
    if (targetStatus === 'pendente') return c.status === 'cancelado';
    return c.status === 'pendente';
  });

  if (toUpdate.length === 0) return;

  await base44.entities.Cheque.bulkUpdate(
    toUpdate.map((c) => ({ id: c.id, status: targetStatus }))
  );

  // D1.1 — marcar um título como compensado NÃO é um recebimento. Absorve o
  // conjunto no marcador, SEM tocar em amount_paid, para que a próxima
  // sincronização de cheques não volte a somar esses títulos.
  const after = await base44.entities.Cheque.filter({ operation_id: op.id });
  await base44.entities.Operation.update(op.id, {
    cheques_compensados_total: sumCompensated(after),
  });
}