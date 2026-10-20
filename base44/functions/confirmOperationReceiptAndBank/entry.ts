import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { applyBankDelta, chaveEvento } from '../../shared/bankLedger.ts';

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
    if (!(totalReceivable > 0)) {
      return Response.json({ error: 'Operação sem valor a receber' }, { status: 400 });
    }

    const sourceType = 'recebimento_operacao';
    const eventKey = chaveEvento(sourceType, operation_id);
    const store = { updateWhere: (q, u) => base44.asServiceRole.entities.Banco.updateMany(q, u) };
    const today = new Date().toISOString().split('T')[0];

    const criarLancamento = () =>
      base44.asServiceRole.entities.CashFlow.create({
        type: 'entrada',
        category: sourceType,
        amount: totalReceivable,
        date: today,
        description: `Recebimento da operação ${operation_id} do cliente ${operation.client_name}`,
        operation_id,
        bank_id: receipt_bank_id,
        source_type: sourceType,
        source_id: operation_id,
        method: receipt_method || 'transferencia',
      });

    // Efeito de saldo: incremento atômico com guarda de chave no mesmo documento.
    const efeito = await applyBankDelta({
      store,
      bankId: receipt_bank_id,
      delta: totalReceivable,
      eventKey,
    });

    if (efeito.status === 'ja_aplicado') {
      // O saldo já foi creditado por esta operação. Completa o lançamento se ele
      // faltou (falha parcial anterior) e devolve sem creditar de novo.
      const existentes = await base44.asServiceRole.entities.CashFlow.filter({
        source_type: sourceType,
        source_id: operation_id,
      });
      if (!existentes || existentes.length === 0) await criarLancamento();
      const atual = await base44.asServiceRole.entities.Banco.get(receipt_bank_id);
      return Response.json({
        success: true,
        duplicate: true,
        message: 'Recebimento já havia sido contabilizado para esta operação',
        new_balance: atual?.current_balance ?? null,
      });
    }

    await criarLancamento();

    // Update operation with receipt bank info
    await base44.asServiceRole.entities.Operation.update(operation_id, {
      lucro_bank_id: receipt_bank_id,
      lucro_bank_name: receipt_bank_name || bank.name,
    });

    const bancoAtual = await base44.asServiceRole.entities.Banco.get(receipt_bank_id);

    return Response.json({
      success: true,
      message: `Recebimento de ${totalReceivable} confirmado no banco ${bank.name}`,
      new_balance: bancoAtual?.current_balance ?? null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});