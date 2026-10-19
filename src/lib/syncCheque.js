/**
 * syncChequeCompensation
 *
 * Ao compensar um cheque vinculado a uma operação do tipo "cheque":
 *  1. Marca a parcela correspondente (por data de compensação) como paga
 *  2. Recalcula amount_paid e balance_due da operação
 *  3. Atualiza o status da operação (quitado se tudo pago, atrasado, etc.)
 *  4. Atualiza os totais no cliente (total_paid, total_profit)
 *
 * Chame esta função APÓS compensar o cheque no banco de dados.
 *
 * @param {object} cheque - O cheque recém compensado (com operation_id, value, compensation_date)
 * @param {import('@/api/base44Client').base44} base44Instance
 */
import { base44 } from '@/api/base44Client';
import { daysOverdue } from '@/lib/finance';

export async function syncChequeCompensation(cheque) {
  if (!cheque.operation_id) return;

  let op;
  try {
    op = await base44.entities.Operation.get(cheque.operation_id);
  } catch (e) {
    // Operação não existe mais (deletada) — nada a sincronizar
    return;
  }
  if (!op) return;

  // Busca todos os cheques da operação para calcular o total compensado
  const allCheques = await base44.entities.Cheque.filter({ operation_id: cheque.operation_id });

  // Reconstrói o installment_schedule marcando como paga cada parcela cujo cheque foi compensado
  let updatedSchedule = op.installment_schedule || [];
  if (updatedSchedule.length > 0) {
    // Casar parcelas por data de vencimento == data de compensação do cheque
    updatedSchedule = updatedSchedule.map((inst) => {
      const linkedCheque = allCheques.find(c =>
        c.compensation_date === inst.due_date && c.status === 'compensado'
      );
      const isPaid = !!linkedCheque;
      return { ...inst, paid: isPaid, status: isPaid ? 'pago' : (inst.status || 'pendente') };
    });
  }

  // Total compensado = soma dos valores de face dos cheques compensados desta operação
  const totalCompensado = allCheques
    .filter(c => c.status === 'compensado')
    .reduce((s, c) => s + (c.valor_face || c.value || 0), 0);

  const totalReceivable = op.total_receivable || 0;
  const balanceDue = Math.max(0, totalReceivable - totalCompensado);
  const isQuitado = balanceDue <= 0.01;

  // Calcula status da operação
  let newStatus = op.status;
  if (isQuitado) {
    newStatus = 'quitado';
  } else if (op.status === 'pendente_contrato') {
    // Não muda status de operações ainda não ativas
  } else {
    const overdue = daysOverdue(op.due_date);
    if (overdue === 0) newStatus = 'ativo';
    else if (overdue <= 60) newStatus = 'atrasado';
    else newStatus = 'inadimplente';
  }

  const realizedProfit = isQuitado
    ? totalCompensado - (op.gross_value || 0) - (op.capital_cost || 0)
    : op.realized_profit || 0;

  await base44.entities.Operation.update(op.id, {
    amount_paid: totalCompensado,
    balance_due: balanceDue,
    status: newStatus,
    realized_profit: realizedProfit,
    installment_schedule: updatedSchedule,
  });

  // Atualiza totais do cliente
  if (op.client_id) {
    const client = await base44.entities.Client.get(op.client_id);
    if (client) {
      // Recalcula total_paid e total_profit somando todas operações do cliente
      const clientOps = await base44.entities.Operation.filter({ client_id: op.client_id });
      const totalPaid = clientOps.reduce((s, o) => s + (o.id === op.id ? totalCompensado : (o.amount_paid || 0)), 0);
      const totalProfit = clientOps.reduce((s, o) => s + (o.id === op.id ? realizedProfit : (o.realized_profit || 0)), 0);
      await base44.entities.Client.update(op.client_id, {
        total_paid: totalPaid,
        total_profit: totalProfit,
      });
    }
  }
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
}

/**
 * syncChequeReversal
 * Reverso da compensação: desmarca a parcela como paga e recalcula.
 */
export async function syncChequeReversal(cheque) {
  if (!cheque.operation_id) return;

  let op;
  try {
    op = await base44.entities.Operation.get(cheque.operation_id);
  } catch (e) {
    // Operação não existe mais (deletada) — nada a sincronizar
    return;
  }
  if (!op) return;

  const allCheques = await base44.entities.Cheque.filter({ operation_id: cheque.operation_id });

  let updatedSchedule = op.installment_schedule || [];
  if (updatedSchedule.length > 0) {
    updatedSchedule = updatedSchedule.map((inst) => {
      const linkedCheque = allCheques.find(c =>
        c.compensation_date === inst.due_date && c.status === 'compensado'
      );
      const isPaid = !!linkedCheque;
      return { ...inst, paid: isPaid, status: isPaid ? 'pago' : 'pendente' };
    });
  }

  const totalCompensado = allCheques
    .filter(c => c.status === 'compensado' && c.id !== cheque.id)
    .reduce((s, c) => s + (c.valor_face || c.value || 0), 0);

  const totalReceivable = op.total_receivable || 0;
  const balanceDue = Math.max(0, totalReceivable - totalCompensado);

  const overdue = daysOverdue(op.due_date);
  let newStatus = overdue === 0 ? 'ativo' : overdue <= 60 ? 'atrasado' : 'inadimplente';
  if (op.status === 'pendente_contrato') newStatus = op.status;

  await base44.entities.Operation.update(op.id, {
    amount_paid: totalCompensado,
    balance_due: balanceDue,
    status: newStatus,
    realized_profit: 0,
    installment_schedule: updatedSchedule,
  });

  if (op.client_id) {
    const client = await base44.entities.Client.get(op.client_id);
    if (client) {
      const clientOps = await base44.entities.Operation.filter({ client_id: op.client_id });
      const totalPaid = clientOps.reduce((s, o) => s + (o.id === op.id ? totalCompensado : (o.amount_paid || 0)), 0);
      const totalProfit = clientOps.reduce((s, o) => s + (o.realized_profit || 0), 0);
      await base44.entities.Client.update(op.client_id, {
        total_paid: totalPaid,
        total_profit: totalProfit,
      });
    }
  }
}