import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { createOperationalCashFlow } from '../../shared/cashFlowHelper.ts';

/**
 * Funcao de teste para validar o helper createOperationalCashFlow.
 *
 * Testa:
 * 1. CashFlow operacional sem operation_id seja rejeitado
 * 2. CashFlow operacional sem bank_id seja rejeitado
 * 3. Dois eventos com o mesmo source_type + source_id nao criem dois CashFlows
 * 4. Eventos diferentes possam criar CashFlows diferentes
 * 5. CashFlow avulso continue funcionando sem operation_id
 *
 * Cria entidades temporarias, executa os testes, e limpa tudo no final.
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const results = [];
  const cleanupCashFlowIds = [];
  let testOpId = null;
  let testBancoId = null;

  try {
    // === Setup: criar Operation e Banco temporarios ===
    const testOp = await base44.asServiceRole.entities.Operation.create({
      client_name: 'TEST_CLIENT_HELPER',
      type: 'cheque',
      etapa: 'rascunho',
      gross_value: 1000,
      rate: 5,
      start_date: '2026-01-01',
      due_date: '2026-02-01',
      status: 'ativo',
    });
    testOpId = testOp.id;

    const testBanco = await base44.asServiceRole.entities.Banco.create({
      name: 'TEST_BANK_HELPER',
      active: false,
      current_balance: 0,
    });
    testBancoId = testBanco.id;

    // === Test 1: CashFlow operacional sem operation_id deve ser rejeitado ===
    try {
      await createOperationalCashFlow(base44, {
        category: 'compensacao_cheque',
        amount: 100,
        date: '2026-01-15',
        description: 'TEST: no operation_id',
        type: 'entrada',
        bank_id: testBancoId,
      });
      results.push({ test: '1_reject_without_operation_id', passed: false, error: 'Should have thrown but did not' });
    } catch (e) {
      const passed = e.message.includes('exige operation_id');
      results.push({ test: '1_reject_without_operation_id', passed, error: passed ? null : e.message });
    }

    // === Test 2: CashFlow operacional sem bank_id deve ser rejeitado ===
    try {
      await createOperationalCashFlow(base44, {
        category: 'compensacao_cheque',
        amount: 100,
        date: '2026-01-15',
        description: 'TEST: no bank_id',
        type: 'entrada',
        operation_id: testOpId,
      });
      results.push({ test: '2_reject_without_bank_id', passed: false, error: 'Should have thrown but did not' });
    } catch (e) {
      const passed = e.message.includes('exige bank_id');
      results.push({ test: '2_reject_without_bank_id', passed, error: passed ? null : e.message });
    }

    // === Test 3: CashFlow operacional valido deve ser criado ===
    const result3 = await createOperationalCashFlow(base44, {
      category: 'compensacao_cheque',
      amount: 100,
      date: '2026-01-15',
      description: 'TEST: valid operational',
      type: 'entrada',
      operation_id: testOpId,
      bank_id: testBancoId,
      source_type: 'cheque_compensacao',
      source_id: 'test_source_1',
    });
    if (result3.status === 'created' && result3.cashflow?.id) {
      cleanupCashFlowIds.push(result3.cashflow.id);
      const hasOpId = result3.cashflow.operation_id === testOpId;
      const hasBankId = result3.cashflow.bank_id === testBancoId;
      const hasSource = result3.cashflow.source_type === 'cheque_compensacao' && result3.cashflow.source_id === 'test_source_1';
      results.push({
        test: '3_create_valid_operational',
        passed: hasOpId && hasBankId && hasSource,
        details: { hasOpId, hasBankId, hasSource },
      });
    } else {
      results.push({ test: '3_create_valid_operational', passed: false, status: result3.status });
    }

    // === Test 4: Duplicata (mesmo source_type + source_id) nao deve criar segundo CashFlow ===
    const result4 = await createOperationalCashFlow(base44, {
      category: 'compensacao_cheque',
      amount: 100,
      date: '2026-01-15',
      description: 'TEST: duplicate source',
      type: 'entrada',
      operation_id: testOpId,
      bank_id: testBancoId,
      source_type: 'cheque_compensacao',
      source_id: 'test_source_1',
    });
    const passed4 = result4.status === 'duplicate' && result4.existing?.id === result3.cashflow?.id;
    results.push({
      test: '4_reject_duplicate_source',
      passed: passed4,
      status: result4.status,
      existingId: result4.existing?.id,
    });

    // === Test 5: Evento diferente (source_id diferente) deve criar novo CashFlow ===
    const result5 = await createOperationalCashFlow(base44, {
      category: 'compensacao_cheque',
      amount: 200,
      date: '2026-01-16',
      description: 'TEST: different source',
      type: 'entrada',
      operation_id: testOpId,
      bank_id: testBancoId,
      source_type: 'cheque_compensacao',
      source_id: 'test_source_2',
    });
    if (result5.status === 'created' && result5.cashflow?.id) {
      cleanupCashFlowIds.push(result5.cashflow.id);
      const isDifferent = result5.cashflow.id !== result3.cashflow?.id;
      results.push({ test: '5_create_different_source', passed: isDifferent, id: result5.cashflow.id });
    } else {
      results.push({ test: '5_create_different_source', passed: false, status: result5.status });
    }

    // === Test 6: CashFlow avulso (categoria nao operacional) sem operation_id deve funcionar ===
    const result6 = await createOperationalCashFlow(base44, {
      category: 'despesa',
      amount: 50,
      date: '2026-01-15',
      description: 'TEST: avulso without operation_id',
      type: 'saida',
    });
    if (result6.status === 'created' && result6.cashflow?.id) {
      cleanupCashFlowIds.push(result6.cashflow.id);
      const noOpId = !result6.cashflow.operation_id;
      results.push({ test: '6_create_avulso_no_operation', passed: noOpId, id: result6.cashflow.id });
    } else {
      results.push({ test: '6_create_avulso_no_operation', passed: false, status: result6.status });
    }

    // === Test 7: CashFlow bancario (lancamento_avulso) sem bank_id deve ser rejeitado ===
    try {
      await createOperationalCashFlow(base44, {
        category: 'lancamento_avulso',
        amount: 50,
        date: '2026-01-15',
        description: 'TEST: bank category without bank_id',
        type: 'entrada',
      });
      results.push({ test: '7_reject_bank_category_without_bank_id', passed: false, error: 'Should have thrown' });
    } catch (e) {
      const passed = e.message.includes('exige bank_id');
      results.push({ test: '7_reject_bank_category_without_bank_id', passed, error: passed ? null : e.message });
    }

  } catch (error) {
    results.push({ test: 'setup_or_execution', passed: false, error: error.message, stack: error.stack });
  } finally {
    // === Cleanup ===
    const cleanupErrors = [];
    for (const id of cleanupCashFlowIds) {
      try {
        await base44.asServiceRole.entities.CashFlow.delete(id);
      } catch (e) {
        cleanupErrors.push({ id, error: e.message });
      }
    }
    if (testOpId) {
      try {
        await base44.asServiceRole.entities.Operation.delete(testOpId);
      } catch (e) {
        cleanupErrors.push({ entity: 'Operation', id: testOpId, error: e.message });
      }
    }
    if (testBancoId) {
      try {
        await base44.asServiceRole.entities.Banco.delete(testBancoId);
      } catch (e) {
        cleanupErrors.push({ entity: 'Banco', id: testBancoId, error: e.message });
      }
    }
  }

  const allPassed = results.every(r => r.passed);
  return Response.json({
    success: allPassed,
    totalTests: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    results,
  });
});