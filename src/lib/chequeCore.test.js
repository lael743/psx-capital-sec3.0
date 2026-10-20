/**
 * Testes unitários do núcleo de cheques (Fase C3).
 * Somente lógica pura — NENHUM acesso a banco, nenhum dado real.
 *
 * Executar:  node --test src/lib/chequeCore.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateInstallments,
  sumCompensated,
  computeBalanceDue,
  computeOperationStatus,
  computeRealizedProfit,
  shouldCompensate,
  shouldRevert,
  chequeDueDate,
  chequeCompensatedAt,
  runIdempotentBatch,
} from './chequeCore.js';

const inst = (due_date, extra = {}) => ({ due_date, paid: false, status: 'pendente', value: 100, ...extra });

/**
 * Identidade semântica de uma parcela (independente da posição no array).
 * O array devolvido preserva a ordem de entrada — que é o correto, pois ele é
 * gravado de volta em installment_schedule. O que precisa ser estável é QUAIS
 * parcelas ficam pagas, não em que posição elas aparecem.
 */
const paidKeys = (arr) => arr.filter(p => p.paid).map(p => `${p.due_date}|${p.value}`).sort();
const chq = (id, compensation_date, extra = {}) => ({
  id, compensation_date, status: 'compensado', value: 100, valor_face: 100, ...extra,
});

// ── 1. Compensação individual com data distinta do vencimento ────────────────
test('C3.1 — data efetiva distinta do vencimento: alocação usa o VENCIMENTO', () => {
  const cheques = [chq('c1', '2026-03-10', { compensated_at: '2026-03-12' })];
  const out = allocateInstallments([inst('2026-03-10')], cheques);

  assert.equal(chequeDueDate(cheques[0]), '2026-03-10');
  assert.equal(chequeCompensatedAt(cheques[0]), '2026-03-12');
  assert.equal(out[0].paid, true, 'parcela do vencimento deve ser baixada');
  assert.equal(out[0].status, 'pago');
});

test('C3.1b — a data efetiva NÃO é usada para casar parcelas', () => {
  const cheques = [chq('c1', '2026-03-10', { compensated_at: '2026-03-12' })];
  const out = allocateInstallments([inst('2026-03-12')], cheques);
  assert.equal(out[0].paid, false, 'parcela do dia 12 não pode ser baixada pelo vencimento do dia 10');
});

// ── 2. Segunda tentativa de compensação do mesmo cheque ─────────────────────
test('C3.2 — segunda compensação do mesmo cheque é bloqueada', () => {
  assert.equal(shouldCompensate({ status: 'pendente' }), true);
  assert.equal(shouldCompensate({ status: 'compensado' }), false);
  assert.equal(shouldCompensate(null), true, 'leitura falha não bloqueia');
});

// ── 3. Compensação em lote com um item já compensado ────────────────────────
test('C3.3 — lote com item já compensado: item é pulado, demais processados', async () => {
  const status = { a: 'pendente', b: 'compensado', c: 'pendente' };
  const processados = [];

  const res = await runIdempotentBatch(['a', 'b', 'c'], {
    isAlreadyDone: (id) => status[id] === 'compensado',
    run: async (id) => { processados.push(id); status[id] = 'compensado'; },
  });

  assert.deepEqual(processados, ['a', 'c']);
  assert.deepEqual(res.skipped, ['b']);
  assert.deepEqual(res.ok, ['a', 'c']);
  assert.equal(res.failed.length, 0);
});

// ── 4. Falha simulada durante o processamento do lote ───────────────────────
test('C3.4 — falha em um item não interrompe o lote', async () => {
  const processados = [];
  const res = await runIdempotentBatch(['a', 'b', 'c'], {
    isAlreadyDone: async () => false,
    run: async (id) => {
      if (id === 'b') throw new Error('falha simulada');
      processados.push(id);
    },
  });

  assert.deepEqual(processados, ['a', 'c'], 'itens seguintes continuam após a falha');
  assert.deepEqual(res.ok, ['a', 'c']);
  assert.equal(res.failed.length, 1);
  assert.equal(res.failed[0].item, 'b');
  assert.equal(res.failed[0].error, 'falha simulada');
});

