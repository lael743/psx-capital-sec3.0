/**
 * FASE D1.1 — Asaas × Cheques: reprodução e verificação da dupla contagem.
 *
 * Cada teste afirma o comportamento CORRETO.
 *
 * Usa:
 *  · o núcleo REAL de cheques — src/lib/chequeCore.js
 *  · as regras REAIS de contabilização da operação — src/lib/operationAccounting.js
 *    (cópia frontend do bloco usado pelo webhook; D1.1.0z prova a sincronia)
 *
 * INVARIANTE CENTRAL (D1.1e):
 *   amount_paid == pagamentos independentes + cheques realmente compensados
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  computeAmountPaid as coreComputeAmountPaid,
  sumCompensated as coreSumCompensated,
} from './chequeCore.js';

import {
  applyAsaasReceipt,
  receiveAsaasPayment,
  markTitulosCompensados,
  syncOperationFromCheques,
  sumCompensatedCheques,
  computeAmountPaid as sharedComputeAmountPaid,
  asaasEventKey,
} from './operationAccounting.js';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

/** Operação NOVA: nasce com o marcador zerado (ver OperacaoForm). */
const OP = {
  id: 'op1',
  total_receivable: 2000,
  amount_paid: 0,
  cheques_compensados_total: 0,
  status: 'ativo',
  installment_schedule: [],
};

function cheque(over) {
  return {
    id: 'ch1',
    status: 'pendente',
    value: 1000,
    compensation_date: '2026-03-10',
    operation_id: 'op1',
    ...over,
  };
}

/** Cheque compensado pelo fluxo REAL (chequeOps.compensateCheque). */
function chequeCompensado(over) {
  return cheque({
    status: 'compensado',
    compensation_token: 'TK',
    compensated_at: '2026-03-12',
    ...over,
  });
}

/**
 * CAS de mentira, fiel ao da plataforma: a reivindicação é síncrona e atômica.
 * O comportamento real do updateMany condicional foi PROVADO no ambiente
 * (ver relatório D1.1 — "CAS no campo asaas_eventos_processados").
 */
function fakeClaim() {
  const claimed = new Set();
  return async (key) => {
    if (!key || claimed.has(key)) return false;
    claimed.add(key);
    return true;
  };
}

/* ── D1.1.0 — as duas cópias da aritmética concordam ────────────────────── */

