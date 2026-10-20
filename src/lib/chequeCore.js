/**
 * Núcleo determinístico do fluxo de cheques.
 *
 * LÓGICA PURA — sem acesso a banco, sem imports. Testável isoladamente
 * (ver src/lib/chequeCore.test.js).
 *
 * ─── REGRA OFICIAL DAS DATAS (entidade Cheque) ───────────────────────────────
 *  compensation_date → VENCIMENTO previsto do título. NUNCA a data efetiva.
 *  compensated_at    → data EFETIVA da compensação (vazio quando não compensado).
 *  due_date          → vencimento; é campo da Operation, não existe no Cheque.
 *
 * Qualquer tela que exiba ou compare vencimento deve usar `chequeDueDate()`.
 * Qualquer tela que exiba data efetiva deve usar `chequeCompensatedAt()`.
 */

export const STATUS_COMPENSADO = 'compensado';

export function isCompensado(c) {
  return !!c && c.status === STATUS_COMPENSADO;
}

/** Vencimento do cheque (campo legado `compensation_date`). */
export function chequeDueDate(c) {
  return (c && c.compensation_date) || '';
}

/** Data efetiva da compensação. Nunca usar como vencimento. */
export function chequeCompensatedAt(c) {
  return (c && c.compensated_at) || '';
}

/**
 * Chave de ordenação determinística: data de referência + id.
 * O id como desempate garante que a ordem não dependa da ordem do array.
 */
export function chequeSortKey(c) {
  const ref = chequeCompensatedAt(c) || chequeDueDate(c);
  return `${ref}|${(c && c.id) || ''}`;
}

/**
 * Um cheque só deve ser compensado se NÃO estiver já compensado.
 * Leitura falha (null) → permite prosseguir, como no comportamento anterior.
 */
export function shouldCompensate(fresh) {
  return !(fresh && fresh.status === STATUS_COMPENSADO);
}

/** Um cheque só deve ser estornado se estiver de fato compensado. */
export function shouldRevert(fresh) {
  return !!fresh && fresh.status === STATUS_COMPENSADO;
}

/** Soma dos valores de face dos cheques compensados (opcionalmente excluindo um). */
export function sumCompensated(cheques, excludeChequeId) {
  return (cheques || [])
    .filter(c => isCompensado(c) && c.id !== excludeChequeId)
    .reduce((s, c) => s + (c.valor_face || c.value || 0), 0);
}

/**
 * Chave estável de uma parcela: vencimento + valor + número.
 * NÃO usa a posição no array — assim o resultado não muda se a agenda de
 * parcelas for reordenada por uma edição.
 */
export function installmentSortKey(inst) {
  const numero = inst.number ?? inst.installment_number ?? inst.numero ?? '';
  return `${inst.due_date || ''}|${inst.value ?? ''}|${numero}`;
}

/**
 * Aloca cheques compensados às parcelas de uma operação — DETERMINÍSTICO.
 *
 * Regra: cada cheque compensado baixa no máximo UMA parcela, e cada parcela
 * é baixada por no máximo UM cheque (alocação um-a-um). O casamento usa o
 * vencimento da parcela (`due_date`) contra o vencimento do cheque
 * (`compensation_date`).
 *
 * Determinismo: ambos os lados são ordenados por chave estável antes do
 * casamento (data + id no lado dos cheques; vencimento + valor + número no
 * lado das parcelas). O resultado depende apenas do CONJUNTO de entradas —
 * nunca da ordem incidental dos arrays nem da posição da parcela.
 *
 * @param {Array} installments - installment_schedule da operação
 * @param {Array} compensatedCheques - todos os cheques da operação
 * @param {string} [excludeChequeId] - cheque a ignorar (usado no estorno)
 */
export function allocateInstallments(installments, compensatedCheques, excludeChequeId) {
  const list = Array.isArray(installments) ? installments : [];
  if (list.length === 0) return list;

  const cheques = (compensatedCheques || [])
    .filter(c => isCompensado(c) && c.id !== excludeChequeId)
    .slice()
    .sort((a, b) => {
      const ka = chequeSortKey(a);
      const kb = chequeSortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

  const ordered = list
    .map((inst, i) => ({ inst, i }))
    .sort((x, y) => {
      const kx = installmentSortKey(x.inst);
      const ky = installmentSortKey(y.inst);
      if (kx !== ky) return kx < ky ? -1 : 1;
      // Parcelas totalmente idênticas: desempate final pelo índice original
      return x.i - y.i;
    });

  const paidIdx = new Set();
  for (const ch of cheques) {
    const due = chequeDueDate(ch);
    const target = ordered.find(({ inst, i }) => !paidIdx.has(i) && (inst.due_date || '') === due);
    if (target) paidIdx.add(target.i);
  }

  return list.map((inst, i) => {
    const isPaid = paidIdx.has(i);
    // Uma parcela que deixa de estar paga volta a 'pendente';
    // status manuais (ex: 'atrasado') são preservados.
    const status = isPaid ? 'pago' : (inst.status === 'pago' ? 'pendente' : (inst.status || 'pendente'));
    return { ...inst, paid: isPaid, status };
  });
}

/** Saldo devedor = total a receber − total compensado (nunca negativo). */
export function computeBalanceDue(totalReceivable, totalCompensado) {
  return Math.max(0, (totalReceivable || 0) - (totalCompensado || 0));
}

/**
 * Status da operação a partir do saldo e do atraso.
 * Não altera operações que ainda não foram ativadas (pendente_contrato).
 */
export function computeOperationStatus(op, isQuitado, overdueDays) {
  if (isQuitado) return 'quitado';
  if (op.status === 'pendente_contrato') return op.status;
  if (!overdueDays || overdueDays <= 0) return 'ativo';
  if (overdueDays <= 60) return 'atrasado';
  return 'inadimplente';
}

/**
 * Lucro realizado.
 * Só é recalculado quando a operação está quitada; caso contrário PRESERVA o
 * valor já registrado (um estorno parcial não zera o lucro da operação).
 */
export function computeRealizedProfit(op, totalCompensado, isQuitado) {
  if (!isQuitado) return op.realized_profit || 0;
  return totalCompensado - (op.gross_value || 0) - (op.capital_cost || 0);
}

/**
 * Executa uma operação idempotente item a item, tolerando FALHA PARCIAL.
 *
 * Não existe transação atômica no cliente. O mecanismo seguro adotado é:
 *  1. Cada item é independente — uma falha NÃO interrompe os demais.
 *  2. `isAlreadyDone` é a guarda de idempotência: um item já concluído é
 *     pulado (nunca creditado duas vezes).
 *  3. Cada efeito colateral deve ser idempotente por chave de origem
 *     (source_type + source_id), de modo que reprocessar o lote convirja.
 *  4. `failed` devolve os itens que falharam, para reprocessamento.
 *
 * @returns {{ ok: Array, skipped: Array, failed: Array<{item, error}> }}
 */
export async function runIdempotentBatch(items, { isAlreadyDone, run, onProgress }) {
  const list = Array.isArray(items) ? items : [];
  const ok = [];
  const skipped = [];
  const failed = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (onProgress) onProgress(i, list.length, item);
    try {
      if (isAlreadyDone && await isAlreadyDone(item)) {
        skipped.push(item);
        continue;
      }
      await run(item);
      ok.push(item);
    } catch (e) {
      failed.push({ item, error: (e && e.message) || String(e) });
    }
  }

  if (onProgress) onProgress(list.length, list.length, null);
  return { ok, skipped, failed };
}