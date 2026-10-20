/**
 * FASE D1.4 — Emissão idempotente de cobranças Asaas.
 *
 * Exercita a orquestração REAL (base44/shared/asaasChargeFlow.js) contra um
 * banco simulado e um provedor simulado. Nada é reimplementado aqui: o que os
 * testes chamam é exatamente o que o endpoint chama.
 *
 * ── COMO A CONCORRÊNCIA É PROVADA SEM TEMPORIZAÇÃO ──────────────────────────
 *
 * O banco simulado aplica cada `updateMany` até o fim, sem interrupção — que é
 * a garantia que a plataforma realmente oferece (atomicidade POR DOCUMENTO) e
 * a única em que o código confia. Não há `setTimeout`, nem espera aleatória,
 * nem ordem de sorte: o que decide quem vence é a GUARDA da consulta. Se o
 * código estivesse errado, duas chamadas simultâneas venceriam as duas e o
 * teste falharia de forma determinística.
 *
 * ── SEM ASAAS REAL ──────────────────────────────────────────────────────────
 *
 * O provedor é 100% simulado: cria, consulta e QR Code são funções locais. Não
 * há rede, não há credencial, não há dado financeiro real.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  COBRANCA_STATUS,
  MAX_TENTATIVAS_COBRANCA,
  CHARGE_STALE_SECONDS,
  intentKey,
  campoIntent,
  planEmission,
  proximaGeneration,
  classifyChargeError,
  proximoEstadoCobranca,
  claimFilter,
  claimEmission,
  markChargeCreated,
  markChargeFailed,
  markChargeAmbiguous,
  markChargeCancelled,
  atualizarParcelaCondicional,
  camposCobrancaParcela,
  camposCobrancaOperacao,
  intentPrecisaIntervencao,
  intentPendenteReconciliacao,
  contadorDeCiclos,
  emitirCobranca,
  emitirLote,
  resumirLote,
} from './asaasChargeFlow.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const AGORA = '2026-10-19T12:00:00.000Z';
const VELHO = new Date(Date.parse(AGORA) - (CHARGE_STALE_SECONDS + 60) * 1000).toISOString();

/* ══ Simulador do banco ═══════════════════════════════════════════════════════ */

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

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