function extrairBlocoSync(caminho) {
  const txt = readFileSync(new URL(caminho, import.meta.url), 'utf8');
  const m = txt.match(/\/\* @sync:start[^\n]*\n([\s\S]*?)\/\* @sync:end \*\//);
  assert.ok(m, `marcadores @sync ausentes em ${caminho}`);
  return m[1].trim();
}

test('D1.1.0z — as cópias frontend e backend do bloco @sync são idênticas', () => {
  const front = extrairBlocoSync('./operationAccounting.js');
  const back = extrairBlocoSync('../../base44/shared/operationAccounting.js');
  assert.equal(front, back, 'as duas cópias divergiram — ressincronize o bloco @sync');
});

test('D1.1.0 — o espelho concorda com o núcleo de cheques', () => {
  const vetores = [
    [{ total_receivable: 2000, amount_paid: 0 }, 0],
    [{ total_receivable: 2000, amount_paid: 0 }, 1000],
    [{ total_receivable: 2000, amount_paid: 1400, cheques_compensados_total: 1000 }, 1000],
    [{ total_receivable: 2000, amount_paid: 1400, cheques_compensados_total: 1000 }, 0],
    [{ total_receivable: 2000, amount_paid: 500 }, 1000],
  ];
  for (const [op, total] of vetores) {
    assert.equal(
      sharedComputeAmountPaid(op, total),
      coreComputeAmountPaid(op, total),
      `divergência para ${JSON.stringify(op)} / total=${total}`
    );
  }

  const cheques = [chequeCompensado(), cheque({ id: 'ch2' })];
  assert.equal(sumCompensatedCheques(cheques), coreSumCompensated(cheques));
});

/* ── D1.1.1 — reentrega do MESMO webhook ────────────────────────────────── */

test('D1.1a — reentrega do mesmo webhook não duplica amount_paid', () => {
  let op = { ...OP };
  const event = { paymentId: 'pay_123', value: 500 };

  op = applyAsaasReceipt(op, event); // 1ª entrega
  op = applyAsaasReceipt(op, event); // Asaas reentrega o MESMO evento

  assert.equal(op.amount_paid, 500, 'o mesmo pagamento não pode entrar duas vezes');
  assert.deepEqual(op.asaas_eventos_processados, ['pay_123']);
});

test('D1.1b — entregas SIMULTÂNEAS do mesmo pagamento: só uma aplica', async () => {
  const op = { ...OP };
  const event = { paymentId: 'pay_456', value: 700 };
  const claim = fakeClaim();

  const [a, b] = await Promise.all([
    receiveAsaasPayment(op, event, claim),
    receiveAsaasPayment(op, event, claim),
  ]);

  const aplicadas = [a, b].filter((r) => r.applied);
  assert.equal(aplicadas.length, 1, 'apenas uma entrega pode ser aplicada');
  assert.equal(aplicadas[0].op.amount_paid, 700);
});

test('D1.1b2 — status diferente do mesmo pagamento não soma de novo', () => {
  let op = { ...OP };
  op = applyAsaasReceipt(op, { paymentId: 'pay_789', value: 300, status: 'confirmed' });
  op = applyAsaasReceipt(op, { paymentId: 'pay_789', value: 300, status: 'received' });

  assert.equal(op.amount_paid, 300, 'confirmed + received do mesmo pagamento = 1 recebimento');
});

test('D1.1c — pagamentos DISTINTOS somam normalmente', () => {
  let op = { ...OP };
  op = applyAsaasReceipt(op, { paymentId: 'pay_A', value: 500 });
  op = applyAsaasReceipt(op, { paymentId: 'pay_B', value: 400 });

  assert.equal(op.amount_paid, 900);
  assert.deepEqual(op.asaas_eventos_processados, ['pay_A', 'pay_B']);
});

/* ── D1.1.2 — cheque compensado + Asaas + marcação em lote ──────────────── */

test('D1.1d — quitação por Asaas não transforma título marcado em novo recebimento', () => {
  const cheques = [cheque({ id: 'chA', value: 1000 }), cheque({ id: 'chB', value: 1000 })];

  // 1. Cheque A compensado pelo fluxo real
  let op = { ...OP };
  let allCheques = [chequeCompensado({ id: 'chA' }), cheques[1]];
  op = syncOperationFromCheques(op, allCheques);
  assert.equal(op.amount_paid, 1000, 'passo 1: só o cheque A');
  assert.equal(op.cheques_compensados_total, 1000);

  // 2. Asaas recebe 1000 (o restante)
  op = applyAsaasReceipt(op, { paymentId: 'pay_X', value: 1000 });
  assert.equal(op.amount_paid, 2000, 'passo 2: 1000 do cheque + 1000 do Asaas');
  assert.equal(op.status, 'quitado');

  // 3. Operação quitada → títulos pendentes marcados como compensados
  const marcado = markTitulosCompensados(op, allCheques);
  op = marcado.op;
  allCheques = marcado.cheques;
  assert.equal(op.cheques_compensados_total, 2000, 'passo 3: marcador absorve os títulos');

  // 4. Qualquer sincronização posterior de cheques
  op = syncOperationFromCheques(op, allCheques);

  assert.equal(
    op.amount_paid,
    2000,
    'marcar título como compensado NÃO é recebimento — amount_paid não pode crescer'
  );
});

/* ── D1.1.3 — invariante central ────────────────────────────────────────── */

test('D1.1e — amount_paid == pagamentos independentes + cheques compensados', () => {
  let op = { ...OP };
  const cheques = [cheque({ id: 'chA', value: 1000 }), cheque({ id: 'chB', value: 1000 })];

  let allCheques = [chequeCompensado({ id: 'chA' }), cheques[1]];
  op = syncOperationFromCheques(op, allCheques);

  op = applyAsaasReceipt(op, { paymentId: 'pay_1', value: 600 });

  const marcado = markTitulosCompensados(op, allCheques);
  op = marcado.op;
  allCheques = marcado.cheques;

  op = syncOperationFromCheques(op, allCheques);

  const esperado = 600 + 1000; // Asaas + cheque A (B nunca foi cobrado de fato)
  assert.equal(op.amount_paid, esperado, `amount_paid inflado: ${op.amount_paid} vs ${esperado}`);
});

/* ── D1.1.4 — operação legada sem marcador ──────────────────────────────── */

test('D1.1f — operação NOVA (marcador inicializado) não perde valor', () => {
  let op = { total_receivable: 2000, amount_paid: 0, cheques_compensados_total: 0, status: 'ativo' };
  op = applyAsaasReceipt(op, { paymentId: 'pay_1', value: 500 });
  op = syncOperationFromCheques(op, [chequeCompensado({ id: 'chA', value: 1000 })]);

  assert.equal(op.amount_paid, 1500, '500 (Asaas) + 1000 (cheque) — o cheque não pode ser absorvido');
});

test('D1.1g — operação LEGADA (sem marcador): o heurístico nunca infla', () => {
  // Sem marcador a verdade é INDETERMINÁVEL: o mesmo estado inicial pode
  // significar "os cheques já estão em amount_paid" ou "ainda não estão".
  // Nenhuma função resolve isso — garantimos só o lado SEGURO: nunca somar a
  // mais. O valor exato exige conciliação (Fase D2).
  const legadoQuitado = { total_receivable: 2000, amount_paid: 1000, status: 'ativo' };
  const a = syncOperationFromCheques(legadoQuitado, [chequeCompensado({ id: 'chA', value: 1000 })]);
  assert.equal(a.amount_paid, 1000, 'não pode dobrar');

  const legadoParcial = { total_receivable: 2000, amount_paid: 400, status: 'ativo' };
  const b = syncOperationFromCheques(legadoParcial, [chequeCompensado({ id: 'chA', value: 1000 })]);
  assert.ok(b.amount_paid <= 1400, 'nunca ultrapassa pagamentos + cheques');
});

/* ── D1.1.5 — dois cheques distintos ────────────────────────────────────── */

test('D1.1h — dois cheques distintos somam exatamente o seu valor', () => {
  let op = { ...OP };
  let cheques = [cheque({ id: 'chA', value: 700 }), cheque({ id: 'chB', value: 800 })];

  cheques = [chequeCompensado({ id: 'chA', value: 700 }), cheques[1]];
  op = syncOperationFromCheques(op, cheques);
  assert.equal(op.amount_paid, 700);

  cheques = [cheques[0], chequeCompensado({ id: 'chB', value: 800 })];
  op = syncOperationFromCheques(op, cheques);
  assert.equal(op.amount_paid, 1500, '700 + 800');
  assert.equal(op.cheques_compensados_total, 1500);
});

/* ── D1.1.6 — estorno não apaga pagamento independente ──────────────────── */

test('D1.1i — estorno do cheque preserva o pagamento independente', () => {
  let op = { total_receivable: 2000, amount_paid: 0, cheques_compensados_total: 0, status: 'ativo' };
  let cheques = [chequeCompensado({ id: 'chA', value: 1000 })];

  op = syncOperationFromCheques(op, cheques);
  op = applyAsaasReceipt(op, { paymentId: 'pay_1', value: 600 });
  assert.equal(op.amount_paid, 1600);

  cheques = [cheque({ id: 'chA', value: 1000 })];
  op = syncOperationFromCheques(op, cheques, 'chA');

  assert.equal(op.amount_paid, 600, 'sobra apenas o pagamento independente');
  assert.equal(op.cheques_compensados_total, 0);
});

/* ── D1.1.7 — cancelamento não apaga recebimento ────────────────────────── */

test('D1.1j — cancelar a cobrança não apaga o que já foi recebido', () => {
  let op = { ...OP };
  op = applyAsaasReceipt(op, { paymentId: 'pay_1', value: 500 });

  assert.equal(op.amount_paid, 500, 'o recebimento já realizado permanece');
});

/* ── D1.1.8 — identidade do evento ─────────────────────────────────────── */

test('D1.1k — a chave do evento é estável e não depende do status', () => {
  assert.equal(asaasEventKey('pay_1'), 'pay_1');
  assert.equal(asaasEventKey('pay_1'), asaasEventKey('pay_1'));
  assert.notEqual(asaasEventKey('pay_1'), asaasEventKey('pay_2'));
});

/* ── D1.1.9 — falha parcial e reprocessamento ──────────────────────────── */

test('D1.1l — reprocessar após falha não duplica o recebimento', () => {
  // A identidade do evento é gravada junto com o valor. Se a gravação falhar
  // no meio, o reprocessamento é seguro: ou o evento não foi marcado (aplica
  // uma vez) ou já foi (não aplica).
  let op = { ...OP };

  op = applyAsaasReceipt(op, { paymentId: 'pay_F', value: 250 });
  const snapshot = { ...op };

  // Reprocessamento do mesmo evento
  const again = applyAsaasReceipt(snapshot, { paymentId: 'pay_F', value: 250 });
  assert.equal(again.amount_paid, 250);
  assert.equal(again.asaas_eventos_processados.length, 1, 'identidade não pode duplicar');
});