/**
 * ESCRITA do estado cheque ↔ operação ↔ parcela.
 *
 * LÓGICA SEM IMPORTS DE APP — recebe o cliente da plataforma por parâmetro.
 * Isso permite exercitá-la contra um banco simulado (ver
 * src/lib/scheduleIntegrity.test.js), com a mesma garantia que a plataforma
 * oferece: atomicidade POR DOCUMENTO, ou seja, cada `updateMany` aplica inteiro.
 *
 * ── POR QUE NÃO SE GRAVA MAIS O ARRAY INTEIRO ───────────────────────────────
 *
 * A alocação só ALTERA três campos por parcela: `settled_by`, `paid`, `status`
 * (e `id`, na primeira vez). Todo o resto é propagado sem mudança. Regravar o
 * array inteiro levava junto campos que pertencem a OUTROS fluxos — a cobrança
 * Asaas (`asaas_payment_id`, `asaas_payment_status`, `asaas_invoice_url`), os
 * termos comerciais (`value`, `due_date`, `number`) e a baixa manual. Uma
 * compensação de cheque lia o cronograma antes de uma emissão e, ao gravar,
 * apagava o boleto recém-criado.
 *
 * ── TRÊS DISCIPLINAS ────────────────────────────────────────────────────────
 *
 * 1. PARCELA: escrita pontual (`installment_schedule.N.campo`), só campos da
 *    alocação, guardada pelo `settled_by` observado. Um cálculo obsoleto não
 *    sobrescreve alteração mais recente da MESMA parcela.
 *
 * 2. VALOR: `amount_paid` recebe só a DIFERENÇA e por `$inc`, então um
 *    recebimento Asaas concorrente soma em paralelo e nunca é apagado. O
 *    marcador `cheques_compensados_total` é gravado por compare-and-swap.
 *
 * 3. DERIVADOS: `balance_due`, `status` e `realized_profit` são relidos e
 *    gravados condicionados ao `amount_paid` observado — uma recalculação
 *    obsoleta não escreve nada.
 */
import { daysOverdue } from './finance.js';
import {
  allocateInstallments,
  sumCompensated,
  computeAmountPaid,
  computeBalanceDue,
  computeOperationStatus,
  computeRealizedProfit,
} from './chequeCore.js';

export const MAX_TENTATIVAS_SYNC = 5;

/**
 * Guarda da alocação de UMA parcela: o vínculo (`settled_by`) que LEMOS.
 * `null` cobre tanto o campo ausente quanto o gravado como nulo.
 */
export function guardSettled(idx, observado) {
  const campo = `installment_schedule.${Number(idx)}.settled_by`;
  if (observado === null || observado === undefined) {
    return { $or: [{ [campo]: null }, { [campo]: { $exists: false } }] };
  }
  return { [campo]: observado };
}

/**
 * Campos que a ALOCAÇÃO possui. Nenhum outro é reescrito por uma compensação.
 * `asaas_*`, `value`, `due_date`, `number`, `principal` e `interest` pertencem
 * à cobrança e aos formulários.
 */
export function patchAlocacao(depois) {
  return {
    settled_by: depois.settled_by ?? null,
    paid: !!depois.paid,
    status: depois.status,
  };
}

/** Recalcula os totais do cliente a partir de todas as suas operações. */
export async function syncClientTotals(api, clientId, opId, totalPaidForOp) {
  if (!clientId) return;
  const client = await api.entities.Client.get(clientId).catch(() => null);
  if (!client) return;
  const clientOps = await api.entities.Operation.filter({ client_id: clientId });
  const totalPaid = clientOps.reduce(
    (s, o) => s + (o.id === opId ? totalPaidForOp : (o.amount_paid || 0)),
    0
  );
  const totalProfit = clientOps.reduce((s, o) => s + (o.realized_profit || 0), 0);
  await api.entities.Client.update(clientId, { total_paid: totalPaid, total_profit: totalProfit });
}

/**
 * Aplica à operação o estado derivado do conjunto atual de cheques.
 *
 * @param {object} api - cliente (base44.entities)
 * @param {object} op - operação já carregada
 * @param {Array}  allCheques - todos os cheques da operação (estado ATUAL)
 * @param {string} [excludeChequeId] - cheque a desconsiderar (estorno)
 * @returns {Promise<boolean>} `true` = aplicado; `false` = conflito, refazer
 */
