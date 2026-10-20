/**
 * FASE D1.3 — Recuperação concorrente e consistência do cronograma.
 *
 * Complementa src/lib/asaasRecovery.test.js (D1.2). Aqui o alvo é a
 * EXCLUSIVIDADE da recuperação e a IDEMPOTÊNCIA sob concorrência.
 *
 * O banco falso modela apenas as primitivas que foram COMPROVADAS no ambiente
 * real (ver sondas S1–S6 da D1.3):
 *   · updateMany com guarda $ne sobre array
 *   · $inc + $push + $set pontilhado na MESMA escrita
 *   · $or e comparação $lt sobre strings ISO
 *   · updated === 1 para quem vence o compare-and-swap, 0 para quem perde
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { recoverEvento } from './asaasReceiptFlow.js';
import {
  EVENTO_STATUS,
  MAX_TENTATIVAS,
  STALE_SECONDS,
  classifyEvento,
  needsRecovery,
  staleCutoff,
} from './asaasEventJournal.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

/* ── Banco falso ───────────────────────────────────────────────────────────── */

function getPath(obj, p) {
  return p.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
}
function setPath(obj, p, v) {
  const ks = p.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] === undefined || o[ks[i]] === null) o[ks[i]] = {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = v;
}

function matchQuery(rec, q) {
  for (const [k, v] of Object.entries(q)) {
    if (k === '$or') {
      if (!v.some((sub) => matchQuery(rec, sub))) return false;
      continue;
    }
    const val = getPath(rec, k);
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if ('$ne' in v) {
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

function applyUpdate(rec, u) {
  if (u.$set) for (const [k, v] of Object.entries(u.$set)) setPath(rec, k, v);
  if (u.$inc) for (const [k, v] of Object.entries(u.$inc)) setPath(rec, k, (getPath(rec, k) || 0) + v);
  if (u.$push) for (const [k, v] of Object.entries(u.$push)) setPath(rec, k, [...(getPath(rec, k) || []), v]);
  if (u.$addToSet)
    for (const [k, v] of Object.entries(u.$addToSet)) {
      const atual = getPath(rec, k) || [];
      if (!atual.includes(v)) setPath(rec, k, [...atual, v]);
    }
  if (u.$pull) for (const [k, v] of Object.entries(u.$pull)) setPath(rec, k, (getPath(rec, k) || []).filter((x) => x !== v));
  if (u.$unset) for (const k of Object.keys(u.$unset)) setPath(rec, k, undefined);
}

function makeStore() {
  const db = { ops: new Map(), eventos: [], lanc: [], seq: 0, faults: {} };
  const boom = (k) => {
    if (db.faults[k]) {
      db.faults[k] -= 1;
      throw new Error(`falha simulada: ${k}`);
    }
  };

  const base44 = {
    asServiceRole: {
      entities: {
        Operation: {
          get: async (id) => db.ops.get(id) || null,
          update: async (id, data) => {
            boom('op.update');
            const o = db.ops.get(id);
            if (o) Object.assign(o, data);
            return o;
          },
          updateMany: async (query, update) => {
            boom('op.updateMany');
            const o = db.ops.get(query.id);
            if (!o) return { updated: 0 };
            if (!matchQuery(o, query)) return { updated: 0 };
            applyUpdate(o, update);
            return { updated: 1 };
          },
        },
        AsaasEvento: {
          create: async (data) => {
            boom('evento.create');
            const rec = { id: `ev${++db.seq}`, attempts: 0, effects: {}, ...data };
            db.eventos.push(rec);
            return rec;
          },
          filter: async (q) => db.eventos.filter((e) => matchQuery(e, q)),
          updateMany: async (q, u) => {
            boom('evento.updateMany');
            const alvos = db.eventos.filter((e) => matchQuery(e, q));
            alvos.forEach((e) => applyUpdate(e, u));
            return { updated: alvos.length };
          },
        },
        LancamentoContaCorrente: {
          create: async (data) => {
            boom('lanc.create');
            const rec = { id: `lc${++db.seq}`, ...data };
            db.lanc.push(rec);
            return rec;
          },
          filter: async (q) => db.lanc.filter((e) => matchQuery(e, q)),
        },
      },
    },
  };
  return { db, base44 };
}

/** Operação sintética com o estado mínimo que a recuperação observa. */
function seedOp(db, { id = 'op1', amount_paid = 0, total_receivable = 1000, marcadores = [] } = {}) {
  const op = {
    id,
    amount_paid,
    total_receivable,
    balance_due: total_receivable - amount_paid,
    status: 'ativo',
    asaas_eventos_processados: [...marcadores],
    asaas_lancamentos_gerados: [],
    asaas_lancamentos_ts: {},
    installment_schedule: [],
  };
  db.ops.set(id, op);
  return op;
}

function seedEvento(db, over = {}) {
  const rec = {
    id: `ev_${over.event_key}`,
    event_key: 'pay_1',
    status: EVENTO_STATUS.FALHA,
    operation_id: 'op1',
    payment_id: 'pay_1',
    value: 100,
    claimed_at: new Date().toISOString(),
    recovery_started_at: '',
    accounted_at: '',
    error: 'erro anterior',
    attempts: 0,
    effects: {},
    lancamento_payload: { client_id: 'cli1', operation_id: 'op1', gross_value: 100, date: '2026-10-20' },
    ...over,
  };
  db.eventos.push(rec);
  return rec;
}

const isoAtras = (seg) => new Date(Date.now() - seg * 1000).toISOString();

/* ── D1.3.0 — as duas cópias do bloco @sync não podem divergir ─────────────── */

function blocoSync(caminho) {
  const t = fs.readFileSync(caminho, 'utf8');
  const m = t.match(/@sync:start[^\n]*\n([\s\S]*?)\/\* @sync:end \*\//);
  assert.ok(m, `marcadores @sync ausentes em ${caminho}`);
  return m[1];
}

test('D1.3.0 — bloco @sync idêntico entre frontend e backend', () => {
  for (const nome of ['asaasEventJournal.js', 'asaasReceiptFlow.js']) {
    const front = blocoSync(path.join(dir, nome));
    const back = blocoSync(path.join(dir, '..', '..', 'base44', 'shared', nome));
    assert.equal(front, back, `bloco @sync divergente em ${nome}`);
  }
});

/* ── 1. Duas recuperações simultâneas do mesmo evento ──────────────────────── */

test('D1.3.1 — duas recuperações simultâneas: uma só age, sem duplicar', async () => {
  const { db, base44 } = makeStore();
  seedOp(db);
  const ev = seedEvento(db);
  const stale = staleCutoff(Date.now(), STALE_SECONDS);

  const r = await Promise.all([
    recoverEvento(base44, { ...ev }, new Date().toISOString(), stale),
    recoverEvento(base44, { ...ev }, new Date().toISOString(), stale),
  ]);

  const op = db.ops.get('op1');
  assert.equal(op.amount_paid, 100, 'o valor deve entrar exatamente uma vez');
  assert.equal(db.lanc.length, 1, 'um único lançamento no extrato');
  assert.equal(r.filter((x) => !x.ignorado).length, 1, 'exatamente uma execução age');
  assert.equal(r.filter((x) => x.ignorado).length, 1, 'a outra é descartada');
  assert.equal(db.eventos[0].status, EVENTO_STATUS.CONTABILIZADO);
});

/* ── 2. Evento ainda em processamento por uma execução ativa ───────────────── */

test('D1.3.2 — evento ativo (não abandonado) não é recuperado', async () => {
  const { db, base44 } = makeStore();
  seedOp(db);
  const ev = seedEvento(db, {
    status: EVENTO_STATUS.REIVINDICADO,
    claimed_at: new Date().toISOString(),
  });
  const nowMs = Date.now();

  assert.equal(needsRecovery(ev, nowMs, STALE_SECONDS), false, 'não elegível');
  assert.equal(classifyEvento(ev, nowMs, STALE_SECONDS), 'reivindicado');

  const r = await recoverEvento(base44, { ...ev }, new Date().toISOString(), staleCutoff(nowMs, STALE_SECONDS));

  assert.ok(r.ignorado, 'a recuperação não pode tomar um evento ativo');
  assert.equal(db.ops.get('op1').amount_paid, 0);
  assert.equal(db.lanc.length, 0);
});

/* ── 3. Evento abandonado após falha ──────────────────────────────────────── */

test('D1.3.3 — evento abandonado é retomado e contabilizado', async () => {
  const { db, base44 } = makeStore();
  seedOp(db);
  const ev = seedEvento(db, {
    status: EVENTO_STATUS.REIVINDICADO,
    claimed_at: isoAtras(600),
  });
  const nowMs = Date.now();

  assert.equal(needsRecovery(ev, nowMs, STALE_SECONDS), true);
  assert.equal(classifyEvento(ev, nowMs, STALE_SECONDS), 'abandonado');

  const r = await recoverEvento(base44, { ...ev }, new Date().toISOString(), staleCutoff(nowMs, STALE_SECONDS));

  assert.equal(r.recuperado, true);
  assert.equal(db.ops.get('op1').amount_paid, 100);
  assert.equal(db.lanc.length, 1);
  assert.equal(db.eventos[0].status, EVENTO_STATUS.CONTABILIZADO);
});

/* ── 4. Valor já contabilizado, diário incompleto ──────────────────────────── */

test('D1.3.4 — valor já no marcador não é somado de novo', async () => {
  const { db, base44 } = makeStore();
  seedOp(db, { amount_paid: 100, marcadores: ['pay_1'] });
  const ev = seedEvento(db, { status: EVENTO_STATUS.FALHA, effects: {} });

  const r = await recoverEvento(base44, { ...ev }, new Date().toISOString(), staleCutoff(Date.now(), STALE_SECONDS));

  assert.equal(db.ops.get('op1').amount_paid, 100, 'não pode duplicar');
  assert.equal(r.effects.amount_paid, true);
  assert.equal(db.lanc.length, 1, 'o lançamento faltante é criado');
});

/* ── 5. Diário atualizado, lançamento do extrato ausente ───────────────────── */

test('D1.3.5 — lançamento ausente é criado, valor preservado', async () => {
  const { db, base44 } = makeStore();
  seedOp(db, { amount_paid: 100, marcadores: ['pay_1'] });
  const ev = seedEvento(db, {
    status: EVENTO_STATUS.FALHA,
    effects: { amount_paid: true, lancamento_id: '' },
  });

  await recoverEvento(base44, { ...ev }, new Date().toISOString(), staleCutoff(Date.now(), STALE_SECONDS));

  assert.equal(db.lanc.length, 1);
  assert.equal(db.lanc[0].asaas_event_key, 'pay_1');
  assert.equal(db.ops.get('op1').amount_paid, 100);
});

/* ── 6. Reexecução da recuperação três ou mais vezes ───────────────────────── */

test('D1.3.6 — reexecutar a recuperação é idempotente', async () => {
  const { db, base44 } = makeStore();
  seedOp(db);
  const ev = seedEvento(db);
  const stale = staleCutoff(Date.now(), STALE_SECONDS);

  await recoverEvento(base44, { ...ev }, new Date().toISOString(), stale);
  const depois = db.eventos[0];

  for (let i = 0; i < 3; i++) {
    const r = await recoverEvento(base44, { ...depois }, new Date().toISOString(), stale);
    assert.ok(r.ignorado, `execução ${i + 2} deve ser descartada`);
  }

  assert.equal(db.ops.get('op1').amount_paid, 100, 'nunca duplica');
  assert.equal(db.lanc.length, 1, 'nunca duplica o lançamento');
});

/* ── 7. Falha durante a própria recuperação ────────────────────────────────── */

test('D1.3.7 — falha na recuperação devolve o evento à fila e vira definitiva ao esgotar', async () => {
  const { db, base44 } = makeStore();
  seedOp(db);
  const ev = seedEvento(db);
  const stale = staleCutoff(Date.now(), STALE_SECONDS);

  let registro = { ...ev };
  for (let i = 1; i <= MAX_TENTATIVAS; i++) {
    db.faults['lanc.create'] = 1;
    await assert.rejects(
      () => recoverEvento(base44, registro, new Date().toISOString(), stale),
      /falha simulada/
    );
    registro = db.eventos[0];
    assert.equal(registro.attempts, i, `tentativa ${i} registrada`);
  }

  assert.equal(db.ops.get('op1').amount_paid, 100, 'o valor nunca duplica entre tentativas');
  assert.equal(registro.status, EVENTO_STATUS.FALHA_DEFINITIVA, 'sai da recuperação automática');
  assert.equal(needsRecovery(registro, Date.now(), STALE_SECONDS), false);
  assert.equal(classifyEvento(registro, Date.now(), STALE_SECONDS), 'falha_definitiva');
});

test('D1.3.7b — falha transitória continua elegível', async () => {
  const { db, base44 } = makeStore();
  seedOp(db);
  const ev = seedEvento(db);
  const stale = staleCutoff(Date.now(), STALE_SECONDS);

  db.faults['lanc.create'] = 1;
  await assert.rejects(() => recoverEvento(base44, { ...ev }, new Date().toISOString(), stale));

  const registro = db.eventos[0];
  assert.equal(registro.status, EVENTO_STATUS.FALHA);
  assert.equal(needsRecovery(registro, Date.now(), STALE_SECONDS), true, 'segue recuperável');
});

/* ── 8. Dois eventos legítimos diferentes para a mesma operação ────────────── */

test('D1.3.8 — dois eventos distintos na mesma operação: ambos somam', async () => {
  const { db, base44 } = makeStore();
  seedOp(db);
  const a = seedEvento(db, { event_key: 'pay_A', payment_id: 'pay_A', value: 100 });
  const b = seedEvento(db, { event_key: 'pay_B', payment_id: 'pay_B', value: 250 });
  const stale = staleCutoff(Date.now(), STALE_SECONDS);

  await Promise.all([
    recoverEvento(base44, { ...a }, new Date().toISOString(), stale),
    recoverEvento(base44, { ...b }, new Date().toISOString(), stale),
  ]);

  assert.equal(db.ops.get('op1').amount_paid, 350, '100 + 250');
  assert.equal(db.lanc.length, 2, 'um lançamento por evento');
  assert.deepEqual(
    db.eventos.map((e) => e.status),
    [EVENTO_STATUS.CONTABILIZADO, EVENTO_STATUS.CONTABILIZADO]
  );
});

/* ── Extra: recuperação abandonada é retomável; a reivindicação é prazo ────── */

test('D1.3.9 — recuperação abandonada é retomada após a tolerância', async () => {
  const { db, base44 } = makeStore();
  seedOp(db);
  const ev = seedEvento(db, {
    status: EVENTO_STATUS.EM_RECUPERACAO,
    recovery_started_at: isoAtras(600),
  });
  const nowMs = Date.now();

  assert.equal(needsRecovery(ev, nowMs, STALE_SECONDS), true);
  assert.equal(classifyEvento(ev, nowMs, STALE_SECONDS), 'recuperacao_abandonada');

  const r = await recoverEvento(base44, { ...ev }, new Date().toISOString(), staleCutoff(nowMs, STALE_SECONDS));
  assert.equal(r.recuperado, true);
  assert.equal(db.ops.get('op1').amount_paid, 100);
});

test('D1.3.10 — recuperação em curso não é roubada antes da tolerância', async () => {
  const { db, base44 } = makeStore();
  seedOp(db);
  const ev = seedEvento(db, {
    status: EVENTO_STATUS.EM_RECUPERACAO,
    recovery_started_at: new Date().toISOString(),
  });
  const nowMs = Date.now();

  assert.equal(needsRecovery(ev, nowMs, STALE_SECONDS), false);
  const r = await recoverEvento(base44, { ...ev }, new Date().toISOString(), staleCutoff(nowMs, STALE_SECONDS));
  assert.ok(r.ignorado);
  assert.equal(db.lanc.length, 0);
});

/* ── Extra: evento contabilizado nunca volta a ser processado ──────────────── */

test('D1.3.11 — evento contabilizado não volta a ser processado', async () => {
  const { db, base44 } = makeStore();
  seedOp(db, { amount_paid: 100, marcadores: ['pay_1'] });
  const ev = seedEvento(db, {
    status: EVENTO_STATUS.CONTABILIZADO,
    accounted_at: new Date().toISOString(),
  });

  assert.equal(needsRecovery(ev, Date.now(), STALE_SECONDS), false);

  const r = await recoverEvento(base44, { ...ev }, new Date().toISOString(), staleCutoff(Date.now(), STALE_SECONDS));
  assert.ok(r.ignorado, 'o compare-and-swap não casa com contabilizado');
  assert.equal(db.ops.get('op1').amount_paid, 100);
});

/* ── Extra: VÁRIAS linhas de diário para o mesmo evento ───────────────────── */

test('D1.3.12 — duas linhas do diário, duas recuperações: um único lançamento', async () => {
  const { db, base44 } = makeStore();
  seedOp(db);
  // Uma reentrega cria mais de uma linha para o MESMO evento. A reivindicação
  // do diário por `event_key` pode ser DIVIDIDA entre duas execuções — por isso
  // ela não é a garantia; a garantia é a reivindicação da operação.
  const a = seedEvento(db, { id: 'ev_A', event_key: 'pay_1' });
  const b = seedEvento(db, { id: 'ev_B', event_key: 'pay_1' });
  const stale = staleCutoff(Date.now(), STALE_SECONDS);

  await Promise.all([
    recoverEvento(base44, { ...a }, new Date().toISOString(), stale),
    recoverEvento(base44, { ...b }, new Date().toISOString(), stale),
  ]);

  assert.equal(db.ops.get('op1').amount_paid, 100, 'o valor entra uma única vez');
  assert.equal(db.lanc.length, 1, 'a reivindicação da operação é indivisível');
});

/* ── Extra: prazo de validade da reivindicação do extrato ─────────────────── */

test('D1.3.13 — reivindicação de extrato EXPIRADA é retomada', async () => {
  const { db, base44 } = makeStore();
  const op = seedOp(db, { amount_paid: 100, marcadores: ['pay_1'] });
  // Morte abrupta entre reivindicar e criar: a marca existe, o lançamento não,
  // e o carimbo já expirou.
  op.asaas_lancamentos_gerados = ['pay_1'];
  op.asaas_lancamentos_ts = { pay_1: isoAtras(600) };
  const ev = seedEvento(db, { status: EVENTO_STATUS.FALHA });

  const r = await recoverEvento(base44, { ...ev }, new Date().toISOString(), staleCutoff(Date.now(), STALE_SECONDS));

  assert.equal(db.lanc.length, 1, 'o lançamento faltante é criado após a validade expirar');
  assert.equal(db.ops.get('op1').amount_paid, 100, 'o valor não duplica');
  assert.equal(r.effects.lancamento_id !== '', true);
});

test('D1.3.14 — reivindicação de extrato RECENTE não é roubada, e o evento volta à fila', async () => {
  const { db, base44 } = makeStore();
  const op = seedOp(db, { amount_paid: 100, marcadores: ['pay_1'] });
  op.asaas_lancamentos_gerados = ['pay_1'];
  op.asaas_lancamentos_ts = { pay_1: new Date().toISOString() };
  const ev = seedEvento(db, { status: EVENTO_STATUS.FALHA });

  const r = await recoverEvento(base44, { ...ev }, new Date().toISOString(), staleCutoff(Date.now(), STALE_SECONDS));

  assert.equal(db.lanc.length, 0, 'uma execução viva pode estar criando agora');
  assert.equal(r.pendente, 'lancamento');
  assert.equal(db.eventos[0].status, EVENTO_STATUS.FALHA, 'NÃO pode ser dado como contabilizado');
  assert.equal(needsRecovery(db.eventos[0], Date.now(), STALE_SECONDS), true, 'segue na fila');
  assert.equal(db.eventos[0].attempts, 0, 'espera não é falha — não consome tentativa');
});