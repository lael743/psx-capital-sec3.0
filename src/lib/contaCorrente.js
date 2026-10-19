import { base44 } from '@/api/base44Client';

/**
 * Recalcula o balance_after de todos os lançamentos da conta corrente de um cliente,
 * na ordem cronológica. Usado após criar novos lançamentos (ex: limite rotativo, repasses).
 */
export async function recalcBalances(clientId) {
  const lancamentos = await base44.entities.LancamentoContaCorrente.filter(
    { client_id: clientId }, 'date', 200
  );
  let running = 0;
  for (const l of lancamentos) {
    if (l.status === 'cancelado') continue;
    const debit = l.debit_amount || 0;
    const credit = l.credit_amount || 0;
    running = running - debit + credit;
    if (l.balance_after !== running) {
      await base44.entities.LancamentoContaCorrente.update(l.id, { balance_after: running });
    }
  }
}