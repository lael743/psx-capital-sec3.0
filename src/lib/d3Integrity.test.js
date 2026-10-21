import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  applyBankDelta,
  planoDePernas,
  chavePerna,
  chaveEstornoPerna,
  chaveEvento,
  validarTransferencia,
  diagnosticarTransferencia,
  LEDGER_KEYS_FIELD,
} from './bankLedger.js';
import { criarMotor } from './transferEngine.js';
import { analisarDivergencias } from './ledgerShadow.js';

// ═══════════════ simulador de plataforma (concorrência real) ════════════════
//
// Implementa o subconjunto que a regra usa: `$ne`, `$exists`, `$lt`, `$in`,
// `$or`, `$inc`, `$push` e `$set` pontilhado. `updateWhere` CEDE antes de
// mutar: é essa janela que faz duas chamadas simultâneas se intercalarem de
// verdade — sem ela, o teste de concorrência não provaria nada.

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

function setPath(o, p, v) {
  const parts = p.split('.');
  let cur = o;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = v;
}

function casa(doc, cond) {
  if (!cond) return true;
  return Object.entries(cond).every(([campo, esperado]) => {
    if (campo === '$or') return esperado.some((c) => casa(doc, c));
    if (campo === '$and') return esperado.every((c) => casa(doc, c));
    const atual = getPath(doc, campo);
    if (esperado && typeof esperado === 'object' && !Array.isArray(esperado)) {
      return Object.entries(esperado).every(([op, val]) => {
        if (op === '$ne') return Array.isArray(atual) ? !atual.includes(val) : atual !== val;
        if (op === '$exists') return val ? atual !== undefined : atual === undefined;
        if (op === '$lt') return atual !== undefined && atual !== null && atual < val;
        if (op === '$in') return Array.isArray(val) && val.includes(atual);
        return true;
      });
    }
    return atual === esperado;
  });
}