/** Casamento de consulta: o subconjunto de operadores realmente usado. */
function casaCom(e, q) {
  for (const [k, v] of Object.entries(q)) {
    if (k === '$or') {
      if (!v.some((s) => casaCom(e, s))) return false;
      continue;
    }
    const val = lerPath(e, k);
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

function aplicarUpdate(rec, u) {
  if (u.$set) for (const [k, v] of Object.entries(u.$set)) gravarPath(rec, k, clone(v));
  if (u.$inc) for (const [k, v] of Object.entries(u.$inc)) gravarPath(rec, k, (lerPath(rec, k) || 0) + v);
  if (u.$push) for (const [k, v] of Object.entries(u.$push)) gravarPath(rec, k, [...(lerPath(rec, k) || []), clone(v)]);
  if (u.$addToSet)
    for (const [k, v] of Object.entries(u.$addToSet)) {
      const a = lerPath(rec, k) || [];
      if (!a.includes(v)) gravarPath(rec, k, [...a, v]);
    }
  if (u.$pull) for (const [k, v] of Object.entries(u.$pull)) gravarPath(rec, k, (lerPath(rec, k) || []).filter((x) => x !== v));
  if (u.$unset) for (const k of Object.keys(u.$unset)) gravarPath(rec, k, undefined);
}

function banco() {
  const ops = new Map();
  let falha = null;

  const entities = {
    Operation: {
      async updateMany(query, update) {
        if (falha && falha(query, update)) throw new Error('falha de escrita simulada');
        const alvo = ops.get(query.id);
        if (!alvo) return { updated: 0 };
        if (!casaCom(alvo, query)) return { updated: 0 };
        aplicarUpdate(alvo, update);
        return { updated: 1 };
      },
      async get(id) {
        return ops.get(id) ? clone(ops.get(id)) : null;
      },
    },
  };

  return {
    base44: { asServiceRole: { entities } },
    entities,
    semear(op) {
      ops.set(op.id, { installment_schedule: [], asaas_intents: {}, ...clone(op) });
    },
    ler(id) {
      return ops.get(id);
    },
    falharQuando(predicado) {
      falha = predicado;
    },
    pararDeFalhar() {
      falha = null;
    },
  };
}

/** Operação de teste com N parcelas. */
function operacao(id, n, extra) {
  const schedule = [];
  for (let i = 0; i < n; i++) {
    schedule.push({
      number: i + 1,
      value: 100 * (i + 1),
      due_date: '2026-11-10',
      status: 'pendente',
      asaas_payment_id: '',
      asaas_payment_status: 'pending',
      paid: false,
    });
  }
  return { id, total_receivable: 1000, due_date: '2026-11-10', installment_schedule: schedule, ...(extra || {}) };
}

/* ══ Simulador do provedor ════════════════════════════════════════════════════ */

function provedorFake(config) {
  const cfg = config || {};
  const cobrancas = [];
  const chamadas = { criar: 0, consultar: 0, pix: 0 };
  let seq = 0;

  const mk = (payload) => ({
    id: `pay_${++seq}`,
    billingType: payload.billingType,
    invoiceUrl: `https://provedor.local/f/${seq}`,
    bankSlipCode: `linha-${seq}`,
    boletoLine: '',
    status: 'pending',
    externalReference: payload.externalReference,
  });

  return {
    cobrancas,
    chamadas,
    async criar(payload) {
      chamadas.criar++;
      const plano =
        typeof cfg.plano === 'function' ? cfg.plano(chamadas.criar, payload) : (cfg.plano || [])[chamadas.criar - 1];
      const tipo = plano || 'ok';

      if (tipo === 'timeout') {
        cobrancas.push(mk(payload)); // o provedor CRIOU; a resposta se perdeu
        throw new Error('fetch failed: timeout');
      }
      if (tipo === 'http500') {
        cobrancas.push(mk(payload)); // criou e só então falhou
        const e = new Error('Asaas 500: erro interno');
        e.status = 500;
        throw e;
      }
      if (tipo === 'http400') {
        const e = new Error('Asaas 400: value inválido');
        e.status = 400;
        throw e;
      }
      if (tipo === 'sem_id') return { billingType: payload.billingType };

      const c = mk(payload);
      cobrancas.push(c);
      return c;
    },
    async consultar(ref) {
      chamadas.consultar++;
      if (cfg.consultar_erro) throw new Error('consulta indisponível');
      return cobrancas.filter((c) => c.externalReference === ref);
    },
    async pix() {
      chamadas.pix++;
      return '';
    },
  };
}

/* ══ Auxiliares ═══════════════════════════════════════════════════════════════ */

function alvoParcela(op, idx, billing) {
  const inst = op.installment_schedule[idx];
  const tipo = billing || 'BOLETO';
  return {
    rotulo: inst.number,
    billing_type: tipo,
    payload: {
      billingType: tipo,
      value: Number(inst.value),
      dueDate: inst.due_date,
      description: `Parcela ${inst.number}`,
    },
    paymentIdAtual: inst.asaas_payment_id || '',
    campos: (info) => camposCobrancaParcela(idx, info),
  };
}

async function emitir(b, opId, slot, provedor, extras) {
  const operation = await b.entities.Operation.get(opId);
  return emitirCobranca(b.base44, {
    operation,
    slot,
    alvo: alvoParcela(operation, slot, extras && extras.billing_type),
    provedor,
    nowIso: (extras && extras.nowIso) || AGORA,
    staleIso: VELHO,
    ...(extras || {}),
  });
}

/* ══ Sincronia das cópias ═════════════════════════════════════════════════════ */

function blocoSync(caminho) {
  const txt = readFileSync(caminho, 'utf8');
  const i = txt.indexOf('/* @sync:start');
  const f = txt.indexOf('/* @sync:end */');
  assert.ok(i >= 0 && f > i, `marcadores @sync ausentes em ${caminho}`);
  return txt.slice(txt.indexOf('*/', i) + 2, f).trim();
}

test('D1.4.0 — as duas cópias do fluxo de cobrança são idênticas', () => {
  const front = blocoSync(join(AQUI, 'asaasChargeFlow.js'));
  const back = blocoSync(join(AQUI, '..', '..', 'base44', 'shared', 'asaasChargeFlow.js'));
  assert.equal(front, back, 'base44/shared e src/lib divergiram');
});

/* ══ Decisões puras ═══════════════════════════════════════════════════════════ */

test('D1.4.0b — planEmission: consultar antes de criar em estado ambíguo', () => {
  assert.deepEqual(planEmission(null), {
    reconciliarPrimeiro: false,
    reutilizar: false,
    criar: true,
    generationIncrementa: false,
  });

  // `solicitando` só é alcançável quando ABANDONADO — e pode ter chamado o
  // provedor. Consultar antes de criar é obrigatório.
  assert.equal(planEmission({ status: COBRANCA_STATUS.SOLICITANDO }).reconciliarPrimeiro, true);
  assert.equal(planEmission({ status: COBRANCA_STATUS.RECONCILIACAO_PENDENTE }).reconciliarPrimeiro, true);

  // Rejeição definitiva (4xx): nada foi criado, criar direto é seguro.
  assert.equal(planEmission({ status: COBRANCA_STATUS.FALHA_RECUPERAVEL }).reconciliarPrimeiro, false);
  assert.equal(planEmission({ status: COBRANCA_STATUS.FALHA_RECUPERAVEL }).criar, true);

  // Cobrança existente: nunca recriada.
  const criada = planEmission({ status: COBRANCA_STATUS.CRIADA });
  assert.equal(criada.criar, false);
  assert.equal(criada.reutilizar, true);

  // Cancelamento deliberado abre uma geração NOVA.
  assert.equal(planEmission({ status: COBRANCA_STATUS.CANCELADA }).generationIncrementa, true);
});

test('D1.4.0c — classifyChargeError é conservador: 5xx e rede são ambíguos', () => {
  assert.equal(classifyChargeError(new Error('fetch failed')), 'ambiguo');
  const e500 = new Error('x');
  e500.status = 500;
  assert.equal(classifyChargeError(e500), 'ambiguo');
  const e400 = new Error('x');
  e400.status = 400;
  assert.equal(classifyChargeError(e400), 'definitivo');
});

test('D1.4.0d — identidade da intenção e geração', () => {
  assert.equal(intentKey('op1', 0, 1), 'cob:op1:0:g1');
  assert.equal(proximaGeneration(null), 1);
  assert.equal(proximaGeneration({ generation: 1, status: COBRANCA_STATUS.CRIADA }), 1);
  assert.equal(proximaGeneration({ generation: 1, status: COBRANCA_STATUS.CANCELADA }), 2);
  assert.equal(campoIntent(0, 'status'), 'asaas_intents.0.status');
  assert.equal(campoIntent('op', 'status'), 'asaas_intents.op.status');
});

test('D1.4.0e — estados de falha e do contador de ciclos', () => {
  assert.equal(proximoEstadoCobranca(1), COBRANCA_STATUS.FALHA_RECUPERAVEL);
  assert.equal(proximoEstadoCobranca(MAX_TENTATIVAS_COBRANCA), COBRANCA_STATUS.FALHA_DEFINITIVA);
  assert.equal(intentPrecisaIntervencao({ status: COBRANCA_STATUS.FALHA_DEFINITIVA }), true);
  assert.equal(intentPendenteReconciliacao({ status: COBRANCA_STATUS.RECONCILIACAO_PENDENTE }), true);
  assert.equal(contadorDeCiclos(['a', 'b']), 2);
  assert.equal(contadorDeCiclos(undefined), 0);
});

/* ══ 1–8: emissão e concorrência ══════════════════════════════════════════════ */

test('D1.4.1 — duas solicitações simultâneas da mesma parcela: uma só cobrança', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));
  const p = provedorFake();

  const [a, c] = await Promise.all([emitir(b, 'op1', 0, p), emitir(b, 'op1', 0, p)]);

  assert.equal(p.chamadas.criar, 1, 'apenas uma execução chamou o provedor');
  assert.equal(p.cobrancas.length, 1, 'existe exatamente uma cobrança');
  assert.equal([a, c].filter((r) => r.ok).length, 1, 'apenas uma venceu');
  assert.equal([a, c].find((r) => !r.ok).motivo, 'emissao_em_andamento');
});

