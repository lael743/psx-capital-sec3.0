/**
 * Sincronização cheque ↔ operação ↔ parcela.
 *
 * A alocação e o cálculo são PUROS e vivem em `@/lib/chequeCore`.
 * A ESCRITA vive em `@/lib/chequeWrite` — módulo sem imports de app, testável
 * isoladamente contra um banco simulado (src/lib/scheduleIntegrity.test.js).
 *
 * Este módulo apenas conecta os dois ao cliente da plataforma.
 *
 * REGRA OFICIAL DAS DATAS:
 *   compensation_date = VENCIMENTO do título.
 *   compensated_at    = data EFETIVA da compensação.
 *   A alocação cheque↔parcela usa o VENCIMENTO (compensation_date).
 */
import { base44 } from '@/api/base44Client';
import { sumCompensated } from '@/lib/chequeCore';
import { sincronizarOperacao } from '@/lib/chequeWrite';

/**
 * Ao compensar um cheque vinculado a uma operação:
 *  1. Aloca as parcelas de forma determinística (uma parcela por cheque)
 *  2. Recalcula amount_paid, balance_due e o status da operação
 *  3. Atualiza os totais do cliente
 *
 * Chame APÓS compensar o cheque no banco de dados.
 */
export async function syncChequeCompensation(cheque) {
  return sincronizarOperacao(base44, cheque.operation_id);
}

/**
 * Reverso da compensação: reaplica o mesmo cálculo desconsiderando o cheque
 * estornado. Não zera o lucro realizado de forma indiscriminada.
 */
export async function syncChequeReversal(cheque) {
  return sincronizarOperacao(base44, cheque.operation_id, cheque.id);
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