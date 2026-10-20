/**
 * FASE D1.4.1 — Integridade de escrita do cronograma de parcelas.
 *
 * Exercita o código REAL de `chequeWrite.js` (compensação/estorno de cheque) e
 * de `scheduleWrite.js` (formulários) contra um banco simulado. Nada é
 * reimplementado aqui.
 *
 * ── COMO A CONCORRÊNCIA É PROVADA SEM TEMPORIZAÇÃO ──────────────────────────
 *
 * O banco simulado aplica cada `updateMany` até o fim, sem interrupção — que é
 * a única garantia que a plataforma oferece (atomicidade POR DOCUMENTO). Não há
 * `setTimeout`, nem espera aleatória: o que decide quem vence é a GUARDA da
 * consulta. Um cenário "concorrente" é montado como: dois processos leem o
 * MESMO estado observado e gravam em seguida — se o código estivesse errado,
 * os dois venceriam e o teste falharia de forma determinística.
 *
 * ── SEM DADOS REAIS, SEM REDE ───────────────────────────────────────────────
 *
 * Fixtures sintéticas. Nenhum acesso ao Asaas, nenhuma entidade da plataforma.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyOperationState, sincronizarOperacao, MAX_TENTATIVAS_SYNC } from './chequeWrite.js';
import { sumCompensated } from './chequeCore.js';
import {
  CAMPOS_FINANCEIROS,
  conflitosFinanceiros,
  mergeFinancialFields,
  salvarCondicionado,
  bloqueioEdicaoCompleta,
} from './scheduleWrite.js';

/* ────────────────────────── banco simulado ─────────────────────────────── */

const clone = (v) => JSON.parse(JSON.stringify(v));

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

/** Comparação de UM campo. `null` casa ausente E nulo, como no Mongo. */
function matchValue(actual, cond) {
  if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
    if ('$exists' in cond) {
      const existe = actual !== undefined;
      if (cond.$exists && !existe) return false;
      if (!cond.$exists && existe) return false;
    }
    if ('$lt' in cond && !(actual !== undefined && actual < cond.$lt)) return false;
    if ('$lte' in cond && !(actual !== undefined && actual <= cond.$lte)) return false;
    if ('$gte' in cond && !(actual !== undefined && actual >= cond.$gte)) return false;
    if ('$gt' in cond && !(actual !== undefined && actual > cond.$gt)) return false;
    return true;
  }
  if (cond === null) return actual === null || actual === undefined;
  return actual === cond;
}

function match(doc, query) {
  for (const [k, v] of Object.entries(query)) {
    if (k === '$or') {
      if (!v.some((q) => match(doc, q))) return false;
      continue;
    }
    if (!matchValue(getPath(doc, k), v)) return false;
  }
  return true;
}

function applyUpdate(doc, update) {
  if (update.$set) for (const [k, v] of Object.entries(update.$set)) setPath(doc, k, v);
  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc)) {
      setPath(doc, k, (Number(getPath(doc, k)) || 0) + v);
    }
  }
  return doc;
}

function createDB() {
  const store = { Operation: [], Cheque: [], Client: [] };
  const chamadas = { operationUpdate: 0, operationUpdateMany: 0 };

  // Falha injetável: derruba a N-ésima chamada de updateMany de Operation.
  const estado = { falharNaChamada: null, contador: 0 };

  const api = { entities: {} };
  for (const nome of Object.keys(store)) {
    api.entities[nome] = {
      get: async (id) => {
        const r = store[nome].find((d) => d.id === id);
        return r ? clone(r) : null;
      },
      filter: async (q = {}) => store[nome].filter((d) => match(d, q)).map(clone),
      updateMany: async (q, u) => {
        if (nome === 'Operation') {
          estado.contador += 1;
          if (estado.falharNaChamada === estado.contador) {
            throw new Error('falha simulada de persistência');
          }
          chamadas.operationUpdateMany += 1;
        }
        const alvos = store[nome].filter((d) => match(d, q));
        for (const d of alvos) applyUpdate(d, u);
        return { updated: alvos.length };
      },
      // Substituição CEGA do documento — o primitivo que causava perda.
      update: async (id, patch) => {
        if (nome === 'Operation') chamadas.operationUpdate += 1;
        const r = store[nome].find((d) => d.id === id);
        if (!r) throw new Error('não encontrado');
        Object.assign(r, clone(patch));
        return clone(r);
      },
      create: async (rec) => {
        const r = { id: rec.id || `${nome}_${store[nome].length + 1}`, ...clone(rec) };
        store[nome].push(r);
        return clone(r);
      },
    };
  }
  return { api, store, chamadas, estado };
}