function aplicar(doc, update) {
  if (update.$set) for (const [p, v] of Object.entries(update.$set)) setPath(doc, p, v);
  if (update.$inc) for (const [p, v] of Object.entries(update.$inc)) setPath(doc, p, (Number(getPath(doc, p)) || 0) + v);
  if (update.$push) {
    for (const [p, v] of Object.entries(update.$push)) {
      const at = getPath(doc, p);
      setPath(doc, p, Array.isArray(at) ? [...at, v] : [v]);
    }
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function criarColecao(nome) {
  return {
    docs: [],
    seq: 0,
    async filtro(q) {
      await tick();
      return this.docs.filter((d) => casa(d, q)).map((d) => ({ ...d }));
    },
    async create(d) {
      await tick();
      this.seq += 1;
      const doc = { id: `${nome}-${this.seq}`, ...d };
      this.docs.push(doc);
      return { ...doc };
    },
    async updateWhere(q, u) {
      await tick();
      const alvos = this.docs.filter((d) => casa(d, q));
      alvos.forEach((d) => aplicar(d, u));
      return { updated: alvos.length };
    },
    achar(id) {
      return this.docs.find((d) => d.id === id);
    },
  };
}

const bancoDe = (id, saldo, extra = {}) => ({
  id,
  name: id.toUpperCase(),
  initial_balance: 0,
  current_balance: saldo,
  [LEDGER_KEYS_FIELD]: [],
  ...extra,
});

function cenario({ falharAoAtualizar = null } = {}) {
  const bancos = criarColecao('banco');
  const diarios = criarColecao('diario');
  const cashflows = criarColecao('cf');

  const bancoStore = {
    updateWhere: async (q, u) => {
      if (falharAoAtualizar && q.id === falharAoAtualizar) {
        throw new Error('falha de rede simulada ao gravar o banco');
      }
      return bancos.updateWhere(q, u);
    },
  };

  const motor = criarMotor({
    bancoStore,
    diarioStore: {
      filter: (q) => diarios.filtro(q),
      create: (d) => diarios.create(d),
      updateWhere: (q, u) => diarios.updateWhere(q, u),
    },
    cashflowStore: {
      filter: (q) => cashflows.filtro(q),
      create: (d) => cashflows.create(d),
    },
  });

  return { bancos, diarios, cashflows, motor };
}

const origem = (b) => ({ id: b.id, name: b.name });

// ═══════════════════════ 1. transferência com duas pernas ══════════════════
test('D3.1 — transferência cria as duas pernas vinculadas, com bank_id', async () => {
  const { bancos, motor, cashflows } = cenario();
  bancos.docs.push(bancoDe('b1', 1000), bancoDe('b2', 0));

  const res = await motor.executarTransferencia({
    transferId: 'tr-1',
    fromBank: origem(bancos.achar('b1')),
    toBank: origem(bancos.achar('b2')),
    amount: 300,
    date: '2026-10-20',
  });

  assert.equal(res.status, 'aplicada');
  assert.equal(bancos.achar('b1').current_balance, 700);
  assert.equal(bancos.achar('b2').current_balance, 300);

  assert.equal(cashflows.docs.length, 2);
  const ids = cashflows.docs.map((c) => c.transfer_id);
  assert.deepEqual(ids, ['tr-1', 'tr-1'], 'as duas pernas compartilham o transfer_id');

  const saida = cashflows.docs.find((c) => c.transfer_leg === 'saida');
  const entrada = cashflows.docs.find((c) => c.transfer_leg === 'entrada');
  assert.equal(saida.bank_id, 'b1');
  assert.equal(entrada.bank_id, 'b2');
  assert.equal(saida.category, 'transferencia_interna');
  assert.equal(entrada.category, 'transferencia_interna');
});

test('D3.2 — plano de pernas sempre carrega bank_id nas duas pontas', () => {
  const pernas = planoDePernas({ transferId: 'x', fromBankId: 'b1', toBankId: 'b2', amount: 50 });
  assert.equal(pernas.length, 2);
  assert.ok(pernas.every((p) => Boolean(p.bankId)));
  assert.equal(pernas[0].delta, -50);
  assert.equal(pernas[1].delta, 50);
  assert.notEqual(pernas[0].key, pernas[1].key);
});

// ═════════════════════ 2. repetição e concorrência ═════════════════════════
test('D3.3 — repetir o MESMO pedido não duplica perna, saldo nem lançamento', async () => {
  const { bancos, motor, cashflows } = cenario();
  bancos.docs.push(bancoDe('b1', 1000), bancoDe('b2', 0));

  const params = {
    transferId: 'tr-2',
    fromBank: origem(bancos.achar('b1')),
    toBank: origem(bancos.achar('b2')),
    amount: 250,
    date: '2026-10-20',
  };

  await motor.executarTransferencia(params);
  await motor.executarTransferencia(params);
  await motor.executarTransferencia(params);

  assert.equal(bancos.achar('b1').current_balance, 750);
  assert.equal(bancos.achar('b2').current_balance, 250);
  assert.equal(cashflows.docs.length, 2, 'nunca mais de um lançamento por perna');
});

test('D3.4 — duas solicitações SIMULTÂNEAS do mesmo pedido não duplicam nada', async () => {
  const { bancos, motor, cashflows } = cenario();
  bancos.docs.push(bancoDe('b1', 1000), bancoDe('b2', 0));

  const params = {
    transferId: 'tr-3',
    fromBank: origem(bancos.achar('b1')),
    toBank: origem(bancos.achar('b2')),
    amount: 400,
    date: '2026-10-20',
  };

  const [a, b] = await Promise.all([
    motor.executarTransferencia(params),
    motor.executarTransferencia(params),
  ]);

  assert.equal(a.transferId, b.transferId);
  assert.equal(bancos.achar('b1').current_balance, 600, 'débito aplicado uma única vez');
  assert.equal(bancos.achar('b2').current_balance, 400, 'crédito aplicado uma única vez');
  assert.equal(cashflows.docs.length, 2);
});

// ═══════════════════ 3. falha parcial e recuperação ════════════════════════
test('D3.5 — falha depois de UMA perna deixa o estado DETECTÁVEL', async () => {
  const { bancos, motor, diarios } = cenario({ falharAoAtualizar: 'b2' });
  bancos.docs.push(bancoDe('b1', 1000), bancoDe('b2', 0));

  await assert.rejects(
    motor.executarTransferencia({
      transferId: 'tr-4',
      fromBank: origem(bancos.achar('b1')),
      toBank: origem(bancos.achar('b2')),
      amount: 300,
      date: '2026-10-20',
    }),
    /falha de rede simulada/
  );

  assert.equal(bancos.achar('b1').current_balance, 700, 'a saída foi aplicada');

  const diag = diagnosticarTransferencia(diarios.docs[0]);
  assert.equal(diag.parcial, true);
  assert.equal(diag.pernas.find((p) => p.leg === 'saida').saldo_aplicado, true);
  assert.equal(diag.pernas.find((p) => p.leg === 'entrada').saldo_aplicado, false);
});

test('D3.6 — recuperação completa sem reaplicar a perna já existente', async () => {
  const falha = cenario({ falharAoAtualizar: 'b2' });
  falha.bancos.docs.push(bancoDe('b1', 1000), bancoDe('b2', 0));

  const params = {
    transferId: 'tr-5',
    fromBank: origem(falha.bancos.achar('b1')),
    toBank: origem(falha.bancos.achar('b2')),
    amount: 300,
    date: '2026-10-20',
  };

  await assert.rejects(falha.motor.executarTransferencia(params), /falha de rede/);

  // A conta de destino estava inacessível; agora responde.
  const saudavel = {
    updateWhere: (q, u) => falha.bancos.updateWhere(q, u),
  };
  const motor = criarMotor({
    bancoStore: saudavel,
    diarioStore: {
      filter: (q) => falha.diarios.filtro(q),
      create: (d) => falha.diarios.create(d),
      updateWhere: (q, u) => falha.diarios.updateWhere(q, u),
    },
    cashflowStore: {
      filter: (q) => falha.cashflows.filtro(q),
      create: (d) => falha.cashflows.create(d),
    },
  });

  const res = await motor.recuperarTransferencia({ transferId: 'tr-5' });

  assert.equal(res.status, 'aplicada');
  assert.equal(falha.bancos.achar('b1').current_balance, 700, 'a saída NÃO foi reaplicada');
  assert.equal(falha.bancos.achar('b2').current_balance, 300);
  assert.equal(falha.cashflows.docs.length, 2, 'sem lançamento duplicado');
});

// ══════════════ 4. concorrência no saldo (o defeito da D2) ═════════════════
test('D3.7 — dois incrementos concorrentes na MESMA conta não se perdem', async () => {
  const bancos = criarColecao('banco');
  bancos.docs.push(bancoDe('b1', 1000));
  const store = { updateWhere: (q, u) => bancos.updateWhere(q, u) };

  const [r1, r2] = await Promise.all([
    applyBankDelta({ store, bankId: 'b1', delta: 300, eventKey: 'evt-a' }),
    applyBankDelta({ store, bankId: 'b1', delta: -100, eventKey: 'evt-b' }),
  ]);

  assert.equal(r1.status, 'aplicado');
  assert.equal(r2.status, 'aplicado');
  assert.equal(bancos.achar('b1').current_balance, 1200, '1000 + 300 - 100');
});

test('D3.8 — leitura-modificação-escrita (padrão antigo) PERDE atualização', async () => {
  // Demonstra por que o padrão anterior era inseguro: as duas chamadas leem o
  // mesmo saldo antes de qualquer escrita e a segunda sobrescreve a primeira.
  const bancos = criarColecao('banco');
  bancos.docs.push(bancoDe('b1', 1000));

  const naive = async (delta) => {
    const atual = bancos.achar('b1').current_balance;
    await tick();
    await bancos.updateWhere({ id: 'b1' }, { $set: { current_balance: atual + delta } });
  };

  await Promise.all([naive(300), naive(-100)]);

  const final = bancos.achar('b1').current_balance;
  assert.notEqual(final, 1200, 'o resultado correto (1000 + 300 - 100) não foi atingido');
  assert.ok([900, 1300].includes(final), `uma das atualizações foi perdida (saldo: ${final})`);
});

test('D3.9 — o mesmo evento financeiro nunca é aplicado duas vezes', async () => {
  const bancos = criarColecao('banco');
  bancos.docs.push(bancoDe('b1', 500));
  const store = { updateWhere: (q, u) => bancos.updateWhere(q, u) };

  const chave = chaveEvento('recebimento_operacao', 'op-1');
  const a = await applyBankDelta({ store, bankId: 'b1', delta: 900, eventKey: chave });
  const b = await applyBankDelta({ store, bankId: 'b1', delta: 900, eventKey: chave });

  assert.equal(a.status, 'aplicado');
  assert.equal(b.status, 'ja_aplicado');
  assert.equal(bancos.achar('b1').current_balance, 1400);
  assert.equal(bancos.achar('b1')[LEDGER_KEYS_FIELD].length, 1);
});

test('D3.10 — concorrência do MESMO evento: exatamente um vence', async () => {
  const bancos = criarColecao('banco');
  bancos.docs.push(bancoDe('b1', 0));
  const store = { updateWhere: (q, u) => bancos.updateWhere(q, u) };

  const aplicacoes = await Promise.all(
    Array.from({ length: 5 }, () => applyBankDelta({ store, bankId: 'b1', delta: 100, eventKey: 'evt-unico' }))
  );

  assert.equal(aplicacoes.filter((r) => r.status === 'aplicado').length, 1);
  assert.equal(bancos.achar('b1').current_balance, 100);
});

test('D3.11 — lançamento sem conta não é atribuído a conta alguma', async () => {
  const store = { updateWhere: () => { throw new Error('não deveria escrever'); } };
  const res = await applyBankDelta({ store, bankId: null, delta: 100, eventKey: 'evt-orfao' });
  assert.equal(res.status, 'sem_conta');
});

// ═════════════════════════ 5. estorno de transferência ═════════════════════
test('D3.12 — estorno reverte as duas pernas e preserva a rastreabilidade', async () => {
  const { bancos, motor, cashflows, diarios } = cenario();
  bancos.docs.push(bancoDe('b1', 1000), bancoDe('b2', 0));

  await motor.executarTransferencia({
    transferId: 'tr-6',
    fromBank: origem(bancos.achar('b1')),
    toBank: origem(bancos.achar('b2')),
    amount: 300,
    date: '2026-10-20',
  });

  const res = await motor.estornarTransferencia({ transferId: 'tr-6', date: '2026-10-21' });

  assert.equal(res.status, 'estornada');
  assert.equal(bancos.achar('b1').current_balance, 1000);
  assert.equal(bancos.achar('b2').current_balance, 0);
  assert.equal(cashflows.docs.length, 4, 'duas pernas originais + duas de estorno');

  const original = diarios.docs.find((d) => d.transfer_id === 'tr-6');
  assert.equal(original.status, 'estornada');
  assert.equal(original.estornada_por, 'tr-6:estorno');

  const estorno = diarios.docs.find((d) => d.transfer_id === 'tr-6:estorno');
  assert.equal(estorno.estorno_de, 'tr-6');

  // Estornar de novo não reverte uma segunda vez.
  await motor.estornarTransferencia({ transferId: 'tr-6', date: '2026-10-21' });
  assert.equal(bancos.achar('b1').current_balance, 1000);
  assert.equal(cashflows.docs.length, 4);
});

test('D3.13 — chaves de estorno são determinísticas e distintas das originais', () => {
  assert.equal(chaveEstornoPerna('t1', 'saida'), 'transfer:t1:estorno:saida');
  assert.notEqual(chaveEstornoPerna('t1', 'saida'), chavePerna('t1', 'saida'));
});

// ═════════════════════════════ 6. validação ════════════════════════════════
test('D3.14 — transferência inválida é recusada antes de qualquer escrita', () => {
  assert.match(validarTransferencia({ fromBankId: 'b1', toBankId: 'b1', amount: 10 }), /diferentes/);
  assert.match(validarTransferencia({ fromBankId: 'b1', toBankId: 'b2', amount: 0 }), /maior que zero/);
  assert.match(validarTransferencia({ fromBankId: '', toBankId: 'b2', amount: 10 }), /origem/);
  assert.equal(validarTransferencia({ fromBankId: 'b1', toBankId: 'b2', amount: 10 }), null);
});

// ═════════════ 7. conta sem data de referência do saldo inicial ════════════
test('D3.15 — conta sem ledger_start_date é declarada NÃO EXATA', () => {
  const rel = analisarDivergencias({
    bancos: [{ id: 'b1', name: 'Sem data', initial_balance: 0, current_balance: 100 }],
    lancamentos: [
      { id: 'a', type: 'entrada', amount: 100, date: '2026-01-10', category: 'lancamento_avulso', bank_id: 'b1' },
    ],
    dataBase: '2026-12-31',
  });
  assert.equal(rel.contas[0].precisao, 'sem_data_de_referencia');
  assert.ok(rel.lacunas.some((l) => l.tipo === 'sem_data_de_corte'));
});

test('D3.16 — conta com ledger_start_date ignora o que é anterior à abertura', () => {
  const rel = analisarDivergencias({
    bancos: [{ id: 'b1', name: 'Com data', initial_balance: 500, ledger_start_date: '2026-03-01', current_balance: 600 }],
    lancamentos: [
      { id: 'velho', type: 'entrada', amount: 9999, date: '2026-01-10', category: 'lancamento_avulso', bank_id: 'b1' },
      { id: 'novo', type: 'entrada', amount: 100, date: '2026-03-05', category: 'lancamento_avulso', bank_id: 'b1' },
    ],
    dataBase: '2026-12-31',
  });
  assert.equal(rel.contas[0].precisao, 'exata');
  assert.equal(rel.contas[0].anteriores_ao_inicio, 1);
  assert.equal(rel.contas[0].saldo_calculado, 600);
  assert.equal(rel.contas[0].classificacao, 'conforme');
});

// ═══════════ 8. transferência no cálculo sombra: só por transfer_id ════════
test('D3.17 — duas pernas com o mesmo transfer_id são uma transferência completa', () => {
  const rel = analisarDivergencias({
    bancos: [
      { id: 'b1', name: 'A', initial_balance: 0, current_balance: -400 },
      { id: 'b2', name: 'B', initial_balance: 0, current_balance: 400 },
    ],
    lancamentos: [
      { id: 'p1', type: 'saida', amount: 400, date: '2026-01-10', category: 'transferencia_interna', bank_id: 'b1', transfer_id: 'T1', transfer_leg: 'saida' },
      { id: 'p2', type: 'entrada', amount: 400, date: '2026-01-10', category: 'transferencia_interna', bank_id: 'b2', transfer_id: 'T1', transfer_leg: 'entrada' },
    ],
    dataBase: '2026-12-31',
  });
  assert.equal(rel.resumo.transferencias_completas, 1);
  assert.equal(rel.resumo.transferencias_sem_identificador, 0);
  assert.equal(rel.consolidado.saldo_calculado, 0);
});

test('D3.18 — perna única do mesmo transfer_id é incompleta', () => {
  const rel = analisarDivergencias({
    bancos: [{ id: 'b1', name: 'A', initial_balance: 0, current_balance: -400 }],
    lancamentos: [
      { id: 'p1', type: 'saida', amount: 400, date: '2026-01-10', category: 'transferencia_interna', bank_id: 'b1', transfer_id: 'T2' },
    ],
    dataBase: '2026-12-31',
  });
  assert.equal(rel.resumo.transferencias_incompletas, 1);
  assert.equal(rel.anomalias.transferencias_incompletas[0].transfer_id, 'T2');
});

test('D3.19 — perna legada SEM transfer_id não é pareada por valor e data', () => {
  const rel = analisarDivergencias({
    bancos: [
      { id: 'b1', name: 'A', initial_balance: 0, current_balance: 0 },
      { id: 'b2', name: 'B', initial_balance: 0, current_balance: 0 },
    ],
    lancamentos: [
      { id: 'l1', type: 'saida', amount: 500, date: '2026-01-10', category: 'transferencia_interna', bank_id: 'b1' },
      { id: 'l2', type: 'entrada', amount: 500, date: '2026-01-10', category: 'transferencia_interna', bank_id: 'b2' },
    ],
    dataBase: '2026-12-31',
  });
  assert.equal(rel.resumo.transferencias_completas, 0, 'valor+data NÃO é pareamento');
  assert.equal(rel.resumo.transferencias_sem_identificador, 2);
  assert.equal(rel.resumo.transferencias_incompletas, 2);
});

// ═══════════ 9. recebimentos e repasses: conta identificada ════════════════
test('D3.20 — recebimento de operação credita uma única vez por operação', async () => {
  const bancos = criarColecao('banco');
  bancos.docs.push(bancoDe('b1', 0));
  const store = { updateWhere: (q, u) => bancos.updateWhere(q, u) };

  const chave = chaveEvento('recebimento_operacao', 'op-9');
  await applyBankDelta({ store, bankId: 'b1', delta: 1500, eventKey: chave });
  const segundo = await applyBankDelta({ store, bankId: 'b1', delta: 1500, eventKey: chave });

  assert.equal(segundo.status, 'ja_aplicado');
  assert.equal(bancos.achar('b1').current_balance, 1500);
});

test('D3.21 — funções de recebimento e repasse gravam a conta no lançamento', () => {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const leitura = (p) => readFileSync(join(aqui, p), 'utf8');

  const recebimento = leitura('../../base44/functions/confirmOperationReceiptAndBank/entry.ts');
  assert.match(recebimento, /bank_id: receipt_bank_id/, 'recebimento deve identificar a conta');
  assert.match(recebimento, /source_type: sourceType/);
  assert.match(recebimento, /applyBankDelta/);
  assert.doesNotMatch(recebimento, /current_balance: newBalance/, 'não pode voltar a escrever saldo por leitura antiga');

  // M7 — o efeito do repasse passou a viver no núcleo compartilhado
  // (`shared/disbursement.js`); a função de servidor autoriza e delega. A
  // intenção da asserção continua a mesma: o lançamento identifica a conta e o
  // saldo é aplicado por evento, nunca por leitura antiga sobrescrita.
  const repasse = leitura('../../base44/shared/disbursement.js');
  // Cada linha do repasse (uma conta/forma) identifica a SUA conta de origem.
  assert.match(repasse, /bank_id: linha\.bancoId/);
  assert.match(repasse, /applyBankDelta/);
  assert.doesNotMatch(repasse, /current_balance: newBalance/);

  const autoridadeRepasse = leitura('../../base44/functions/executeOperationDisbursement/entry.ts');
  assert.match(autoridadeRepasse, /avaliarRepasse/, 'a execução deve consultar a regra do workflow');
  assert.doesNotMatch(autoridadeRepasse, /entities\.Operation\.update\(/, 'a prova do repasse é compare-and-swap no núcleo');
});

// ═════════════════════════ 10. sincronia das cópias ════════════════════════
test('D3.22 — cópia do backend de bankLedger é idêntica à do frontend', () => {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const front = readFileSync(join(aqui, 'bankLedger.js'), 'utf8');
  const back = readFileSync(join(aqui, '../../base44/shared/bankLedger.ts'), 'utf8');
  assert.equal(back, front, 'as duas cópias divergiram');
});