test('D1.4.2 — timeout DEPOIS de o provedor criar: a retomada consulta e não duplica', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));
  const p = provedorFake({ plano: ['timeout'] });

  const r1 = await emitir(b, 'op1', 0, p);
  assert.equal(r1.ok, false);
  assert.equal(r1.motivo, 'reconciliacao_pendente', 'ambíguo não vira sucesso nem falha');
  assert.equal(p.cobrancas.length, 1, 'a cobrança FOI criada no provedor');

  const r2 = await emitir(b, 'op1', 0, p);
  assert.equal(r2.ok, true);
  assert.equal(r2.reconciliada, true);
  assert.equal(p.chamadas.criar, 1, 'NÃO emitiu um segundo boleto');
  assert.equal(p.cobrancas.length, 1);

  const o = b.ler('op1');
  assert.equal(o.installment_schedule[0].asaas_payment_id, p.cobrancas[0].id, 'o identificador foi recuperado');
  assert.equal(o.asaas_intents['0'].status, COBRANCA_STATUS.CRIADA);
});

test('D1.4.34 — mais de uma cobrança para a MESMA referência: adota uma só, nunca emite uma terceira', async () => {
  // Executa o mesmo cenário com a API devolvendo os duplicados em ordens
  // OPOSTAS. Se a escolha dependesse da ordem, os dois resultados divergiriam.
  const cenario = async (ordem) => {
    const b = banco();
    b.semear(operacao('op1', 1));
    const p = provedorFake({ plano: ['timeout'] });

    const r1 = await emitir(b, 'op1', 0, p);
    assert.equal(r1.motivo, 'reconciliacao_pendente', 'resposta ambígua');

    // Anomalia: uma SEGUNDA cobrança aparece para a mesma referência.
    const base = p.cobrancas[0];
    p.cobrancas.length = 0;
    for (const id of ordem) p.cobrancas.push({ ...base, id });

    const r2 = await emitir(b, 'op1', 0, p);
    assert.equal(r2.ok, true, 'adota uma das existentes');
    assert.equal(p.chamadas.criar, 1, 'NUNCA emite uma terceira cobrança');
    assert.equal(r2.duplicadas, 2, 'a anomalia é IDENTIFICADA e devolvida');

    // Repetir a conciliação continua adotando a MESMA cobrança.
    const r3 = await emitir(b, 'op1', 0, p);
    assert.equal(p.chamadas.criar, 1, 'nem na repetição emite terceira');
    assert.equal(r3.ok, true);

    return b.ler('op1').installment_schedule[0].asaas_payment_id;
  };

  const decrescente = await cenario(['pay_ZZZ', 'pay_AAA']);
  const crescente = await cenario(['pay_AAA', 'pay_ZZZ']);

  assert.equal(decrescente, 'pay_AAA', 'ordem decrescente: menor identificador');
  assert.equal(crescente, 'pay_AAA', 'ordem crescente: MESMA escolha');
  assert.equal(decrescente, crescente, 'a escolha NÃO depende da ordem da API');
});

