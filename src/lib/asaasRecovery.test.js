/**
 * FASE D1.2 — Recuperação idempotente, concorrência e integridade dos recebimentos.
 *
 * Exercita o fluxo REAL (src/lib/asaasReceiptFlow.js — cópia idêntica do módulo
 * de backend, provada por D1.2.0b) contra um banco em memória que reproduz
 * fielmente a semântica da plataforma COMPROVADA no ambiente
 * (relatório D1.2 — "sonda de capacidades"):
 *
 *   · updateMany com guarda + $inc + $push é UMA escrita atômica por documento
 *   · a guarda $ne bloqueia a reentrega do mesmo evento
 *
 * O banco falso é deliberadamente burro — só o que o banco real faz. Toda a
 * inteligência sob teste vem do módulo real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  processReceipt,
  recoverEvento,
  applyReceiptAtomically,
  recomputeDerived,
} from './asaasReceiptFlow.js';
import {
  EVENTO_STATUS,
  STALE_SECONDS,
  classifyEvento,
  needsRecovery,
} from './asaasEventJournal.js';
import {
  applyAsaasReceipt,
  syncOperationFromCheques,
  sumCompensatedCheques,
} from './operationAccounting.js';

/* ── Banco em memória fiel à plataforma ────────────────────────────────────── */

const cloneSimples = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

/** Leitura/escrita por caminho pontilhado — `installment_schedule.0.status`. */
function lerPath(obj, p) {
  return p.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
}
function gravarPath(obj, p, v) {
  const ks = p.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] === undefined || o[ks[i]] === null) o[ks[i]] = {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = v;
}

/** Casamento de consulta — o subconjunto comprovado da plataforma (D1.2/D1.3). */
function casaCom(e, q) {
  for (const [k, v] of Object.entries(q)) {
    if (k === '$or') {
      if (!v.some((s) => casaCom(e, s))) return false;
      continue;
    }
    const val = lerPath(e, k);
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if ('$ne' in v) {
        // sobre array: "não contém"
        if (Array.isArray(val)) {
          if (val.includes(v.$ne)) return false;
        } else if (val === v.$ne) return false;
        continue;
      }
      if ('$in' in v) {
        if (!v.$in.includes(val)) return false;
        continue;
      }
      if ('$lt' in v) {
        if (!(String(val || '') < String(v.$lt))) return false;
        continue;
      }
      if ('$exists' in v) {
        if ((val !== undefined) !== v.$exists) return false;
        continue;
      }
      return false;
    }
    if (Array.isArray(val)) {
      if (!val.includes(v)) return false;
    } else if (val !== v) return false;
  }
  return true;
}

/** Aplica os operadores de atualização usados pelo fluxo. */
function aplicarUpdate(rec, u) {
  if (u.$set) for (const [k, v] of Object.entries(u.$set)) gravarPath(rec, k, cloneSimples(v));
  if (u.$inc) for (const [k, v] of Object.entries(u.$inc)) gravarPath(rec, k, (lerPath(rec, k) || 0) + v);
  if (u.$push) for (const [k, v] of Object.entries(u.$push)) gravarPath(rec, k, [...(lerPath(rec, k) || []), v]);
  if (u.$addToSet)
    for (const [k, v] of Object.entries(u.$addToSet)) {
      const atual = lerPath(rec, k) || [];
      if (!atual.includes(v)) gravarPath(rec, k, [...atual, v]);
    }
  if (u.$pull) for (const [k, v] of Object.entries(u.$pull)) gravarPath(rec, k, (lerPath(rec, k) || []).filter((x) => x !== v));
  if (u.$unset) for (const k of Object.keys(u.$unset)) gravarPath(rec, k, undefined);
}

