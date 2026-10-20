/**
 * FASE C4 — testes do núcleo de cheques: identidade de evento, concorrência,
 * vínculo cheque↔parcela, preservação de pagamentos independentes e recuperação.
 *
 * SOMENTE LÓGICA PURA + stores falsos em memória. Nenhum acesso a banco,
 * nenhum dado real, nenhuma chamada a Asaas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chequeEventKeys,
  compensationTokenOf,
  claimCheque,
  makeEventToken,
  buildInstallmentIdentities,
  installmentIdentity,
  allocateInstallments,
  computeAmountPaid,
  computeBalanceDue,
  computeRealizedProfit,
  detectLedgerGap,
  runIdempotentBatch,
  sumCompensated,
} from './chequeCore.js';

/* ── Store falso: reproduz o compare-and-swap do updateMany ─────────────── */

function makeStore(initial) {
  const rows = new Map(Object.entries(initial).map(([k, v]) => [k, { ...v }]));
  return {
    rows,
    /** Espelha base44: filtra por TODOS os campos do query e devolve { updated }. */
    async updateWhere(query, update) {
      let updated = 0;
      for (const [id, row] of rows) {
        const matches = Object.entries(query).every(([k, v]) => row[k] === v);
        if (!matches) continue;
        Object.assign(row, update.$set || {});
        updated++;
      }
      return { success: true, updated, has_more: false };
    },
    async read(id) {
      const r = rows.get(id);
      return r ? { ...r } : null;
    },
  };
}

const CHEQUE_BASE = {
  id: 'ch1',
  status: 'pendente',
  value: 1000,
  compensation_date: '2026-03-10',
  operation_id: 'op1',
};

/* ── C4.1 — identidade de evento ────────────────────────────────────────── */

test('C4.1a — compensação e estorno têm chaves distintas', () => {
  const k = chequeEventKeys('ch1', 'TOKEN-A');
  assert.equal(k.compensation.source_type, 'cheque_compensacao');
  assert.equal(k.reversal.source_type, 'cheque_estorno_compensacao');
  assert.notEqual(k.compensation.source_id, k.reversal.source_id);
});

test('C4.1b — compensar, estornar e compensar NO MESMO DIA não colide', () => {
  // A chave não contém data: o evento é identificado pelo token.
  const k1 = chequeEventKeys('ch1', 'TOKEN-1');
  const k2 = chequeEventKeys('ch1', 'TOKEN-2');
  assert.notEqual(k1.compensation.source_id, k2.compensation.source_id);

  // O estorno referencia a compensação revertida — não a data.
  assert.equal(k1.reversal.source_id, 'ch1#TOKEN-1#estorno');
  assert.equal(k2.reversal.source_id, 'ch1#TOKEN-2#estorno');
});

test('C4.1c — repetir o MESMO evento gera a MESMA chave (idempotência)', () => {
  const a = chequeEventKeys('ch1', 'TOKEN-1');
  const b = chequeEventKeys('ch1', 'TOKEN-1');
  assert.deepEqual(a, b);
});

test('C4.1d — cheque legado sem token ainda tem identidade estável', () => {
  const legado = { id: 'ch9', status: 'compensado', compensated_at: '2026-01-05' };
  assert.equal(compensationTokenOf(legado), 'legado:2026-01-05');
  assert.equal(compensationTokenOf(legado), compensationTokenOf({ ...legado }));
  // Sem data efetiva, cai no vencimento — ainda estável
  assert.equal(compensationTokenOf({ id: 'x', compensation_date: '2026-02-02' }), 'legado:2026-02-02');
});

test('C4.1e — tokens gerados são únicos', () => {
  const set = new Set(Array.from({ length: 500 }, () => makeEventToken()));
  assert.equal(set.size, 500);
});

/* ── C4.2 — concorrência (CAS) ──────────────────────────────────────────── */

test('C4.2a — duas compensações simultâneas: só uma vence', async () => {
  const store = makeStore({ ch1: CHEQUE_BASE });

  const tentativa = (token) => claimCheque(
    store,
    'ch1',
    'pendente',
    { status: 'compensado', compensation_token: token, compensated_at: '2026-03-12' },
    token
  );

  // Duas execuções partem do MESMO estado lido
  const [a, b] = await Promise.all([tentativa('TOKEN-A'), tentativa('TOKEN-B')]);

  const vencedores = [a, b].filter((r) => r.claimed);
  assert.equal(vencedores.length, 1, 'exatamente uma tentativa deve vencer');

  const final = await store.read('ch1');
  assert.equal(final.status, 'compensado');
  // O token gravado é o do vencedor — prova de que a perdedora não aplicou nada
  const vencedor = a.claimed ? 'TOKEN-A' : 'TOKEN-B';
  assert.equal(final.compensation_token, vencedor);
});