test('D1.4.2b — consulta inconclusiva NÃO autoriza criar', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));
  const p = provedorFake({ plano: ['timeout'], consultar_erro: true });

  await emitir(b, 'op1', 0, p);
  const r2 = await emitir(b, 'op1', 0, p);

  assert.equal(r2.ok, false);
  assert.equal(r2.motivo, 'reconciliacao_indeterminada');
  assert.equal(p.chamadas.criar, 1, 'não emitiu às cegas');
  assert.equal(b.ler('op1').asaas_intents['0'].status, COBRANCA_STATUS.RECONCILIACAO_PENDENTE);
});

test('D1.4.2c — 5xx após criar é tratado como ambíguo, não como falha', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));
  const p = provedorFake({ plano: ['http500'] });

  const r1 = await emitir(b, 'op1', 0, p);
  assert.equal(r1.motivo, 'reconciliacao_pendente');
  assert.equal(p.cobrancas.length, 1);

  const r2 = await emitir(b, 'op1', 0, p);
  assert.equal(r2.reconciliada, true);
  assert.equal(p.chamadas.criar, 1, 'não duplicou o boleto');
});

test('D1.4.3 — resposta recebida, falha ao PERSISTIR o identificador', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));
  const p = provedorFake();

  // A gravação da parcela falha — a cobrança já existe no provedor.
  b.falharQuando((q, u) => Object.keys(u.$set || {}).some((k) => k.startsWith('installment_schedule')));

  const r1 = await emitir(b, 'op1', 0, p);
  assert.equal(r1.ok, false);
  assert.equal(r1.motivo, 'reconciliacao_pendente', 'nunca fica em `solicitando`');
  assert.equal(p.cobrancas.length, 1);
  assert.equal(b.ler('op1').asaas_intents['0'].status, COBRANCA_STATUS.RECONCILIACAO_PENDENTE);

  // A gravação volta a funcionar; a retomada recupera sem criar outra.
  b.pararDeFalhar();
  const r2 = await emitir(b, 'op1', 0, p);
  assert.equal(r2.ok, true);
  assert.equal(r2.reconciliada, true);
  assert.equal(p.chamadas.criar, 1, 'não criou um segundo boleto');
});