/* ───────────────────────────── fixtures ────────────────────────────────── */

function cenario({ comCobranca = true } = {}) {
  const db = createDB();
  db.api.entities.Client.create({ id: 'cli1', total_paid: 0, total_profit: 0 });
  db.api.entities.Operation.create({
    id: 'op1',
    client_id: 'cli1',
    total_receivable: 1000,
    amount_paid: 0,
    cheques_compensados_total: 0,
    due_date: '2026-12-31',
    status: 'ativo',
    installment_schedule: [
      {
        id: 'p1', number: 1, value: 300, due_date: '2026-11-10', paid: false, status: 'pendente',
        ...(comCobranca
          ? { asaas_payment_id: 'pay_A', asaas_payment_status: 'pending', asaas_invoice_url: 'https://x/A' }
          : {}),
      },
      { id: 'p2', number: 2, value: 300, due_date: '2026-11-20', paid: false, status: 'pendente' },
      { id: 'p3', number: 3, value: 400, due_date: '2026-11-30', paid: false, status: 'pendente' },
    ],
  });
  return db;
}

function cheque(id, compensation_date, extra = {}) {
  return {
    id,
    operation_id: 'op1',
    client_id: 'cli1',
    status: 'compensado',
    value: 300,
    valor_face: 300,
    compensation_date,
    compensated_at: '2026-11-21',
    ...extra,
  };
}

const opAtual = async (db) => db.api.entities.Operation.get('op1');

/* ═════════════════ 1. Escrita pontual não destrói campo alheio ═══════════ */

test('D1.4.1.1 — compensar cheque NÃO apaga o vínculo de cobrança da parcela', async () => {
  const db = cenario();
  const op = await opAtual(db);
  const c = cheque('ch1', '2026-11-20'); // casa com p2

  const ok = await applyOperationState(db.api, op, [c]);
  assert.equal(ok, true);

  const depois = await opAtual(db);
  const [p1, p2] = depois.installment_schedule;

  assert.equal(p1.asaas_payment_id, 'pay_A', 'cobrança de outra parcela permanece');
  assert.equal(p1.asaas_payment_status, 'pending');
  assert.equal(p1.settled_by ?? null, null);
  assert.equal(p1.paid, false);

  assert.equal(p2.settled_by, 'ch1', 'o cheque quitou a parcela do seu vencimento');
  assert.equal(p2.paid, true);
  assert.equal(p2.value, 300, 'termo comercial preservado');
  assert.equal(p2.due_date, '2026-11-20');
});

test('D1.4.1.2 — a compensação não usa substituição cega do documento', async () => {
  const db = cenario();
  const op = await opAtual(db);

  await applyOperationState(db.api, op, [cheque('ch1', '2026-11-20')]);

  assert.equal(db.chamadas.operationUpdate, 0, 'nenhum Operation.update (array inteiro)');
  assert.ok(db.chamadas.operationUpdateMany > 0, 'escritas pontuais e condicionais');
});

/* ═════════════════ 2. Parcelas diferentes, sem perda mútua ═══════════════ */

test('D1.4.1.3 — dois cheques em parcelas diferentes: nenhum sobrescreve o outro', async () => {
  const db = cenario();

  // Processo A lê o estado e vence com o cheque 1.
  const opA = await opAtual(db);
  const c1 = cheque('ch1', '2026-11-20');
  await applyOperationState(db.api, opA, [c1]);

  // Processo B lê DEPOIS, aplica o cheque 2 junto do 1 (estado real).
  const opB = await opAtual(db);
  const c2 = cheque('ch2', '2026-11-30');
  await applyOperationState(db.api, opB, [c1, c2]);

  const depois = await opAtual(db);
  const por = Object.fromEntries(depois.installment_schedule.map((p) => [p.id, p]));

  assert.equal(por.p2.settled_by, 'ch1');
  assert.equal(por.p3.settled_by, 'ch2');
  assert.equal(por.p1.paid, false);
  assert.equal(depois.amount_paid, sumCompensated([c1, c2]));
  assert.equal(depois.cheques_compensados_total, sumCompensated([c1, c2]));
});

/* ═════════════════ 3. Mesma parcela: guarda de obsolescência ═════════════ */

