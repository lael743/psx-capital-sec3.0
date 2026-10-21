/**
 * M5.1 — FECHAMENTO POR MODALIDADE E COERÊNCIA DE ESTADO.
 *
 * Prova, na regra pura, que a etapa `pagamento` NÃO conclui a operação sem a
 * prova de repasse (`payment_executed`) em NENHUMA modalidade — inclusive na
 * assinatura, cuja cobrança Asaas é origem de receita futura e não repasse ao
 * cedente. Antes desta correção, a assinatura finalizava só com a assinatura
 * emitida, deixando operação concluída sem dinheiro ter saído.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { avaliarTransicao, ACOES } from './operationWorkflow.js';

const admin = { role: 'admin', email: 'admin@psx.test', full_name: 'Admin' };

function operacao(extra = {}) {
  return {
    id: 'op1',
    numero_operacao: 1,
    etapa: 'pagamento',
    status: 'ativo',
    type: 'cheque',
    produto: 'cheque',
    payment_executed: false,
    total_receivable: 1000,
    amount_paid: 0,
    ...extra,
  };
}

function decidir(op, contexto = {}) {
  return avaliarTransicao({
    operacao: op,
    titulos: [],
    contexto,
    usuario: admin,
    acao: ACOES.AVANCAR,
    motivo: '',
  });
}

test('M5.1.1 — nenhuma modalidade conclui a operação sem repasse executado', () => {
  const modalidades = [
    { type: 'cheque', produto: 'cheque' },
    { type: 'boleto', produto: 'boleto' },
    { type: 'emprestimo', produto: 'capital_desagio' },
    { type: 'assinatura', produto: 'assinatura' },
  ];

  for (const m of modalidades) {
    const decisao = decidir(
      operacao({ ...m, asaas_subscription_id: 'sub_123', asaas_payment_id: 'pay_123' }),
      { temVinculoAssinatura: true },
    );
    assert.equal(decisao.permitida, false, `${m.produto}: não pode concluir sem repasse`);
    assert.ok(
      (decisao.bloqueios || []).some((b) => /repasse/i.test(b)),
      `${m.produto}: motivo precisa citar o repasse`,
    );
    assert.equal(decisao.etapaAtual, 'pagamento', `${m.produto}: bloqueio na etapa de pagamento`);
  }
});

test('M5.1.2 — cobrança/assinatura Asaas NÃO substitui a prova de repasse', () => {
  const decisao = decidir(
    operacao({ type: 'assinatura', produto: 'assinatura', asaas_subscription_id: 'sub_123' }),
    { temVinculoAssinatura: true },
  );
  assert.equal(decisao.permitida, false, 'emissão de cobrança não é repasse');
});

test('M5.1.3 — com repasse executado, a operação conclui (todas as modalidades)', () => {
  const modalidades = ['cheque', 'boleto', 'capital_desagio', 'assinatura'];
  for (const produto of modalidades) {
    const decisao = decidir(
      operacao({ produto, payment_executed: true, payment_execution_date: '2026-10-20' }),
      { temVinculoAssinatura: true },
    );
    assert.equal(decisao.permitida, true, `${produto}: com repasse deve concluir`);
    assert.equal(decisao.destino, 'finalizada');
  }
});

test('M5.1.4 — assinatura sem cobrança emitida conclui com AVISO, não com bloqueio', () => {
  const decisao = decidir(
    operacao({ type: 'assinatura', produto: 'assinatura', payment_executed: true }),
    { temVinculoAssinatura: false },
  );
  assert.equal(decisao.permitida, true, 'o repasse é o pré-requisito; a cobrança é aviso');
  assert.ok((decisao.avisos || []).some((a) => /Asaas/i.test(a)), 'deve avisar sobre a cobrança');
});

test('M5.1.5 — etapa já finalizada não avança de novo (coerência de estado)', () => {
  const decisao = decidir(operacao({ etapa: 'finalizada', payment_executed: true }));
  assert.equal(decisao.permitida, false, 'finalizada é estado terminal');
});

test('M5.1.6 — etapa rejeitada não avança por "avançar" (só por reabrir)', () => {
  const decisao = decidir(operacao({ etapa: 'rejeitada', payment_executed: true }));
  assert.equal(decisao.permitida, false);
});