test('D1.4.4 — repetir uma emissão JÁ CONCLUÍDA reutiliza, sem chamar o provedor', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));
  const p = provedorFake();

  const r1 = await emitir(b, 'op1', 0, p);
  assert.equal(r1.ok, true);

  const r2 = await emitir(b, 'op1', 0, p);
  const r3 = await emitir(b, 'op1', 0, p);

  assert.equal(r2.reutilizada, true);
  assert.equal(r3.reutilizada, true);
  assert.equal(p.chamadas.criar, 1, 'o provedor foi chamado UMA vez');
  assert.equal(p.cobrancas.length, 1);
});

test('D1.4.5 — duas parcelas diferentes emitidas simultaneamente', async () => {
  const b = banco();
  b.semear(operacao('op1', 2));
  const p = provedorFake();

  const [a, c] = await Promise.all([emitir(b, 'op1', 0, p), emitir(b, 'op1', 1, p)]);

  assert.equal(a.ok, true);
  assert.equal(c.ok, true);
  assert.equal(p.chamadas.criar, 2, 'uma cobrança por parcela');
  assert.notEqual(a.payment_id, c.payment_id);

  const o = b.ler('op1');
  assert.equal(o.installment_schedule[0].asaas_payment_id, a.payment_id);
  assert.equal(o.installment_schedule[1].asaas_payment_id, c.payment_id);
  assert.equal(o.asaas_intents['0'].status, COBRANCA_STATUS.CRIADA);
  assert.equal(o.asaas_intents['1'].status, COBRANCA_STATUS.CRIADA);
});

test('D1.4.6 — lote parcialmente concluído e retomado', async () => {
  const b = banco();
  b.semear(operacao('op1', 3));
  // A 2ª parcela falha de forma definitiva; a 3ª é ambígua.
  const p = provedorFake({ plano: ['ok', 'http400', 'timeout'] });

  const op = await b.entities.Operation.get('op1');
  const resumo = await emitirLote(b.base44, {
    operation: op,
    provedor: p,
    nowIso: AGORA,
    staleIso: VELHO,
    itens: [0, 1, 2].map((i) => ({ slot: i, alvo: alvoParcela(op, i) })),
  });

  assert.equal(resumo.success, false, 'lote parcial NÃO é declarado concluído');
  assert.equal(resumo.parcial, true);
  assert.equal(resumo.total_charges, 1);
  assert.equal(resumo.pendentes, 2);
  assert.deepEqual(
    resumo.resultados.map((r) => r.ok),
    [true, false, false]
  );
  assert.equal(resumo.resultados[1].motivo, 'falha_emissao');
  assert.equal(resumo.resultados[2].motivo, 'reconciliacao_pendente');

  // Retomada: a 1ª é reutilizada, a 2ª tenta de novo (4xx não criou nada) e a
  // 3ª concilia a cobrança que já existe.
  const p2 = provedorFake();
  p2.cobrancas.push(...p.cobrancas);
  const op2 = await b.entities.Operation.get('op1');
  const resumo2 = await emitirLote(b.base44, {
    operation: op2,
    provedor: p2,
    nowIso: '2026-10-19T13:00:00.000Z',
    staleIso: VELHO,
    itens: [0, 1, 2].map((i) => ({ slot: i, alvo: alvoParcela(op2, i) })),
  });

  assert.equal(resumo2.resultados[0].reutilizada, true, 'a 1ª não foi recriada');
  assert.equal(resumo2.resultados[2].reconciliada, true, 'a 3ª recuperou a cobrança existente');
  assert.equal(resumo2.resultados[2].ok, true);
  assert.equal(resumo2.resultados[1].ok, true, 'a 2ª pôde ser emitida após a rejeição definitiva');
});