function fakePlatform() {
  const ops = new Map();
  const lancs = new Map();
  const eventos = new Map();
  const faults = new Set();
  let seq = 0;

  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const boom = (k) => {
    if (faults.has(k)) {
      faults.delete(k);
      throw new Error(`falha simulada: ${k}`);
    }
  };

  const client = {
    asServiceRole: {
      entities: {
        Operation: {
          get: async (id) => clone(ops.get(id)) || null,
          update: async (id, patch) => {
            boom('op.update');
            const o = ops.get(id);
            if (!o) return null;
            Object.assign(o, clone(patch));
            return clone(o);
          },
          // Atômico POR DOCUMENTO: quem não casa a guarda recebe updated === 0.
          updateMany: async (query, update) => {
            boom('op.updateMany');
            const o = ops.get(query.id);
            if (!o) return { updated: 0 };
            if (!casaCom(o, query)) return { updated: 0 };
            aplicarUpdate(o, update);
            return { updated: 1 };
          },
        },
        LancamentoContaCorrente: {
          filter: async (q) =>
            [...lancs.values()].filter((l) => l.asaas_event_key === q.asaas_event_key).map(clone),
          create: async (d) => {
            boom('lanc.create');
            const id = `lc${++seq}`;
            const rec = { ...clone(d), id };
            lancs.set(id, rec);
            return clone(rec);
          },
        },
        AsaasEvento: {
          create: async (d) => {
            boom('evento.create');
            const id = `ev${++seq}`;
            const rec = { ...clone(d), id };
            eventos.set(id, rec);
            return clone(rec);
          },
          update: async (id, patch) => {
            boom('evento.update');
            const e = eventos.get(id);
            if (!e) return null;
            Object.assign(e, clone(patch));
            return clone(e);
          },
          // D1.3 — compare-and-swap da recuperação: só quem vence recebe updated > 0.
          updateMany: async (query, update) => {
            boom('evento.updateMany');
            const alvos = [...eventos.values()].filter((e) => casaCom(e, query));
            for (const e of alvos) aplicarUpdate(e, update);
            return { updated: alvos.length };
          },
          filter: async () => [...eventos.values()].map(clone),
        },
      },
    },
  };

  return {
    faults,
    client,
    seedOp(op) {
      ops.set(op.id, {
        asaas_eventos_processados: [],
        asaas_lancamentos_gerados: [],
        asaas_lancamentos_ts: {},
        ...clone(op),
      });
    },
    getOp(id) { return clone(ops.get(id)); },
    listLanc() { return [...lancs.values()].map(clone); },
    listEventos() { return [...eventos.values()].map(clone); },
  };
}

const OP_BASE = {
  id: 'op1',
  total_receivable: 5000,
  amount_paid: 0,
  cheques_compensados_total: 0,
  status: 'ativo',
};

function payload(opId, valor) {
  return {
    client_id: 'cli1',
    client_name: 'Cedente',
    type: 'pagamento_pix',
    nature: 'credito',
    date: '2026-10-19',
    description: `Recebimento — ${valor}`,
    gross_value: valor,
    credit_amount: valor,
    status: 'compensado',
    operation_id: opId,
  };
}

const NOW = '2026-10-19T20:00:00.000Z';
const NOW_MS = Date.parse(NOW);

/* ── D1.2.0 — as cópias concordam ──────────────────────────────────────────── */

function extrairBlocoSync(caminho) {
  const txt = readFileSync(new URL(caminho, import.meta.url), 'utf8');
  const m = txt.match(/\/\* @sync:start[^\n]*\n([\s\S]*?)\/\* @sync:end \*\//);
  assert.ok(m, `marcadores @sync ausentes em ${caminho}`);
  return m[1].trim();
}

test('D1.2.0a — as cópias frontend e backend do diário são idênticas', () => {
  const front = extrairBlocoSync('./asaasEventJournal.js');
  const back = extrairBlocoSync('../../base44/shared/asaasEventJournal.js');
  assert.equal(front, back, 'as duas cópias divergiram — ressincronize o bloco @sync');
});

test('D1.2.0b — as cópias frontend e backend do fluxo são idênticas', () => {
  const front = extrairBlocoSync('./asaasReceiptFlow.js');
  const back = extrairBlocoSync('../../base44/shared/asaasReceiptFlow.js');
  assert.equal(front, back, 'as duas cópias divergiram — ressincronize o bloco @sync');
});

/* ── D1.2.1 — atomicidade da escrita monetária ─────────────────────────────── */

test('D1.2.1a — reivindicar e somar é UMA escrita atômica', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  const r = await applyReceiptAtomically(db.client, 'op1', 'pay_1', 300);

  assert.equal(r.applied, true);
  assert.equal(db.getOp('op1').amount_paid, 300, 'o valor e o marcador são o mesmo fato');
  assert.deepEqual(db.getOp('op1').asaas_eventos_processados, ['pay_1']);
});

test('D1.2.1b — sem operação alvo não há efeito monetário', async () => {
  const db = fakePlatform();
  const r = await applyReceiptAtomically(db.client, null, 'pay_1', 300);
  assert.equal(r.applied, false, 'o caminho parcela não amortiza a operação');
});

/* ── D1.2.2 — falha após reivindicação, antes da contabilização ────────────── */

