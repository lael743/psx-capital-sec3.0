import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { applyBankDelta, chaveEvento } from '../../shared/bankLedger.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { operation_id, disbursement_bank_id, disbursement_bank_name, assessor_token } = await req.json();

    if (!operation_id || !disbursement_bank_id) {
      return Response.json({ error: 'operation_id e disbursement_bank_id são obrigatórios' }, { status: 400 });
    }

    // ── Validação do token do assessor ──
    if (!assessor_token || assessor_token.trim() === '') {
      return Response.json({ error: 'Token de segurança do assessor é obrigatório para executar o repasse.' }, { status: 403 });
    }

    // Busca assessor ativo com esse token vinculado ao usuário atual
    const assessores = await base44.asServiceRole.entities.Assessor.filter({ active: true });
    const assessorMatch = assessores.find(a => a.token === assessor_token.trim());

    if (!assessorMatch) {
      // Log tentativa inválida
      await base44.asServiceRole.entities.AuditLog.create({
        user_email: user.email,
        user_name: user.full_name || user.email,
        action: 'auth_failure',
        entity: 'Operation',
        entity_id: operation_id,
        description: `Tentativa de repasse com token inválido por ${user.email} — Op. #${operation_id.slice(-6).toUpperCase()}`,
      });
      return Response.json({ error: 'Token de segurança inválido. Acesso negado.' }, { status: 403 });
    }

    if (!assessorMatch.active) {
      return Response.json({ error: 'Assessor inativo. Contate o administrador.' }, { status: 403 });
    }

    // ── Carregar operação ──
    const operation = await base44.asServiceRole.entities.Operation.get(operation_id);
    if (!operation) {
      return Response.json({ error: 'Operação não encontrada' }, { status: 404 });
    }

    // Bloqueia se contrato pendente
    if (operation.needs_contract && !operation.contract_signed_confirmed) {
      return Response.json({ error: 'Contrato assinado não confirmado. Confirme antes de executar o repasse.' }, { status: 400 });
    }

    // ── Carregar banco ──
    const bank = await base44.asServiceRole.entities.Banco.get(disbursement_bank_id);
    if (!bank) {
      return Response.json({ error: 'Banco não encontrado' }, { status: 404 });
    }

    const today = new Date().toISOString().split('T')[0];
    const netValue = operation.net_value || 0;
    if (!(netValue > 0)) {
      return Response.json({ error: 'Operação sem valor líquido para repasse' }, { status: 400 });
    }

    const sourceType = 'repasse_cliente';
    const store = { updateWhere: (q, u) => base44.asServiceRole.entities.Banco.updateMany(q, u) };

    const criarLancamento = () =>
      base44.asServiceRole.entities.CashFlow.create({
        type: 'saida',
        category: sourceType,
        amount: netValue,
        date: today,
        description: `Repasse ao cliente ${operation.client_name} — Banco: ${disbursement_bank_name} — Op. #${operation_id.slice(-6).toUpperCase()} — Auth: ${assessorMatch.name}`,
        operation_id,
        bank_id: disbursement_bank_id,
        source_type: sourceType,
        source_id: operation_id,
        method: 'transferencia',
      });

    // Efeito de saldo: incremento atômico com guarda de chave no mesmo documento.
    const efeito = await applyBankDelta({
      store,
      bankId: disbursement_bank_id,
      delta: -netValue,
      eventKey: chaveEvento(sourceType, operation_id),
    });

    if (efeito.status === 'ja_aplicado') {
      const existentes = await base44.asServiceRole.entities.CashFlow.filter({
        source_type: sourceType,
        source_id: operation_id,
      });
      if (!existentes || existentes.length === 0) await criarLancamento();
      const atual = await base44.asServiceRole.entities.Banco.get(disbursement_bank_id);
      return Response.json({
        success: true,
        duplicate: true,
        message: 'Repasse já havia sido contabilizado para esta operação',
        new_bank_balance: atual?.current_balance ?? null,
        authorized_by: assessorMatch.name,
      });
    }

    await criarLancamento();

    // Atualiza operação para ativo
    await base44.asServiceRole.entities.Operation.update(operation_id, {
      payment_executed: true,
      payment_execution_date: today,
      disbursement_bank_id,
      disbursement_bank_name,
      assessor: assessorMatch.name,
      status: 'repasse_concluido',
    });

    // ── Audit log com responsável ──
    await base44.asServiceRole.entities.AuditLog.create({
      user_email: user.email,
      user_name: user.full_name || user.email,
      action: 'execute_disbursement',
      entity: 'Operation',
      entity_id: operation_id,
      description: `Repasse de R$ ${netValue.toFixed(2)} executado para ${operation.client_name} via ${disbursement_bank_name} — Autorizado por assessor: ${assessorMatch.name} (${assessorMatch.user_email})`,
      after: {
        assessor: assessorMatch.name,
        assessor_email: assessorMatch.user_email,
        disbursement_bank: disbursement_bank_name,
        net_value: netValue,
        execution_date: today,
      },
    });

    const bancoAtual = await base44.asServiceRole.entities.Banco.get(disbursement_bank_id);

    return Response.json({
      success: true,
      new_bank_balance: bancoAtual?.current_balance ?? null,
      authorized_by: assessorMatch.name,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});