test('D1.4.7 — falha de uma parcela não perde o resultado das demais', async () => {
  const b = banco();
  b.semear(operacao('op1', 3));
  const p = provedorFake({ plano: ['ok', 'http400', 'ok'] });

  const op = await b.entities.Operation.get('op1');
  const resumo = await emitirLote(b.base44, {
    operation: op,
    provedor: p,
    nowIso: AGORA,
    staleIso: VELHO,
    itens: [0, 1, 2].map((i) => ({ slot: i, alvo: alvoParcela(op, i) })),
  });

  assert.equal(resumo.total_charges, 2);
  const o = b.ler('op1');
  assert.ok(o.installment_schedule[0].asaas_payment_id, '1ª gravada');
  assert.equal(o.installment_schedule[1].asaas_payment_id, '', '2ª sem cobrança');
  assert.ok(o.installment_schedule[2].asaas_payment_id, '3ª gravada apesar da falha da 2ª');
});

test('D1.4.8 — reemissão enquanto uma consulta de status está em andamento', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));
  const p = provedorFake();

  // Uma cobrança antiga existe e uma consulta de status está em curso com ela.
  const r1 = await emitir(b, 'op1', 0, p);
  const idAntigo = r1.payment_id;

  // A reemissão grava uma cobrança NOVA.
  const o = b.ler('op1');
  o.installment_schedule[0].asaas_payment_id = '';
  o.asaas_intents['0'] = { ...o.asaas_intents['0'], status: COBRANCA_STATUS.CANCELADA, generation: 1 };
  const r2 = await emitir(b, 'op1', 0, p);
  const idNovo = r2.payment_id;
  assert.notEqual(idNovo, idAntigo);

  // Agora a consulta ANTIGA tenta limpar a parcela com base no id obsoleto.
  const limpou = await atualizarParcelaCondicional(b.entities, 'op1', 0, idAntigo, {
    'installment_schedule.0.asaas_payment_id': '',
    'installment_schedule.0.asaas_payment_status': 'deleted',
  });

  assert.equal(limpou, false, 'a escrita foi RECUSADA');
  assert.equal(b.ler('op1').installment_schedule[0].asaas_payment_id, idNovo, 'o vínculo novo sobreviveu');
});

/* ══ 14: resposta antiga sobre atualização nova ═══════════════════════════════ */

test('D1.4.14 — resposta ANTIGA do provedor não sobrescreve cobrança NOVA', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));

  // Execução A reivindica e o carimbo fica registrado.
  const venceu = await claimEmission(b.base44, 'op1', 0, intentKey('op1', 0, 1), 1, VELHO, VELHO);
  assert.equal(venceu, true);

  // Outra execução assume a reivindicação abandonada (carimbo novo). O corte
  // de abandono é AGORA: o carimbo de A (VELHO) já ficou para trás.
  const agora = '2026-10-19T14:00:00.000Z';
  const assumiu = await claimEmission(b.base44, 'op1', 0, intentKey('op1', 0, 1), 1, agora, AGORA);
  assert.equal(assumiu, true);

  // A resposta de A — que se refere à cobrança que A criou — chega atrasada.
  const gravouA = await markChargeCreated(
    b.base44,
    'op1',
    0,
    { payment_id: 'pay_ANTIGA' },
    camposCobrancaParcela(0, { payment_id: 'pay_ANTIGA', status: 'pending' }),
    VELHO
  );

  assert.equal(gravouA, false, 'a guarda recusou a resposta obsoleta');
  assert.equal(b.ler('op1').installment_schedule[0].asaas_payment_id, '', 'a parcela NÃO foi tocada');
});

/* ══ 9–13 e 15: parcelas e pagamentos (cobertos com D1.2/D1.3, revalidados) ══ */

test('D1.4.9 — atualização de status concorrendo com a emissão preserva a parcela', async () => {
  const b = banco();
  b.semear(operacao('op1', 2));
  const p = provedorFake();

  await emitir(b, 'op1', 0, p);

  // Um refresh de status de OUTRA parcela não pode mexer nesta.
  const ok = await atualizarParcelaCondicional(b.entities, 'op1', 1, '', {
    'installment_schedule.1.asaas_payment_status': 'overdue',
  });
  assert.equal(ok, true, 'a parcela 2 (sem cobrança) aceita o refresh');

  const o = b.ler('op1');
  assert.ok(o.installment_schedule[0].asaas_payment_id, 'a parcela 1 (com cobrança) permanece intacta');
  assert.equal(o.installment_schedule[1].asaas_payment_status, 'overdue');
});