test('D1.2.2 — falha no extrato deixa o evento recuperável, sem subcontagem', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  db.faults.add('lanc.create'); // morre DEPOIS de reivindicar+somar, ANTES do extrato
  await assert.rejects(() =>
    processReceipt(db.client, {
      paymentId: 'pay_F1',
      operationId: 'op1',
      value: 400,
      lancamentoPayload: payload('op1', 400),
      now: NOW,
    })
  );

  // O valor FOI somado (é o mesmo fato que o marcador) e o extrato NÃO existe.
  assert.equal(db.getOp('op1').amount_paid, 400, 'o valor não pode se perder');
  assert.equal(db.listLanc().length, 0);
  assert.equal(db.listEventos()[0].status, EVENTO_STATUS.FALHA, 'estado: falha recuperável');

  // Recuperação
  const res = await recoverEvento(db.client, db.listEventos()[0], NOW);
  assert.equal(res.recuperado, true);
  assert.equal(db.getOp('op1').amount_paid, 400, 'recuperar não pode duplicar o valor');
  assert.equal(db.listLanc().length, 1, 'o extrato faltante é recriado');
  assert.equal(db.listEventos()[0].status, EVENTO_STATUS.CONTABILIZADO);
});

/* ── D1.2.3 — falha após contabilização parcial ────────────────────────────── */

test('D1.2.3 — efeitos aplicados mas diário desatualizado: recuperar não duplica', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  db.faults.add('evento.update'); // valor somado + extrato criado, fechamento falhou
  await assert.rejects(() =>
    processReceipt(db.client, {
      paymentId: 'pay_F2',
      operationId: 'op1',
      value: 250,
      lancamentoPayload: payload('op1', 250),
      now: NOW,
    })
  );

  assert.equal(db.getOp('op1').amount_paid, 250);
  assert.equal(db.listLanc().length, 1, 'o extrato já foi criado');

  // A recuperação OBSERVA os efeitos reais e não recria nada.
  const res = await recoverEvento(db.client, db.listEventos()[0], NOW);
  assert.equal(res.recuperado, false, 'nada faltava');
  assert.equal(db.getOp('op1').amount_paid, 250, 'sem duplicação');
  assert.equal(db.listLanc().length, 1, 'sem lançamento duplicado');
  assert.equal(db.listEventos()[0].status, EVENTO_STATUS.CONTABILIZADO);
});

/* ── D1.2.4 — recuperação repetida é idempotente ───────────────────────────── */

test('D1.2.4 — rodar a recuperação várias vezes não duplica nada', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  db.faults.add('lanc.create');
  await assert.rejects(() =>
    processReceipt(db.client, {
      paymentId: 'pay_R1', operationId: 'op1', value: 600,
      lancamentoPayload: payload('op1', 600), now: NOW,
    })
  );

  const reg = db.listEventos()[0];
  await recoverEvento(db.client, reg, NOW);
  await recoverEvento(db.client, db.listEventos()[0], NOW);
  await recoverEvento(db.client, db.listEventos()[0], NOW);

  assert.equal(db.getOp('op1').amount_paid, 600, 'recuperar 3x não é 1800');
  assert.equal(db.listLanc().length, 1);
});

/* ── D1.2.5 — dois eventos DISTINTOS concorrentes ──────────────────────────── */

test('D1.2.5 — dois recebimentos distintos concorrentes: nenhum se perde', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  await Promise.all([
    processReceipt(db.client, {
      paymentId: 'pay_A', operationId: 'op1', value: 300,
      lancamentoPayload: payload('op1', 300), now: NOW,
    }),
    processReceipt(db.client, {
      paymentId: 'pay_B', operationId: 'op1', value: 200,
      lancamentoPayload: payload('op1', 200), now: NOW,
    }),
  ]);

  assert.equal(db.getOp('op1').amount_paid, 500, '300 + 200 — o padrão antigo perdia um deles');
  assert.equal(db.listLanc().length, 2, 'cada evento tem o seu lançamento');
  assert.equal(db.getOp('op1').asaas_eventos_processados.length, 2);
});

test('D1.2.5b — dez recebimentos distintos concorrentes somam exatamente', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      processReceipt(db.client, {
        paymentId: `pay_${i}`, operationId: 'op1', value: 100,
        lancamentoPayload: payload('op1', 100), now: NOW,
      })
    )
  );

  assert.equal(db.getOp('op1').amount_paid, 1000, '10 × 100, sem perda de atualização');
  assert.equal(db.listLanc().length, 10);
});

/* ── D1.2.6 — duas entregas SIMULTÂNEAS do MESMO evento ────────────────────── */