test('C4.2b — a tentativa perdedora não altera nenhum registro', async () => {
  const store = makeStore({ ch1: CHEQUE_BASE });
  const r1 = await claimCheque(store, 'ch1', 'pendente', { status: 'compensado', compensation_token: 'T1' }, 'T1');
  const r2 = await claimCheque(store, 'ch1', 'pendente', { status: 'compensado', compensation_token: 'T2' }, 'T2');
  assert.equal(r1.claimed, true);
  assert.equal(r1.updated, 1);
  assert.equal(r2.claimed, false);
  assert.equal(r2.updated, 0, 'updated=0 é a prova de que nada foi gravado');
  assert.equal((await store.read('ch1')).compensation_token, 'T1');
});

test('C4.2c — dois estornos simultâneos: só um debita', async () => {
  const store = makeStore({
    ch1: { ...CHEQUE_BASE, status: 'compensado', compensation_token: 'T1', compensated_at: '2026-03-12' },
  });
  const tentativa = (tok) => claimCheque(
    store, 'ch1', 'compensado',
    { status: 'pendente', compensated_at: null, compensation_token: tok }, tok
  );
  const [a, b] = await Promise.all([tentativa('R1'), tentativa('R2')]);
  assert.equal([a, b].filter((r) => r.claimed).length, 1);
  assert.equal((await store.read('ch1')).status, 'pendente');
});

test('C4.2d — fallback por token quando a plataforma não devolve contador', async () => {
  const store = makeStore({ ch1: CHEQUE_BASE });
  const semContador = {
    updateWhere: async (q, u) => {
      await store.updateWhere(q, u);
      return {}; // plataforma sem `updated`
    },
    read: store.read,
  };
  const r1 = await claimCheque(semContador, 'ch1', 'pendente', { status: 'compensado', compensation_token: 'T1' }, 'T1');
  const r2 = await claimCheque(semContador, 'ch1', 'pendente', { status: 'compensado', compensation_token: 'T2' }, 'T2');
  assert.equal(r1.method, 'token');
  assert.equal(r1.claimed, true);
  assert.equal(r2.claimed, false, 'a releitura ainda identifica a perdedora');
});

test('C4.2e — compensar → estornar → compensar novamente produz chaves distintas', async () => {
  const store = makeStore({ ch1: CHEQUE_BASE });
  const chaves = [];

  const compensar = async (tok) => {
    const ok = await claimCheque(store, 'ch1', 'pendente', { status: 'compensado', compensation_token: tok }, tok);
    if (ok.claimed) chaves.push(chequeEventKeys('ch1', tok).compensation.source_id);
    return ok;
  };
  const estornar = async () => {
    const atual = await store.read('ch1');
    const tokComp = compensationTokenOf(atual);
    const tok = makeEventToken();
    const ok = await claimCheque(store, 'ch1', 'compensado', { status: 'pendente', compensated_at: null, compensation_token: tok }, tok);
    if (ok.claimed) chaves.push(chequeEventKeys('ch1', tokComp).reversal.source_id);
    return ok;
  };

  await compensar('T1');
  await estornar();
  await compensar('T2');

  assert.equal(chaves.length, 3);
  assert.equal(new Set(chaves).size, 3, 'três eventos, três chaves distintas — nenhuma colisão');
});

/* ── C4.3 — identidade de parcela e vínculo explícito ───────────────────── */

test('C4.3a — parcelas idênticas recebem identidades distintas', () => {
  const iguais = [
    { due_date: '2026-04-10', value: 500, number: 1 },
    { due_date: '2026-04-10', value: 500, number: 1 },
  ];
  const ids = buildInstallmentIdentities(iguais);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1], 'mesma data e mesmo valor não podem colidir');
});

test('C4.3b — identidade derivada não depende da posição no array', () => {
  const a = { due_date: '2026-04-10', value: 500, number: 1 };
  const b = { due_date: '2026-05-10', value: 700, number: 2 };
  const idA = buildInstallmentIdentities([a, b]);
  const idB = buildInstallmentIdentities([b, a]);
  assert.equal(idA[0], idB[1]);
  assert.equal(idA[1], idB[0]);
});

test('C4.3c — agenda nova usa o id persistido da parcela', () => {
  assert.equal(installmentIdentity({ id: 'PARC-7', due_date: '2026-04-10' }), 'PARC-7');
});