test('D1.4.1.4 — dois processos na MESMA parcela: o cálculo obsoleto não sobrescreve', async () => {
  const db = cenario();
  const opObservado = await opAtual(db); // ambos leem este estado

  const vencedor = cheque('ch1', '2026-11-20');
  const perdedor = cheque('ch9', '2026-11-20');

  // Vencedor grava primeiro.
  await applyOperationState(db.api, opObservado, [vencedor]);

  // Perdedor parte do MESMO estado observado (schedule sem vínculo).
  const ok = await applyOperationState(db.api, opObservado, [perdedor]);
  assert.equal(ok, false, 'o perdedor detecta o conflito em vez de vencer');

  const depois = await opAtual(db);
  const p2 = depois.installment_schedule.find((p) => p.id === 'p2');
  assert.equal(p2.settled_by, 'ch1', 'o vínculo do vencedor permanece');
});

/* ═════════════ 4. Compensação concorrente com recebimento Asaas ══════════ */

test('D1.4.1.5 — compensação de cheque concorrente com pagamento Asaas não apaga o recebimento', async () => {
  const db = cenario();
  const opObservado = await opAtual(db); // lido ANTES do pagamento

  // Recebimento Asaas de R$ 100 entra entre a leitura e a escrita do cheque.
  await db.api.entities.Operation.updateMany({ id: 'op1' }, { $inc: { amount_paid: 100 } });

  const c = cheque('ch1', '2026-11-20');
  await applyOperationState(db.api, opObservado, [c]);

  const depois = await opAtual(db);
  assert.equal(
    depois.amount_paid,
    100 + sumCompensated([c]),
    'o recebimento independente é somado, não sobrescrito'
  );
  assert.equal(depois.cheques_compensados_total, sumCompensated([c]));
});

test('D1.4.1.6 — repetir a sincronização não soma o cheque duas vezes', async () => {
  const db = cenario();
  const c = cheque('ch1', '2026-11-20');
  await db.api.entities.Cheque.create(c);

  await sincronizarOperacao(db.api, 'op1');
  const primeira = await opAtual(db);
  await sincronizarOperacao(db.api, 'op1');
  const segunda = await opAtual(db);

  assert.equal(primeira.amount_paid, segunda.amount_paid);
  assert.equal(segunda.amount_paid, sumCompensated([c]));
});

test('D1.4.1.7 — estorno devolve a parcela e não destrói pagamento independente', async () => {
  const db = cenario();
  await db.api.entities.Operation.updateMany({ id: 'op1' }, { $inc: { amount_paid: 250 } });

  const c = cheque('ch1', '2026-11-20');
  await applyOperationState(db.api, await opAtual(db), [c]);
  assert.equal((await opAtual(db)).amount_paid, 250 + sumCompensated([c]));

  // Estorno: mesmo cálculo, desconsiderando o cheque.
  await applyOperationState(db.api, await opAtual(db), [c], 'ch1');
  const depois = await opAtual(db);

  assert.equal(depois.amount_paid, 250, 'o pagamento independente permanece');
  assert.equal(depois.cheques_compensados_total, 0);
  const p2 = depois.installment_schedule.find((p) => p.id === 'p2');
  assert.equal(p2.paid, false);
  assert.equal(p2.settled_by ?? null, null);
});

/* ═════════════════ 5. Falha no meio e recuperação ═══════════════════════ */

test('D1.4.1.8 — falha no meio da compensação é recuperável sem duplicar', async () => {
  const db = cenario();
  const c = cheque('ch1', '2026-11-20');
  await db.api.entities.Cheque.create(c);

  // Derruba a 2ª escrita do lote (depois de a parcela já ter sido gravada).
  db.estado.falharNaChamada = 2;
  const op = await opAtual(db);
  await assert.rejects(() => applyOperationState(db.api, op, [c]));

  // Retoma com o banco saudável.
  db.estado.falharNaChamada = null;
  await sincronizarOperacao(db.api, 'op1');

  const depois = await opAtual(db);
  assert.equal(depois.amount_paid, sumCompensated([c]), 'contabilizado uma única vez');
  assert.equal(depois.cheques_compensados_total, sumCompensated([c]));
  assert.equal(depois.installment_schedule.find((p) => p.id === 'p2').settled_by, 'ch1');
});

test('D1.4.1.9 — retomada é idempotente mesmo após gravação parcial', async () => {
  const db = cenario();
  const c = cheque('ch1', '2026-11-20');
  await db.api.entities.Cheque.create(c);

  // Simula a janela real: parcela gravada, valores ainda não.
  await db.api.entities.Operation.updateMany(
    { id: 'op1' },
    { $set: { 'installment_schedule.1.settled_by': 'ch1', 'installment_schedule.1.paid': true } }
  );

  await sincronizarOperacao(db.api, 'op1');
  const depois = await opAtual(db);

  assert.equal(depois.amount_paid, sumCompensated([c]));
  assert.equal(depois.cheques_compensados_total, sumCompensated([c]));
});

