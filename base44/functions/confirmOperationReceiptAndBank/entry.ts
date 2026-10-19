import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { operation_id, receipt_bank_id, receipt_bank_name, receipt_method } = await req.json();

    if (!operation_id || !receipt_bank_id) {
      return Response.json({ error: 'operation_id e receipt_bank_id são obrigatórios' }, { status: 400 });
    }

    // Fetch operation
    const operation = await base44.asServiceRole.entities.Operation.get(operation_id);
    if (!operation) {
      return Response.json({ error: 'Operação não encontrada' }, { status: 404 });
    }

    // Fetch bank
    const bank = await base44.asServiceRole.entities.Banco.get(receipt_bank_id);
    if (!bank) {
      return Response.json({ error: 'Banco não encontrado' }, { status: 404 });
    }

    const totalReceivable = operation.total_receivable || 0;
    const newBalance = (bank.current_balance || 0) + totalReceivable;

    // Update bank balance
    await base44.asServiceRole.entities.Banco.update(receipt_bank_id, {
      current_balance: newBalance,
    });

    // Create CashFlow entry (entrada)
    const today = new Date().toISOString().split('T')[0];
    await base44.asServiceRole.entities.CashFlow.create({
      type: 'entrada',
      category: 'recebimento_operacao',
      amount: totalReceivable,
      date: today,
      description: `Recebimento da operação ${operation_id} do cliente ${operation.client_name}`,
      operation_id,
      method: receipt_method || 'transferencia',
      balance_after: newBalance,
    });

    // Update operation with receipt bank info
    await base44.asServiceRole.entities.Operation.update(operation_id, {
      lucro_bank_id: receipt_bank_id,
      lucro_bank_name: receipt_bank_name || bank.name,
    });

    return Response.json({
      success: true,
      message: `Recebimento de ${totalReceivable} confirmado no banco ${bank.name}`,
      new_balance: newBalance,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});