test('C4.3d — vínculo cheque↔parcela fica explícito em settled_by', () => {
  const schedule = [
    { due_date: '2026-04-10', value: 500 },
    { due_date: '2026-05-10', value: 500 },
  ];
  const cheques = [{ id: 'ch1', status: 'compensado', compensation_date: '2026-05-10', value: 500 }];
  const out = allocateInstallments(schedule, cheques);
  assert.equal(out[0].settled_by, null);
  assert.equal(out[0].paid, false);
  assert.equal(out[1].settled_by, 'ch1');
  assert.equal(out[1].paid, true);
  assert.ok(out[1].id, 'toda parcela tem identidade');
});

test('C4.3e — dois cheques na mesma operação: um-a-um, sem ambiguidade', () => {
  const schedule = [
    { due_date: '2026-04-10', value: 500 },
    { due_date: '2026-04-10', value: 500 },
  ];
  const cheques = [
    { id: 'ch1', status: 'compensado', compensation_date: '2026-04-10', value: 500 },
    { id: 'ch2', status: 'compensado', compensation_date: '2026-04-10', value: 500 },
  ];
  const out = allocateInstallments(schedule, cheques);
  assert.equal(out.filter((i) => i.paid).length, 2);
  const vinculados = out.map((i) => i.settled_by);
  assert.equal(new Set(vinculados).size, 2, 'cada parcela aponta para um cheque diferente');
});

test('C4.3f — resultado independe da ordem dos arrays de entrada', () => {
  const schedule = [
    { due_date: '2026-04-10', value: 500 },
    { due_date: '2026-05-10', value: 500 },
    { due_date: '2026-06-10', value: 500 },
  ];
  const cheques = [
    { id: 'ch1', status: 'compensado', compensation_date: '2026-05-10', value: 500 },
    { id: 'ch2', status: 'compensado', compensation_date: '2026-06-10', value: 500 },
  ];
  const a = allocateInstallments(schedule, cheques);
  const b = allocateInstallments([...schedule].reverse(), [...cheques].reverse());
  // Compara por identidade estável, não por posição
  const mapa = (arr) => Object.fromEntries(arr.map((i) => [i.id, { paid: i.paid, settled_by: i.settled_by }]));
  assert.deepEqual(mapa(a), mapa(b));
});

/* ── C4.4 — estorno não apaga pagamentos independentes nem lucro ────────── */

test('C4.4a — estorno preserva pagamento independente já em amount_paid', () => {
  // Operação: 1000 de cheque compensado + 400 pagos por fora (Asaas/baixa manual)
  const op = { total_receivable: 2000, amount_paid: 1400, cheques_compensados_total: 1000 };

  // Estorno do cheque: o total de cheques cai para 0
  const novoAmountPaid = computeAmountPaid(op, 0);
  assert.equal(novoAmountPaid, 400, 'os 400 do pagamento independente sobrevivem');
  assert.equal(computeBalanceDue(op.total_receivable, novoAmountPaid), 1600);
});

test('C4.4b — recomputar o mesmo estado não infla nem some com valores', () => {
  const op = { total_receivable: 2000, amount_paid: 1400, cheques_compensados_total: 1000 };
  assert.equal(computeAmountPaid(op, 1000), 1400, 'idempotente');
});

test('C4.4c — compensar um segundo cheque soma apenas a diferença', () => {
  const op = { total_receivable: 2000, amount_paid: 1400, cheques_compensados_total: 1000 };
  const novo = computeAmountPaid(op, 1500); // +500 de um novo cheque
  assert.equal(novo, 1900);
  assert.equal(computeBalanceDue(op.total_receivable, novo), 100);
});

test('C4.4d — lucro já apurado não é zerado por estorno parcial', () => {
  const op = { gross_value: 1000, capital_cost: 0, realized_profit: 250, total_receivable: 2000 };
  // Após o estorno a operação NÃO está quitada → lucro é preservado
  assert.equal(computeRealizedProfit(op, 400, false), 250);
});

test('C4.4e — operação quitada recalcula o lucro sobre o total recebido', () => {
  const op = { gross_value: 1000, capital_cost: 100, realized_profit: 0 };
  assert.equal(computeRealizedProfit(op, 1400, true), 300);
});

test('C4.4f — operação sem marcador (legado) não é duplicada', () => {
  // Sem marcador, delta = 0 quando não há cheques compensados
  const legado = { total_receivable: 1000, amount_paid: 300 };
  assert.equal(computeAmountPaid(legado, 0), 300);
});

test('C4.4g — primeira execução em operação legada NÃO dobra os cheques', () => {
  // Legado: o código anterior gravava amount_paid = soma dos cheques compensados.
  // Sem marcador, assumir 0 dobraria o valor (1000 → 2000).
  const legado = { total_receivable: 2000, amount_paid: 1000 };
  assert.equal(computeAmountPaid(legado, 1000), 1000, 'não pode dobrar');
});

