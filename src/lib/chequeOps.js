/**
 * Operações de cheque: orquestração impura (base44) sobre o núcleo puro.
 *
 * TODA compensação e TODO estorno passam por aqui. Nenhuma tela deve gravar
 * status de cheque nem lançamento de caixa por conta própria — é o que garante
 * uma única definição de identidade de evento (ver chequeEventKeys no core).
 *
 * Garantia aplicada nesta camada:
 *  · A gravação do cheque é um compare-and-swap (claimCheque). Só UMA execução
 *    vence por evento — inclusive entre duas abas/duas pessoas simultâneas.
 *  · Como só o vencedor prossegue, o crédito no banco acontece no máximo uma
 *    vez por evento. É essa guarda — não uma transação — que impede o crédito
 *    duplo (a plataforma não expõe transação atômica no cliente).
 */
import { base44 } from '@/api/base44Client';
import {
  STATUS_COMPENSADO,
  makeEventToken,
  chequeEventKeys,
  compensationTokenOf,
  claimCheque,
} from '@/lib/chequeCore';
import { createChequeCashFlow } from '@/lib/cashFlowHelper';
import { applyBankDelta } from '@/lib/bankLedger';
import { syncChequeCompensation, syncChequeReversal } from '@/lib/syncCheque';

/** Adaptador base44 para o CAS. `updateMany` devolve { updated: <n> }. */
export const chequeStore = {
  updateWhere: (query, update) => base44.entities.Cheque.updateMany(query, update),
  read: (id) => base44.entities.Cheque.get(id).catch(() => null),
};

/** Adaptador base44 para o efeito de saldo (compare-and-swap no Banco). */
export const bancoStore = {
  updateWhere: (query, update) => base44.entities.Banco.updateMany(query, update),
};

/**
 * Aplica o efeito de saldo do evento de cheque.
 *
 * NÃO lê o saldo antes: um `$inc` com guarda de chave é aplicado pelo servidor
 * sobre o valor vigente. A leitura-modificação-escrita anterior perdia
 * atualização quando dois cheques compensavam ao mesmo tempo — o CAS protegia o
 * evento, não o saldo.
 */
export async function creditarBanco({ bankId, delta, eventKey }) {
  return applyBankDelta({ store: bancoStore, bankId, delta, eventKey });
}

/**
 * Compensa um cheque. Idempotente e à prova de concorrência.
 *
 * @returns {Promise<{status:'aplicado'|'nao_aplicado', motivo?:string, claim?:object}>}
 */
export async function compensateCheque({ cheque, bankId, bankName, date }) {
  const token = makeEventToken();
  const patch = {
    status: STATUS_COMPENSADO,
    compensation_token: token,
    compensated_at: date,
    custody_status: 'financeiro',
    deposited_bank_id: bankId || cheque.deposited_bank_id || '',
    deposited_bank_name: bankName || cheque.deposited_bank_name || '',
  };

  // ── Ponto de não-retorno: só o vencedor do CAS segue daqui para baixo ──
  const claim = await claimCheque(chequeStore, cheque.id, 'pendente', patch, token);
  if (!claim.claimed) {
    return { status: 'nao_aplicado', motivo: 'estado_ja_alterado', claim };
  }

  const keys = chequeEventKeys(cheque.id, token);
  await createChequeCashFlow({
    ...keys.compensation,
    category: 'compensacao_cheque',
    amount: cheque.value,
    date,
    description: `Compensação cheque #${cheque.check_number} — ${cheque.client_name} (Banco: ${bankName})`,
    method: 'cheque',
    bank_id: bankId,
    operation_id: cheque.operation_id,
  });

  await creditarBanco({
    bankId,
    delta: cheque.value || 0,
    eventKey: `${keys.compensation.source_type}:${keys.compensation.source_id}`,
  });
  await syncChequeCompensation({ ...cheque, ...patch });

  return { status: 'aplicado', claim };
}

/**
 * Estorna a compensação de um cheque. Idempotente e à prova de concorrência.
 *
 * O estorno restaura SOMENTE os efeitos deste cheque:
 *  · o lançamento de caixa do estorno é identificado pela compensação revertida;
 *  · a operação é recalculada por DIFERENÇA (ver computeAmountPaid), então
 *    pagamentos independentes e lucro já apurado não são apagados.
 */
export async function revertChequeCompensation({ cheque, bankId, bankName, date }) {
  const current = await chequeStore.read(cheque.id);
  if (!current || current.status !== STATUS_COMPENSADO) {
    return { status: 'nao_aplicado', motivo: 'nao_compensado' };
  }

  const tokenCompensacao = compensationTokenOf(current);
  const reversalToken = makeEventToken();
  const patch = {
    status: 'pendente',
    compensated_at: null,
    compensation_token: reversalToken,
    custody_status: 'financeiro',
  };

  const claim = await claimCheque(chequeStore, cheque.id, STATUS_COMPENSADO, patch, reversalToken);
  if (!claim.claimed) {
    return { status: 'nao_aplicado', motivo: 'estado_ja_alterado', claim };
  }

  const keys = chequeEventKeys(cheque.id, tokenCompensacao);
  await createChequeCashFlow({
    ...keys.reversal,
    category: 'estorno_compensacao',
    type: 'saida',
    amount: current.value,
    date,
    description: `Estorno compensação cheque #${current.check_number} — ${current.client_name} (Banco: ${bankName})`,
    method: 'cheque',
    bank_id: bankId,
    operation_id: current.operation_id,
  });

  await creditarBanco({
    bankId,
    delta: -(current.value || 0),
    eventKey: `${keys.reversal.source_type}:${keys.reversal.source_id}`,
  });
  await syncChequeReversal({ ...current, ...patch });

  return { status: 'aplicado', claim };
}

/**
 * Completa o lançamento de caixa ausente de um cheque já compensado.
 *
 * RECUPERAÇÃO PARCIAL — só a parte idempotente e segura:
 *  · o lançamento de caixa é recriado (a chave de origem impede duplicar);
 *  · o saldo bancário NÃO é recreditado — sem transação não há como saber se o
 *    crédito já foi aplicado, e recreditar arriscaria crédito duplo.
 *    Divergência de saldo fica para conferência manual.
 */
export async function completeChequeLedger(cheque) {
  if (!cheque || cheque.status !== STATUS_COMPENSADO || !cheque.compensation_token) {
    return { status: 'nao_aplicavel' };
  }
  const keys = chequeEventKeys(cheque.id, cheque.compensation_token);
  const res = await createChequeCashFlow({
    ...keys.compensation,
    category: 'compensacao_cheque',
    amount: cheque.value,
    date: cheque.compensated_at || cheque.compensation_date,
    description: `Compensação cheque #${cheque.check_number} — ${cheque.client_name} (lançamento recuperado)`,
    method: 'cheque',
    bank_id: cheque.deposited_bank_id,
    operation_id: cheque.operation_id,
  });
  return { status: res.status === 'created' ? 'reparado' : 'ja_existia', res };
}