export async function applyOperationState(api, op, allCheques, excludeChequeId) {
  const base = Array.isArray(op.installment_schedule) ? op.installment_schedule : [];
  const allocated = allocateInstallments(base, allCheques, excludeChequeId);
  const totalCheques = sumCompensated(allCheques, excludeChequeId);

  // ── 1. Parcelas: patch pontual e condicional ──────────────────────────────
  let conflito = false;
  for (let i = 0; i < allocated.length; i++) {
    const antes = base[i] || {};
    const depois = allocated[i];
    const observado = antes.settled_by ?? null;
    const idFinal = depois.id || antes.id || '';

    const mudou =
      observado !== (depois.settled_by ?? null) ||
      !!antes.paid !== !!depois.paid ||
      (antes.status || 'pendente') !== depois.status ||
      (!antes.id && !!idFinal);
    if (!mudou) continue;

    const $set = {};
    for (const [campo, valor] of Object.entries(patchAlocacao(depois))) {
      $set[`installment_schedule.${i}.${campo}`] = valor;
    }
    if (!antes.id && idFinal) $set[`installment_schedule.${i}.id`] = idFinal;

    const r = await api.entities.Operation.updateMany(
      { id: op.id, ...guardSettled(i, observado) },
      { $set }
    );
    if (!r || r.updated !== 1) conflito = true;
  }

  // ── 2. Valores: diferença por $inc, marcador por compare-and-swap ─────────
  const valorAtual = Number(op.amount_paid) || 0;
  const amount_paid = computeAmountPaid(op, totalCheques);
  const delta = amount_paid - valorAtual;

  const temMarcador = typeof op.cheques_compensados_total === 'number';
  const marcadorMuda = !temMarcador || totalCheques !== op.cheques_compensados_total;

  if (delta !== 0 || marcadorMuda) {
    // O marcador autoriza a diferença. Se ele já mudou, outra execução
    // contabilizou cheques desde a nossa leitura: refazer, não sobrescrever.
    const filtro = temMarcador
      ? { id: op.id, cheques_compensados_total: op.cheques_compensados_total }
      : { id: op.id, cheques_compensados_total: { $exists: false } };
    const update = { $set: { cheques_compensados_total: totalCheques } };
    if (delta !== 0) update.$inc = { amount_paid: delta };

    const r = await api.entities.Operation.updateMany(filtro, update);
    if (!r || r.updated !== 1) return false;
  }

  // ── 3. Derivados: convergem sobre o valor REALMENTE gravado ───────────────
  const atual = await api.entities.Operation.get(op.id);
  if (!atual) return true;

  const recebido = Number(atual.amount_paid) || 0;
  const balance_due = computeBalanceDue(atual.total_receivable, recebido);
  const isQuitado = balance_due <= 0.01;
  const status = computeOperationStatus(atual, isQuitado, daysOverdue(atual.due_date));
  const realized_profit = computeRealizedProfit(atual, recebido, isQuitado);

  await api.entities.Operation.updateMany(
    { id: op.id, amount_paid: recebido },
    { $set: { balance_due, status, realized_profit } }
  );

  await syncClientTotals(api, op.client_id, op.id, recebido);
  return !conflito;
}

/**
 * Aplica em laço, relendo o estado a cada tentativa.
 *
 * As escritas são idempotentes: cada parcela só recebe o que a alocação
 * determinística calcula para ela, e `amount_paid` só recebe a DIFERENÇA não
 * contabilizada. Esgotadas as tentativas, o que já foi gravado permanece e a
 * próxima compensação converge — nada é revertido.
 */
export async function sincronizarOperacao(api, operationId, excludeChequeId) {
  if (!operationId) return;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_SYNC; tentativa++) {
    let op = null;
    try {
      op = await api.entities.Operation.get(operationId);
    } catch {
      return; // operação removida — nada a sincronizar
    }
    if (!op) return;

    const allCheques = await api.entities.Cheque.filter({ operation_id: operationId });
    if (await applyOperationState(api, op, allCheques, excludeChequeId)) return;
  }
}