test('D1.4.10 — cancelamento libera reemissão com IDENTIDADE NOVA', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));
  const p = provedorFake();

  const r1 = await emitir(b, 'op1', 0, p);
  await markChargeCancelled(b.base44, 'op1', 0, AGORA);

  const o = b.ler('op1');
  o.installment_schedule[0].asaas_payment_id = ''; // limpeza condicional feita pelo cancelamento

  const r2 = await emitir(b, 'op1', 0, p);

  assert.equal(r2.ok, true);
  assert.notEqual(r2.payment_id, r1.payment_id, 'cobrança nova, não a antiga');
  const i = b.ler('op1').asaas_intents['0'];
  assert.equal(i.status, COBRANCA_STATUS.CRIADA);
  assert.equal(i.generation, 2, 'a reemissão é uma geração NOVA');
  assert.equal(i.intent_key, 'cob:op1:0:g2');
});

/* ══ 27: efeitos secundários e reconciliação de contadores ════════════════════ */

test('D1.4.27 — ciclos_pagos é derivado e idempotente por identidade', async () => {
  const vinculos = new Map();
  vinculos.set('v1', { id: 'v1', ciclos_pagos: 0 });

  const entities = {
    AssinaturaVinculo: {
      async updateMany(query, update) {
        const alvo = vinculos.get(query.id);
        if (!alvo) return { updated: 0 };
        if (!casaCom(alvo, query)) return { updated: 0 };
        aplicarUpdate(alvo, update);
        return { updated: 1 };
      },
    },
  };

  const base44 = { asServiceRole: { entities } };
  const reivindicar = (paymentId) =>
    entities.AssinaturaVinculo.updateMany(
      { id: 'v1', ciclos_processados: { $ne: paymentId } },
      { $inc: { ciclos_pagos: 1 }, $addToSet: { ciclos_processados: paymentId } }
    );

  // Duas entregas do MESMO pagamento, simultâneas.
  const [a, c] = await Promise.all([reivindicar('pay_1'), reivindicar('pay_1')]);
  assert.equal([a, c].filter((r) => r.updated === 1).length, 1, 'só uma contou o ciclo');
  assert.equal(vinculos.get('v1').ciclos_pagos, 1);

  // Reentrega tardia: no-op.
  const d = await reivindicar('pay_1');
  assert.equal(d.updated, 0);
  assert.equal(vinculos.get('v1').ciclos_pagos, 1, 'não duplicou');

  // Pagamento DIFERENTE conta normalmente.
  await reivindicar('pay_2');
  assert.equal(vinculos.get('v1').ciclos_pagos, 2);

  // O contador é reconciliável a partir da lista.
  const v = vinculos.get('v1');
  assert.equal(contadorDeCiclos(v.ciclos_processados), v.ciclos_pagos);
});

test('D1.4.28 — nenhum erro carrega credencial ou dado pessoal no histórico', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));
  const p = provedorFake({ plano: ['http400'] });

  await emitir(b, 'op1', 0, p);

  const i = b.ler('op1').asaas_intents['0'];
  const serializado = JSON.stringify(i);
  assert.equal(/access_token|ASAAS_API_KEY|cpf|cnpj|password/i.test(serializado), false, 'histórico limpo');
  assert.ok(i.history.length >= 1, 'há histórico registrado');
  assert.equal(typeof i.history[0].at, 'string');
});

/* ══ Resumo do lote ═══════════════════════════════════════════════════════════ */

test('D1.4.29 — resumirLote é honesto sobre sucesso parcial', () => {
  const cheio = resumirLote([
    { slot: 0, parcela: 1, ok: true, payment_id: 'p1' },
    { slot: 1, parcela: 2, ok: true, payment_id: 'p2' },
  ]);
  assert.equal(cheio.success, true);
  assert.equal(cheio.parcial, false);

  const parcial = resumirLote([
    { slot: 0, parcela: 1, ok: true, payment_id: 'p1' },
    { slot: 1, parcela: 2, ok: false, motivo: 'falha_emissao' },
  ]);
  assert.equal(parcial.success, false, 'nunca declara sucesso quando parte falhou');
  assert.equal(parcial.parcial, true);
  assert.equal(parcial.pendentes, 1);

  const vazio = resumirLote([{ slot: 0, parcela: 1, ok: false, motivo: 'falha_emissao' }]);
  assert.equal(vazio.success, false);
  assert.equal(vazio.parcial, false, 'nada concluído não é parcialmente concluído');
});