test('D1.2.6 — entregas simultâneas do mesmo evento: uma só contabiliza', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  const entrega = () =>
    processReceipt(db.client, {
      paymentId: 'pay_SAME', operationId: 'op1', value: 700,
      lancamentoPayload: payload('op1', 700), now: NOW,
    });

  const [a, b, c] = await Promise.all([entrega(), entrega(), entrega()]);

  assert.equal([a, b, c].filter((r) => r.applied).length, 1, 'exatamente uma aplica');
  assert.equal(db.getOp('op1').amount_paid, 700, 'não pode somar 2100');
  assert.equal(db.listLanc().length, 1, 'um único lançamento no extrato');
});

/* ── D1.2.7 — reprocessamento de evento já contabilizado ───────────────────── */

test('D1.2.7 — reprocessar um evento já contabilizado não altera nada', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  const input = {
    paymentId: 'pay_DONE', operationId: 'op1', value: 900,
    lancamentoPayload: payload('op1', 900), now: NOW,
  };

  const first = await processReceipt(db.client, input);
  const segundo = await processReceipt(db.client, input);
  const terceiro = await processReceipt(db.client, input);

  assert.equal(first.applied, true);
  assert.equal(segundo.applied, false, 'evento já contabilizado');
  assert.equal(terceiro.applied, false);
  assert.equal(db.getOp('op1').amount_paid, 900);
  assert.equal(db.listLanc().length, 1);
});

/* ── D1.2.8 — duplicação de LancamentoContaCorrente ────────────────────────── */

test('D1.2.8 — nenhum cenário gera lançamento duplicado no extrato', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  // reentrega
  await processReceipt(db.client, { paymentId: 'p1', operationId: 'op1', value: 100, lancamentoPayload: payload('op1', 100), now: NOW });
  await processReceipt(db.client, { paymentId: 'p1', operationId: 'op1', value: 100, lancamentoPayload: payload('op1', 100), now: NOW });

  // falha + recuperação
  db.faults.add('lanc.create');
  await assert.rejects(() =>
    processReceipt(db.client, { paymentId: 'p2', operationId: 'op1', value: 50, lancamentoPayload: payload('op1', 50), now: NOW })
  );
  await recoverEvento(db.client, db.listEventos().find((e) => e.event_key === 'p2'), NOW);

  // recuperação redundante
  await recoverEvento(db.client, db.listEventos().find((e) => e.event_key === 'p2'), NOW);

  const porChave = {};
  for (const l of db.listLanc()) porChave[l.asaas_event_key] = (porChave[l.asaas_event_key] || 0) + 1;
  assert.deepEqual(porChave, { p1: 1, p2: 1 }, 'no máximo um lançamento por evento');
  assert.equal(db.getOp('op1').amount_paid, 150);
});

/* ── D1.2.9 — caminho parcela: extrato sem tocar no caixa da operação ──────── */

test('D1.2.9 — o caminho parcela lança no extrato sem amortizar a operação', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  const res = await processReceipt(db.client, {
    paymentId: 'pay_PARC',
    operationId: null, // ← separação extrato (cliente) × caixa (empresa)
    parcelaId: 'parc1',
    value: 350,
    lancamentoPayload: { ...payload('op1', 350), parcela_id: 'parc1' },
    now: NOW,
  });

  assert.equal(res.applied, false, 'parcela não amortiza amount_paid');
  assert.equal(db.getOp('op1').amount_paid, 0, 'o caixa da operação fica intacto');
  assert.equal(db.listLanc().length, 1, 'mas o extrato do cliente recebe o lançamento');

  // Reentrega do mesmo evento
  await processReceipt(db.client, {
    paymentId: 'pay_PARC', operationId: null, parcelaId: 'parc1', value: 350,
    lancamentoPayload: { ...payload('op1', 350), parcela_id: 'parc1' }, now: NOW,
  });
  assert.equal(db.listLanc().length, 1, 'reentrega não duplica o extrato');
});

test('D1.2.9b — falha no extrato da parcela é recuperável', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  db.faults.add('lanc.create');
  await assert.rejects(() =>
    processReceipt(db.client, {
      paymentId: 'pay_P2', operationId: null, parcelaId: 'parc1', value: 80,
      lancamentoPayload: { ...payload('op1', 80), parcela_id: 'parc1' }, now: NOW,
    })
  );

  assert.equal(db.listLanc().length, 0);
  const res = await recoverEvento(db.client, db.listEventos()[0], NOW);
  assert.equal(res.recuperado, true);
  assert.equal(db.listLanc().length, 1, 'o extrato faltante é recriado');
  assert.equal(db.getOp('op1').amount_paid, 0, 'e a operação continua intocada');
});

/* ── D1.2.10 — o diário distingue os quatro estados ────────────────────────── */