// ── 5. Estorno e segunda tentativa de estorno ───────────────────────────────
test('C3.5 — segunda tentativa de estorno é bloqueada', () => {
  assert.equal(shouldRevert({ status: 'compensado' }), true);
  assert.equal(shouldRevert({ status: 'pendente' }), false);
  assert.equal(shouldRevert(null), false);
});

// ── 6. Reversão de cheque com múltiplas parcelas na mesma data ──────────────
test('C3.6 — parcelas de mesma data: uma por cheque; estorno libera só a do cheque', () => {
  const parcelas = [inst('2026-04-10'), inst('2026-04-10'), inst('2026-05-10')];
  const cheques = [chq('c1', '2026-04-10'), chq('c2', '2026-04-10')];

  const cheio = allocateInstallments(parcelas, cheques);
  assert.equal(cheio.filter(p => p.paid).length, 2, 'dois cheques baixam duas parcelas');
  assert.equal(cheio[2].paid, false, 'parcela de maio fica em aberto');

  const estornado = allocateInstallments(parcelas, cheques, 'c1');
  assert.equal(estornado.filter(p => p.paid).length, 1, 'estorno libera exatamente uma parcela');
  assert.equal(estornado[0].paid, true, 'a primeira permanece paga (c2)');
  assert.equal(estornado[1].paid, false, 'a segunda volta a pendente');
  assert.equal(estornado[1].status, 'pendente');
});

test('C3.6b — um cheque nunca baixa duas parcelas de mesma data', () => {
  const parcelas = [inst('2026-04-10'), inst('2026-04-10')];
  const out = allocateInstallments(parcelas, [chq('c1', '2026-04-10')]);
  assert.equal(out.filter(p => p.paid).length, 1);
});

// ── 7. Operação com mais de um cheque e mais de uma parcela (determinismo) ──
test('C3.7 — resultado independe da ordem dos arrays', () => {
  const parcelas = [inst('2026-06-10'), inst('2026-07-10'), inst('2026-08-10')];
  const cheques = [chq('c3', '2026-08-10'), chq('c1', '2026-06-10'), chq('c2', '2026-07-10')];

  const a = allocateInstallments(parcelas, cheques);
  const b = allocateInstallments([...parcelas].reverse(), [...cheques].reverse());

  assert.deepEqual(paidKeys(a), paidKeys(b), 'ordem de entrada não pode alterar QUAIS parcelas ficam pagas');
  assert.equal(a.filter(p => p.paid).length, 3);
});

test('C3.7b — parcelas de mesma data: desempate por chave estável, não por posição', () => {
  const p1 = [inst('2026-04-10', { value: 1 }), inst('2026-04-10', { value: 2 })];
  const c = [chq('c1', '2026-04-10')];

  const a = allocateInstallments(p1, c);
  const b = allocateInstallments([...p1].reverse(), c);

  assert.deepEqual(paidKeys(a), paidKeys(b));
  assert.deepEqual(paidKeys(a), ['2026-04-10|1'], 'a parcela de menor valor é a escolhida, em qualquer ordem');
});