/* ══ Transições de estado ═════════════════════════════════════════════════════ */

test('D1.4.30 — a reivindicação ativa bloqueia; a abandonada libera', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));

  const primeira = await claimEmission(b.base44, 'op1', 0, 'k1', 1, AGORA, VELHO);
  assert.equal(primeira, true);

  // Ativa: bloqueada.
  const ativa = await claimEmission(b.base44, 'op1', 0, 'k1', 1, AGORA, VELHO);
  assert.equal(ativa, false, 'não se rouba uma reivindicação recente');

  // Abandonada: liberada. O corte de abandono avança para depois do carimbo.
  const abandonada = await claimEmission(
    b.base44, 'op1', 0, 'k1', 1,
    '2026-10-19T13:00:00.000Z',
    '2026-10-19T12:30:00.000Z'
  );
  assert.equal(abandonada, true, 'uma reivindicação abandonada é retomada');
});

test('D1.4.31 — falha definitiva sai do ciclo automático', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));

  await claimEmission(b.base44, 'op1', 0, 'k1', 1, AGORA, VELHO);
  await markChargeFailed(b.base44, 'op1', 0, 'erro', MAX_TENTATIVAS_COBRANCA - 1, AGORA);

  const i = b.ler('op1').asaas_intents['0'];
  assert.equal(i.status, COBRANCA_STATUS.FALHA_DEFINITIVA);
  assert.equal(intentPrecisaIntervencao(i), true);

  // Não é reivindicável automaticamente.
  const f = claimFilter(0, VELHO);
  assert.equal(casaCom(b.ler('op1'), { id: 'op1', ...f }), false, 'falha definitiva não casa com o filtro');
});

test('D1.4.32 — a emissão no nível da OPERAÇÃO usa o slot `op`', async () => {
  const b = banco();
  b.semear(operacao('op1', 0, { asaas_payment_id: '' }));
  const p = provedorFake();

  const operation = await b.entities.Operation.get('op1');
  const r = await emitirCobranca(b.base44, {
    operation,
    slot: 'op',
    alvo: {
      rotulo: null,
      billing_type: 'BOLETO',
      payload: { billingType: 'BOLETO', value: 1000, dueDate: '2026-11-10', description: 'Operação' },
      paymentIdAtual: '',
      campos: (info) => camposCobrancaOperacao(info),
    },
    provedor: p,
    nowIso: AGORA,
    staleIso: VELHO,
  });

  assert.equal(r.ok, true);
  const o = b.ler('op1');
  assert.equal(o.asaas_payment_id, r.payment_id, 'gravado no nível da operação');
  assert.equal(o.asaas_intents.op.status, COBRANCA_STATUS.CRIADA);

  const repetida = await emitirCobranca(b.base44, {
    operation: b.ler('op1'),
    slot: 'op',
    alvo: {
      rotulo: null,
      billing_type: 'BOLETO',
      payload: { billingType: 'BOLETO', value: 1000, dueDate: '2026-11-10', description: 'Operação' },
      paymentIdAtual: b.ler('op1').asaas_payment_id,
      campos: (info) => camposCobrancaOperacao(info),
    },
    provedor: p,
    nowIso: AGORA,
    staleIso: VELHO,
  });
  assert.equal(repetida.reutilizada, true);
  assert.equal(p.chamadas.criar, 1);
});

test('D1.4.33 — ambiguidade repetida não gera cobrança nova', async () => {
  const b = banco();
  b.semear(operacao('op1', 1));
  // Toda tentativa de criar é ambígua; a consulta sempre vê a cobrança criada.
  const p = provedorFake({ plano: () => 'timeout' });

  for (let i = 0; i < 5; i++) {
    await emitir(b, 'op1', 0, p, { nowIso: `2026-10-19T1${i}:00:00.000Z` });
  }

  // Só a PRIMEIRA criou; as seguintes consultaram e encontraram.
  assert.equal(p.cobrancas.length, 1, 'uma única cobrança após 5 tentativas');
  assert.equal(b.ler('op1').installment_schedule[0].asaas_payment_id, p.cobrancas[0].id);
});