test('D1.2.10 — o diário distingue recebido, em processamento, contabilizado e falha', () => {
  const base = { claimed_at: NOW, status: EVENTO_STATUS.REIVINDICADO };

  assert.equal(classifyEvento({ ...base }, NOW_MS, STALE_SECONDS), 'reivindicado');
  assert.equal(
    classifyEvento({ ...base, claimed_at: '2026-10-19T19:00:00.000Z' }, NOW_MS, STALE_SECONDS),
    'abandonado'
  );
  assert.equal(
    classifyEvento({ ...base, status: EVENTO_STATUS.CONTABILIZADO }, NOW_MS, STALE_SECONDS),
    'contabilizado'
  );
  assert.equal(
    classifyEvento({ ...base, status: EVENTO_STATUS.FALHA }, NOW_MS, STALE_SECONDS),
    'falha_recuperavel'
  );

  // Só os não-contabilizados exigem recuperação.
  assert.equal(needsRecovery({ ...base, status: EVENTO_STATUS.CONTABILIZADO }, NOW_MS, STALE_SECONDS), false);
  assert.equal(needsRecovery({ ...base, status: EVENTO_STATUS.FALHA }, NOW_MS, STALE_SECONDS), true);
  assert.equal(needsRecovery({ ...base }, NOW_MS, STALE_SECONDS), false, 'recém-reivindicado não é travado');
});

/* ── D1.2.11 — o diário fica limpo após a recuperação ──────────────────────── */

test('D1.2.11 — após recuperar, não resta evento pendente', async () => {
  const db = fakePlatform();
  db.seedOp(OP_BASE);

  db.faults.add('lanc.create');
  await assert.rejects(() =>
    processReceipt(db.client, { paymentId: 'p9', operationId: 'op1', value: 10, lancamentoPayload: payload('op1', 10), now: NOW })
  );

  for (const r of db.listEventos().filter((e) => needsRecovery(e, NOW_MS, STALE_SECONDS))) {
    await recoverEvento(db.client, r, NOW);
  }

  const pendentes = db.listEventos().filter((e) => needsRecovery(e, NOW_MS + 600000, STALE_SECONDS));
  assert.equal(pendentes.length, 0, 'nenhum resíduo pendente');
});

/* ── D1.2.12 — derivados nunca perdem o valor autoritativo ─────────────────── */

test('D1.2.12 — balance_due é derivado do amount_paid, nunca o contrário', async () => {
  const db = fakePlatform();
  db.seedOp({ ...OP_BASE, total_receivable: 1000 });

  await processReceipt(db.client, { paymentId: 'a', operationId: 'op1', value: 400, lancamentoPayload: null, now: NOW });
  let op = db.getOp('op1');
  assert.equal(op.amount_paid, 400);
  assert.equal(op.balance_due, 600);

  await processReceipt(db.client, { paymentId: 'b', operationId: 'op1', value: 600, lancamentoPayload: null, now: NOW });
  op = db.getOp('op1');
  assert.equal(op.amount_paid, 1000);
  assert.equal(op.balance_due, 0);
  assert.equal(op.status, 'quitado');
});

test('D1.2.12b — recomputeDerived nunca escreve amount_paid', async () => {
  const db = fakePlatform();
  db.seedOp({ ...OP_BASE, amount_paid: 777, total_receivable: 1000 });
  await recomputeDerived(db.client, 'op1');
  assert.equal(db.getOp('op1').amount_paid, 777, 'amount_paid é autoritativo e somente-leitura aqui');
});

/* ── D1.2.13 — regressão: cheques compensados coexistem com recebimentos ──── */

test('D1.2.13 — recebimentos independentes coexistem com cheques compensados', () => {
  let op = { total_receivable: 2000, amount_paid: 0, cheques_compensados_total: 0, status: 'ativo' };

  // Cheque compensado entra pelo fluxo de cheques
  op = syncOperationFromCheques(op, [{ id: 'chA', status: 'compensado', value: 1000 }]);
  assert.equal(op.amount_paid, 1000);

  // Dois recebimentos Asaas independentes
  op = applyAsaasReceipt(op, { paymentId: 'pay_1', value: 500 });
  op = applyAsaasReceipt(op, { paymentId: 'pay_2', value: 300 });

  assert.equal(op.amount_paid, 1800, '1000 (cheque) + 500 + 300');

  // Uma sincronização posterior de cheques não apaga nem infla
  op = syncOperationFromCheques(op, [{ id: 'chA', status: 'compensado', value: 1000 }]);
  assert.equal(op.amount_paid, 1800);
  assert.equal(sumCompensatedCheques([{ id: 'chA', status: 'compensado', value: 1000 }]), 1000);
});