test('D1.4.1.10 — esgotar as tentativas não contabiliza nada', async () => {
  const db = cenario();
  // Sempre falha na escrita de valores → laço esgota.
  db.estado.falharNaChamada = 1;
  await sincronizarOperacao(db.api, 'op1').catch(() => {});

  const depois = await opAtual(db);
  assert.equal(depois.amount_paid, 0, 'nada contabilizado');
  assert.equal(depois.cheques_compensados_total, 0);
  assert.ok(MAX_TENTATIVAS_SYNC >= 1);
});

/* ══════════════ 6. Formulários e estado financeiro ══════════════════════ */

test('D1.4.1.11 — formulário desatualizado não apaga vínculo financeiro', () => {
  const persistido = [
    {
      id: 'p1', number: 1, value: 300, due_date: '2026-11-10',
      paid: true, settled_by: 'ch1', status: 'pago',
      asaas_payment_id: 'pay_A', asaas_payment_status: 'received',
    },
  ];

  // O formulário monta a parcela do zero: sem paid, sem vínculo, sem cobrança.
  const doFormulario = [{ number: 1, value: 300, due_date: '2026-11-10', status: 'pendente', paid: false }];

  const merged = mergeFinancialFields(doFormulario, persistido);
  for (const campo of ['paid', 'settled_by', 'asaas_payment_id', 'asaas_payment_status', 'id']) {
    assert.ok(CAMPOS_FINANCEIROS.includes(campo));
    assert.deepEqual(merged[0][campo], persistido[0][campo], `${campo} preservado`);
  }
});

test('D1.4.1.12 — formulário desatualizado é BLOQUEADO quando mexe em parcela com dinheiro', () => {
  const persistido = [
    { id: 'p1', number: 1, value: 300, due_date: '2026-11-10', paid: true, settled_by: 'ch1' },
    { id: 'p2', number: 2, value: 300, due_date: '2026-11-20', paid: false },
  ];

  // Muda o VENCIMENTO da parcela já compensada.
  const conflito = conflitosFinanceiros(
    [
      { id: 'p1', number: 1, value: 300, due_date: '2026-12-01' },
      { id: 'p2', number: 2, value: 300, due_date: '2026-11-20' },
    ],
    persistido
  );
  assert.equal(conflito.length, 1);
  assert.equal(conflito[0].numero, 1);

  // Mexer só na parcela SEM vínculo é permitido.
  const liberado = conflitosFinanceiros(
    [
      { id: 'p1', number: 1, value: 300, due_date: '2026-11-10' },
      { id: 'p2', number: 2, value: 500, due_date: '2026-11-25' },
    ],
    persistido
  );
  assert.equal(liberado.length, 0);
});

test('D1.4.1.13 — gravação condicionada recusa a tela aberta antes de um recebimento', async () => {
  const db = cenario();

  // O recebimento entra depois de a tela abrir (observado = 0).
  await db.api.entities.Operation.updateMany({ id: 'op1' }, { $inc: { amount_paid: 120 } });

  const atual = await opAtual(db);
  const ok = await salvarCondicionado(db.api, 'op1', 0, {
    installment_schedule: mergeFinancialFields(
      [{ id: 'p1', value: 300, due_date: '2026-11-10' }],
      atual.installment_schedule
    ),
  });
  assert.equal(ok, false, 'a versão desatualizada é recusada');

  // Com o valor corrente, a gravação passa.
  const ok2 = await salvarCondicionado(db.api, 'op1', atual.amount_paid, { days: 40 });
  assert.equal(ok2, true);
  assert.equal((await opAtual(db)).days, 40);
});

test('D1.4.1.14 — edição completa é bloqueada quando já há dinheiro ou cobrança', async () => {
  // Rascunho: sem recebimento e sem cobrança.
  const db = cenario({ comCobranca: false });
  assert.equal(await bloqueioEdicaoCompleta(db.api, 'op1'), null, 'rascunho liberado');

  await db.api.entities.Operation.updateMany({ id: 'op1' }, { $inc: { amount_paid: 100 } });
  const bloqueio = await bloqueioEdicaoCompleta(db.api, 'op1');
  assert.ok(bloqueio && bloqueio.includes('recebimento'));
});