// ── 8. Falha de sincronização seguida de reprocessamento ────────────────────
test('C3.8 — reprocessar após falha não duplica efeitos', async () => {
  const status = {};
  const lancamentos = [];
  let falharPrimeira = true;

  const criarLancamento = (id) => {
    if (lancamentos.some(l => l.source_id === id)) return 'duplicate';
    lancamentos.push({ source_id: id });
    return 'created';
  };

  const rodar = () => runIdempotentBatch(['a', 'b'], {
    isAlreadyDone: async (id) => status[id] === 'compensado',
    run: async (id) => {
      criarLancamento(id);
      if (id === 'b' && falharPrimeira) throw new Error('falha na sincronização');
      status[id] = 'compensado';
    },
  });

  const r1 = await rodar();
  assert.equal(r1.failed.length, 1, 'primeira passada falha em b');
  assert.equal(lancamentos.length, 2);

  falharPrimeira = false;
  const r2 = await rodar();
  assert.deepEqual(r2.skipped, ['a'], 'a já estava concluído');
  assert.equal(r2.ok.length, 1, 'b é reprocessado');
  assert.equal(lancamentos.length, 2, 'reprocessamento NÃO duplica lançamento');
});

// ── 9. Nenhum lançamento duplicado ──────────────────────────────────────────
test('C3.9 — origem estável: mesma origem nunca gera dois lançamentos', () => {
  const ledger = [];
  const criar = (source_type, source_id) => {
    if (ledger.some(l => l.source_type === source_type && l.source_id === source_id)) return 'duplicate';
    ledger.push({ source_type, source_id });
    return 'created';
  };

  assert.equal(criar('cheque_compensacao', 'c1'), 'created');
  assert.equal(criar('cheque_compensacao', 'c1'), 'duplicate');
  assert.equal(criar('cheque_compensacao', 'c2'), 'created');
  assert.equal(criar('cheque_estorno_compensacao', 'c1'), 'created', 'evento distinto tem origem distinta');

  assert.equal(ledger.length, 3);
});

// ── 10. Saldos e parcelas coerentes ────────────────────────────────────────
test('C3.10 — saldo, soma compensada e status permanecem coerentes', () => {
  const cheques = [chq('c1', '2026-06-10', { valor_face: 400 }), chq('c2', '2026-07-10', { valor_face: 600 })];
  const op = { total_receivable: 1000, gross_value: 900, capital_cost: 0, realized_profit: 0, status: 'ativo' };

  const total = sumCompensated(cheques);
  assert.equal(total, 1000);

  const saldo = computeBalanceDue(op.total_receivable, total);
  assert.equal(saldo, 0);

  const quitado = saldo <= 0.01;
  assert.equal(quitado, true);
  assert.equal(computeOperationStatus(op, quitado, 0), 'quitado');
  assert.equal(computeRealizedProfit(op, total, quitado), 100);
});

test('C3.10b — estorno parcial NÃO zera o lucro e reabre o saldo', () => {
  const cheques = [chq('c1', '2026-06-10', { valor_face: 400 }), chq('c2', '2026-07-10', { valor_face: 600 })];
  const op = { total_receivable: 1000, gross_value: 900, capital_cost: 0, realized_profit: 100, status: 'ativo' };

  const total = sumCompensated(cheques, 'c2');
  assert.equal(total, 400);

  const saldo = computeBalanceDue(op.total_receivable, total);
  assert.equal(saldo, 600);

  const quitado = saldo <= 0.01;
  assert.equal(quitado, false);
  assert.equal(computeOperationStatus(op, quitado, 0), 'ativo');
  assert.equal(computeRealizedProfit(op, total, quitado), 100, 'lucro preservado, não zerado');
});

test('C3.10c — atraso classifica a operação sem afetar pendente_contrato', () => {
  const op = { status: 'ativo' };
  assert.equal(computeOperationStatus(op, false, 0), 'ativo');
  assert.equal(computeOperationStatus(op, false, 30), 'atrasado');
  assert.equal(computeOperationStatus(op, false, 61), 'inadimplente');
  assert.equal(computeOperationStatus({ status: 'pendente_contrato' }, false, 90), 'pendente_contrato');
});

test('C3.10d — operação sem parcelas permanece inalterada', () => {
  assert.deepEqual(allocateInstallments([], [chq('c1', '2026-01-01')]), []);
  assert.deepEqual(allocateInstallments(undefined, []), []);
});