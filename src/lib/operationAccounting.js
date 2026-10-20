/**
 * Contabilização da Operation — CÓPIA FRONTEND.
 *
 * ⚠️ O bloco entre os marcadores @sync é IDÊNTICO ao de
 * base44/shared/operationAccounting.js (backend, usado pelo webhook Asaas).
 * O teste D1.1.0z compara os dois blocos byte a byte e falha se divergirem —
 * é assim que a duplicação exigida pela fronteira frontend/backend fica segura.
 *
 * Regra contábil (mesma de src/lib/chequeCore.js):
 *   `amount_paid` acumula cheques compensados E pagamentos independentes.
 *   O total de cheques fica em `cheques_compensados_total`; apenas a DIFERENÇA
 *   é aplicada sobre o valor corrente, para nunca apagar pagamentos por fora.
 *
 * IDEMPOTÊNCIA (D1.1): todo recebimento Asaas carrega a identidade do evento
 * (id do pagamento) em `asaas_eventos_processados`. O webhook reivindica essa
 * identidade por compare-and-swap ANTES de somar.
 */

/* @sync:start — bloco idêntico em base44/shared/operationAccounting.js */
export function isChequeCompensado(c) {
  return !!c && c.status === 'compensado';
}

export function sumCompensatedCheques(cheques, excludeId) {
  return (cheques || [])
    .filter((c) => isChequeCompensado(c) && c.id !== excludeId)
    .reduce((s, c) => s + (c.valor_face || c.value || 0), 0);
}

export function computeAmountPaid(op, totalChequesCompensados) {
  const total = totalChequesCompensados || 0;
  const amountPaid = (op && op.amount_paid) || 0;

  const temMarcador = op && typeof op.cheques_compensados_total === 'number';
  const marcador = temMarcador ? op.cheques_compensados_total : Math.min(amountPaid, total);

  return amountPaid + (total - marcador);
}

export function computeBalanceDue(totalReceivable, totalRecebido) {
  return Math.max(0, (totalReceivable || 0) - (totalRecebido || 0));
}

export function asaasEventKey(paymentId) {
  return String(paymentId || '');
}

export function alreadyProcessed(op, eventKey) {
  if (!eventKey) return false;
  const list = (op && op.asaas_eventos_processados) || [];
  return list.includes(eventKey);
}

export function applyAsaasReceiptUnchecked(op, value) {
  const amountPaid = ((op && op.amount_paid) || 0) + (Number(value) || 0);
  const totalRec = (op && op.total_receivable) || 0;
  const balanceDue = totalRec > 0 ? Math.max(0, totalRec - amountPaid) : 0;

  const out = { ...op, amount_paid: amountPaid, balance_due: balanceDue };
  if (totalRec > 0 && balanceDue <= 0.01) out.status = 'quitado';
  return out;
}

export function applyAsaasReceipt(op, { paymentId, value }) {
  const key = asaasEventKey(paymentId);
  if (key && alreadyProcessed(op, key)) return op;

  const out = applyAsaasReceiptUnchecked(op, value);
  if (key) {
    out.asaas_eventos_processados = [...((op && op.asaas_eventos_processados) || []), key];
  }
  return out;
}

export async function receiveAsaasPayment(op, event, claim) {
  const key = asaasEventKey(event && event.paymentId);
  if (!(await claim(key))) return { applied: false, op };
  return { applied: true, op: applyAsaasReceiptUnchecked(op, event && event.value) };
}

export function syncOperationFromCheques(op, cheques, excludeChequeId) {
  const totalCheques = sumCompensatedCheques(cheques, excludeChequeId);
  const amount_paid = computeAmountPaid(op, totalCheques);
  const balance_due = computeBalanceDue(op.total_receivable, amount_paid);

  const out = {
    ...op,
    amount_paid,
    cheques_compensados_total: totalCheques,
    balance_due,
  };
  if (balance_due <= 0.01 && op.total_receivable > 0) out.status = 'quitado';
  return out;
}

export function markTitulosCompensados(op, cheques) {
  const next = (cheques || []).map((c) =>
    c.status === 'pendente' ? { ...c, status: 'compensado' } : c
  );
  const total = sumCompensatedCheques(next);
  return { op: { ...op, cheques_compensados_total: total }, cheques: next };
}
/* @sync:end */