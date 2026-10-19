import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const OP_TYPE_MAP = { emprestimo: 'emprestimo', cheque: 'cheque', boleto: 'boleto' };
const STATUS_MAP = {
  pendente_contrato: 'em_aberto', repasse_concluido: 'em_aberto',
  ativo: 'em_aberto', quitado: 'baixado', atrasado: 'vencido', inadimplente: 'vencido',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { client_id, operation_id, data, event } = body || {};

    // Payload vindo da automação de entidade (Operation create/update)
    if (event && data && event.entity_name === 'Operation') {
      const op = data;
      if (!op.client_id) return Response.json({ success: true, reason: 'sem cliente vinculado' });
      const client = await base44.asServiceRole.entities.Client.get(op.client_id);
      if (!client) return Response.json({ success: true, reason: 'cliente não encontrado' });
      await upsertLancamento(base44, op, client);
      await recalcBalances(base44, op.client_id);
      return Response.json({ success: true });
    }

    // Payload manual: operation_id específico
    if (operation_id) {
      const op = await base44.asServiceRole.entities.Operation.get(operation_id);
      if (!op) return Response.json({ error: 'Operação não encontrada' }, { status: 404 });
      if (!op.client_id) return Response.json({ error: 'Operação sem cliente vinculado' }, { status: 400 });
      const client = await base44.asServiceRole.entities.Client.get(op.client_id);
      await upsertLancamento(base44, op, client);
      await recalcBalances(base44, op.client_id);
      return Response.json({ success: true });
    }

    // Payload manual: sincroniza cliente inteiro
    if (client_id) {
      const client = await base44.asServiceRole.entities.Client.get(client_id);
      if (!client) return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });
      const ops = await base44.asServiceRole.entities.Operation.filter({ client_id }, null, 50);
      for (const op of ops) {
        await upsertLancamento(base44, op, client);
      }
      await recalcBalances(base44, client_id);
      return Response.json({ success: true, synced: ops.length });
    }

    return Response.json({ error: 'Informe client_id ou operation_id' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function upsertLancamento(base44, op, client) {
  const existing = await base44.asServiceRole.entities.LancamentoContaCorrente.filter({ operation_id: op.id }, null, 1);
  const lancType = OP_TYPE_MAP[op.type] || 'emprestimo';
  const rate = op.rate || client.default_rate || 0;
  const debitAmount = op.total_receivable || op.gross_value || 0;
  const status = STATUS_MAP[op.status] || 'em_aberto';
  const paid = op.amount_paid || 0;
  const effectiveStatus = paid > 0 && paid < debitAmount ? 'parcialmente_baixado'
    : paid >= debitAmount ? 'baixado' : status;

  const data = {
    client_id: op.client_id,
    client_name: client.name,
    type: lancType,
    nature: 'debito',
    date: op.start_date || op.created_date?.split('T')[0] || new Date().toISOString().split('T')[0],
    description: `Operação #${(op.id || '').slice(-6)} — ${op.type}`,
    gross_value: op.gross_value || 0,
    rate,
    interest_type: op.interest_type || 'composto',
    due_date: op.due_date || '',
    net_value: op.net_value || op.gross_value || 0,
    debit_amount: debitAmount,
    credit_amount: 0,
    status: effectiveStatus,
    operation_id: op.id,
    amortized_amount: paid,
    notes: op.notes || '',
  };

  if (existing.length > 0) {
    await base44.asServiceRole.entities.LancamentoContaCorrente.update(existing[0].id, data);
  } else {
    await base44.asServiceRole.entities.LancamentoContaCorrente.create(data);
  }
}

async function recalcBalances(base44, clientId) {
  const lancamentos = await base44.asServiceRole.entities.LancamentoContaCorrente.filter(
    { client_id: clientId }, 'date', 200
  );

  let runningBalance = 0;
  for (const l of lancamentos) {
    if (l.status === 'cancelado') continue;
    const debit = l.debit_amount || 0;
    const credit = l.credit_amount || 0;
    runningBalance = runningBalance - debit + credit;
    if (l.balance_after !== runningBalance) {
      await base44.asServiceRole.entities.LancamentoContaCorrente.update(l.id, { balance_after: runningBalance });
    }
  }
}