test('C4.4h — primeira execução com cheques ainda não refletidos soma corretamente', () => {
  // Operação sem nada pago, mas com um cheque já compensado
  const nova = { total_receivable: 2000, amount_paid: 0 };
  assert.equal(computeAmountPaid(nova, 1000), 1000);
});

test('C4.4i — com marcador gravado a diferença passa a ser exata', () => {
  const op = { total_receivable: 2000, amount_paid: 1400, cheques_compensados_total: 1000 };
  assert.equal(computeAmountPaid(op, 1000), 1400, 'sem alteração');
  assert.equal(computeAmountPaid(op, 0), 400, 'estorno remove só a parte dos cheques');
});

/* ── C4.5 — detecção de falha parcial ───────────────────────────────────── */

test('C4.5a — compensado sem lançamento de caixa é detectado', () => {
  const ch = { id: 'ch1', status: 'compensado', compensation_token: 'T1' };
  const gap = detectLedgerGap(ch, []);
  assert.equal(gap.reason, 'lancamento_ausente');
  assert.equal(gap.source_id, 'ch1#T1');
});

test('C4.5b — compensado com lançamento correspondente não acusa lacuna', () => {
  const ch = { id: 'ch1', status: 'compensado', compensation_token: 'T1' };
  const cfs = [{ source_type: 'cheque_compensacao', source_id: 'ch1#T1' }];
  assert.equal(detectLedgerGap(ch, cfs), null);
});

test('C4.5c — lançamento de OUTRO evento não mascara a lacuna', () => {
  const ch = { id: 'ch1', status: 'compensado', compensation_token: 'T2' };
  const cfs = [{ source_type: 'cheque_compensacao', source_id: 'ch1#T1' }];
  assert.equal(detectLedgerGap(ch, cfs).reason, 'lancamento_ausente');
});

test('C4.5d — cheque não compensado nunca acusa lacuna', () => {
  assert.equal(detectLedgerGap({ id: 'ch1', status: 'pendente' }, []), null);
});

/* ── C4.6 — lote com falha parcial continua convergindo ─────────────────── */

test('C4.6a — falha após a gravação não reprocessa nem duplica o item', async () => {
  const store = makeStore({
    ch1: { ...CHEQUE_BASE, id: 'ch1' },
    ch2: { ...CHEQUE_BASE, id: 'ch2' },
  });
  const lancamentos = [];
  let falharEm = 'ch2';

  const rodar = () => runIdempotentBatch(['ch1', 'ch2'], {
    isAlreadyDone: async (id) => (await store.read(id)).status === 'compensado',
    run: async (id) => {
      const tok = `T-${id}`;
      const ok = await claimCheque(store, id, 'pendente', { status: 'compensado', compensation_token: tok }, tok);
      if (!ok.claimed) return;
      lancamentos.push(chequeEventKeys(id, tok).compensation.source_id);
      if (id === falharEm) throw new Error('falha simulada após gravar');
    },
  });

  const r1 = await rodar();
  assert.equal(r1.ok.length, 1, 'ch1 concluiu');
  assert.equal(r1.failed.length, 1, 'ch2 falhou DEPOIS de gravar o estado');

  // Reprocessa o lote inteiro
  falharEm = null;
  const r2 = await rodar();

  // Ambos já estão gravados como compensados → pulados, nenhum refeito
  assert.equal(r2.skipped.length, 2);
  assert.equal(r2.ok.length, 0);
  assert.equal(r2.failed.length, 0);
  assert.equal(lancamentos.length, 2);
  assert.equal(new Set(lancamentos).size, lancamentos.length, 'nenhum lançamento duplicado');
});

test('C4.6a2 — item que falha após gravar fica sem lançamento: resíduo DETECTÁVEL', async () => {
  const store = makeStore({ ch2: { ...CHEQUE_BASE, id: 'ch2' } });
  const tok = 'T-ch2';
  const ok = await claimCheque(store, 'ch2', 'pendente', { status: 'compensado', compensation_token: tok }, tok);
  assert.equal(ok.claimed, true);

  // A falha ocorreu antes de o lançamento ser criado
  const gap = detectLedgerGap(await store.read('ch2'), []);
  assert.equal(gap.reason, 'lancamento_ausente');
  assert.equal(gap.source_id, 'ch2#T-ch2');
});

test('C4.6b — a soma dos cheques compensados reflete só o que foi aplicado', async () => {
  const store = makeStore({
    ch1: { ...CHEQUE_BASE, id: 'ch1' },
    ch2: { ...CHEQUE_BASE, id: 'ch2' },
  });
  await claimCheque(store, 'ch1', 'pendente', { status: 'compensado', compensation_token: 'T1' }, 'T1');
  const todos = [await store.read('ch1'), await store.read('ch2')];
  assert.equal(sumCompensated(todos), 1000);
});