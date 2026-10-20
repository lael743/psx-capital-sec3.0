/**
 * D3.1 — IDEMPOTÊNCIA, CONCORRÊNCIA E ESCRITORES RESTANTES.
 *
 * Cada teste exercita uma corrida REAL contra o simulador (que cede controle
 * entre leitura e escrita). Nenhum deles depende de tempo de rede.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBankDelta,
  chavePerna,
  chaveEvento,
  LEDGER_KEYS_FIELD,
} from './bankLedger.js';
import { criarMotor } from './transferEngine.js';
import { aplicarEventoBancario } from './financeEvents.js';
import { criarColecao } from './__fixtures__/memoryStore.js';

const bancoDe = (id, saldo) => ({
  id,
  name: id.toUpperCase(),
  initial_balance: 0,
  current_balance: saldo,
  [LEDGER_KEYS_FIELD]: [],
});

const origem = (b) => ({ id: b.id, name: b.name });

function cenario() {
  const bancos = criarColecao('banco');
  const diarios = criarColecao('diario');
  const cashflows = criarColecao('cf');

  const bancoStore = { updateWhere: (q, u) => bancos.updateWhere(q, u) };

  const motor = criarMotor({
    bancoStore,
    diarioStore: {
      filter: (q) => diarios.filter(q),
      create: (d) => diarios.create(d),
      updateWhere: (q, u) => diarios.updateWhere(q, u),
    },
    cashflowStore: {
      filter: (q) => cashflows.filter(q),
      create: (d) => cashflows.create(d),
    },
  });

  return { bancos, diarios, cashflows, bancoStore, motor };
}

const executar = (motor, bancos, transferId, valor = 300) => motor.executarTransferencia({
  transferId,
  fromBank: origem(bancos.achar('b1')),
  toBank: origem(bancos.achar('b2')),
  amount: valor,
  date: '2026-10-20',
});

// ═════════ 1. duas CRIAÇÕES simultâneas do mesmo pedido ════════════════════
test('D3.1.1 — duas criações simultâneas da mesma transferência movem o saldo UMA vez', async () => {
  const { bancos, diarios, cashflows, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 1000), bancoDe('b2', 0));

  await Promise.all([
    executar(motor, bancos, 'tr-dup'),
    executar(motor, bancos, 'tr-dup'),
  ]);

  // Efeito financeiro: exatamente uma saída e uma entrada.
  assert.equal(bancos.achar('b1').current_balance, 700, 'saída aplicada uma única vez');
  assert.equal(bancos.achar('b2').current_balance, 300, 'entrada aplicada uma única vez');
  assert.equal(bancos.achar('b1')[LEDGER_KEYS_FIELD].length, 1);
  assert.equal(bancos.achar('b2')[LEDGER_KEYS_FIELD].length, 1);
  assert.equal(cashflows.docs.length, 2, 'um lançamento por perna, nunca dois');

  // Registro: a plataforma não tem chave única, então o excedente é MARCADO.
  const docs = diarios.docs.filter((d) => d.transfer_id === 'tr-dup');
  assert.ok(docs.length >= 1);
  const excedentes = docs.filter((d) => d.duplicado === true);
  assert.equal(excedentes.length, docs.length - 1, 'todo documento excedente fica marcado');

  // O canônico reflete o efeito real, nunca é rebaixado para "parcial".
  const canonico = docs.find((d) => d.duplicado !== true);
  assert.equal(canonico.status, 'aplicada');
});

// ═════════ 2. repetição simultânea de saída e entrada ══════════════════════
test('D3.1.2 — repetir o mesmo pedido em paralelo não duplica perna alguma', async () => {
  const { bancos, cashflows, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 1000), bancoDe('b2', 0));

  await Promise.all([
    executar(motor, bancos, 'tr-rep'),
    executar(motor, bancos, 'tr-rep'),
    executar(motor, bancos, 'tr-rep'),
  ]);

  assert.equal(cashflows.docs.filter((c) => c.transfer_leg === 'saida').length, 1);
  assert.equal(cashflows.docs.filter((c) => c.transfer_leg === 'entrada').length, 1);
  assert.equal(bancos.achar('b1').current_balance, 700);
  assert.equal(bancos.achar('b2').current_balance, 300);
});

// ═════════ 3. duas RECUPERAÇÕES concorrentes ═══════════════════════════════
test('D3.1.3 — duas recuperações concorrentes completam sem aplicar de novo a perna já feita', async () => {
  const { bancos, diarios, cashflows, bancoStore, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 1000), bancoDe('b2', 0));

  // Estado de falha parcial: saída aplicada no saldo, sem lançamento, destino intocado.
  await diarios.create({
    transfer_id: 'tr-part',
    from_bank_id: 'b1',
    from_bank_name: 'B1',
    to_bank_id: 'b2',
    to_bank_name: 'B2',
    amount: 300,
    date: '2026-10-20',
    description: 'parcial',
    status: 'parcial',
    legs: { saida: { banco: 'aplicado' } },
    attempts: 0,
  });
  await applyBankDelta({
    store: bancoStore, bankId: 'b1', delta: -300, eventKey: chavePerna('tr-part', 'saida'),
  });
  assert.equal(bancos.achar('b1').current_balance, 700);

  await Promise.all([
    motor.recuperarTransferencia({ transferId: 'tr-part' }),
    motor.recuperarTransferencia({ transferId: 'tr-part' }),
  ]);

  assert.equal(bancos.achar('b1').current_balance, 700, 'saída NÃO foi aplicada de novo');
  assert.equal(bancos.achar('b2').current_balance, 300, 'entrada aplicada uma vez');
  assert.equal(cashflows.docs.length, 2, 'um lançamento por perna');
});

// ═════════ 4. estorno repetido e concorrente ═══════════════════════════════
test('D3.1.4 — estorno repetido ou concorrente reverte uma única vez', async () => {
  const { bancos, cashflows, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 1000), bancoDe('b2', 0));

  await executar(motor, bancos, 'tr-est');
  assert.equal(bancos.achar('b1').current_balance, 700);

  await Promise.all([
    motor.estornarTransferencia({ transferId: 'tr-est', date: '2026-10-21' }),
    motor.estornarTransferencia({ transferId: 'tr-est', date: '2026-10-21' }),
  ]);

  assert.equal(bancos.achar('b1').current_balance, 1000, 'origem restaurada uma única vez');
  assert.equal(bancos.achar('b2').current_balance, 0, 'destino revertido uma única vez');

  const estornos = cashflows.docs.filter((c) => c.transfer_id === 'tr-est:estorno');
  assert.equal(estornos.length, 2, 'duas pernas de estorno, não quatro');
  assert.equal(cashflows.docs.length, 4, '2 originais + 2 de estorno');
});

// ═════════ 5. dois eventos DISTINTOS na mesma conta ════════════════════════
test('D3.1.5 — dois eventos distintos simultâneos na mesma conta não se perdem', async () => {
  const { bancos, bancoStore } = cenario();
  bancos.docs.push(bancoDe('b1', 1000));

  await Promise.all([
    applyBankDelta({ store: bancoStore, bankId: 'b1', delta: 100, eventKey: 'evt-a' }),
    applyBankDelta({ store: bancoStore, bankId: 'b1', delta: 50, eventKey: 'evt-b' }),
  ]);

  assert.equal(bancos.achar('b1').current_balance, 1150);
  assert.equal(bancos.achar('b1')[LEDGER_KEYS_FIELD].length, 2);
});

// ═════════ 6. escritores restantes protegidos na D3.1 ══════════════════════
test('D3.1.6 — escritores restantes: um movimento e um lançamento por evento', async () => {
  const { bancos, bancoStore } = cenario();
  bancos.docs.push(bancoDe('b1', 1000));

  const lancamentos = [];
  const aplicar = (delta, chave) => aplicarEventoBancario({
    store: bancoStore,
    bankId: 'b1',
    delta,
    eventKey: chave,
    aoAplicar: async () => { lancamentos.push(chave); },
  });

  // Resolução de cheque devolvido — mesma chave nos dois modais que resolvem.
  const chResolucao = chaveEvento('resolucao_cheque', 'ch1');
  await Promise.all([aplicar(500, chResolucao), aplicar(500, chResolucao)]);
  assert.equal(bancos.achar('b1').current_balance, 1500);
  assert.deepEqual(lancamentos, [chResolucao], 'crédito e lançamento só uma vez');

  // Lucro de prorrogação — repetição do mesmo recebimento.
  const chLucro = chaveEvento('lucro_prorrogacao', 'ch1:2026-10-20:120');
  await Promise.all([aplicar(120, chLucro), aplicar(120, chLucro)]);
  assert.equal(bancos.achar('b1').current_balance, 1620);
  assert.equal(lancamentos.length, 2);

  // Pagamento interno e seu estorno são eventos DIFERENTES: ambos valem.
  const chPag = chaveEvento('pagamento_interno', 'pg1');
  const chEstorno = chaveEvento('estorno_pagamento_interno', 'pg1');
  assert.notEqual(chPag, chEstorno);
  await Promise.all([aplicar(-200, chPag), aplicar(+200, chEstorno)]);
  assert.equal(bancos.achar('b1').current_balance, 1620);
  assert.equal(lancamentos.length, 4);

  // Repetir cada um não muda mais nada.
  await aplicar(-200, chPag);
  await aplicar(+200, chEstorno);
  assert.equal(bancos.achar('b1').current_balance, 1620);
  assert.equal(lancamentos.length, 4);
});

// ═════════ 7. falha parcial + recuperação com diário duplicado ═════════════
test('D3.1.7 — recuperação completa mesmo com documento duplicado presente', async () => {
  const { bancos, diarios, cashflows, bancoStore, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 1000), bancoDe('b2', 0));

  const base = {
    transfer_id: 'tr-x',
    from_bank_id: 'b1',
    from_bank_name: 'B1',
    to_bank_id: 'b2',
    to_bank_name: 'B2',
    amount: 300,
    date: '2026-10-20',
    description: 'x',
    legs: { saida: { banco: 'aplicado' } },
    attempts: 0,
  };
  await diarios.create({ ...base, status: 'parcial' });
  await diarios.create({ ...base, status: 'pendente', duplicado: true });
  await applyBankDelta({
    store: bancoStore, bankId: 'b1', delta: -300, eventKey: chavePerna('tr-x', 'saida'),
  });

  const res = await motor.recuperarTransferencia({ transferId: 'tr-x' });

  assert.equal(res.status, 'aplicada');
  assert.equal(bancos.achar('b1').current_balance, 700, 'não re-debitou');
  assert.equal(bancos.achar('b2').current_balance, 300);
  assert.equal(cashflows.docs.length, 2);
});

// ═════════ 8. acesso por identidades sem autorização ═══════════════════════
test.skip('D3.1.8 — acesso por identidade sem autorização (PENDENTE: exige 2ª identidade)', () => {
  // NÃO EXECUTÁVEL NESTE AMBIENTE. Ver relatório D3.1 §3.
  //
  // O ambiente de teste roda sempre com a mesma identidade (dono/admin), então
  // qualquer verificação de RLS feita aqui passaria por ser service role — o que
  // NÃO prova isolamento. Faltam:
  //   1. uma segunda conta de teste com role "user";
  //   2. regras de RLS declaradas em Banco, CashFlow e TransferenciaBancaria
  //      (hoje as três estão SEM RLS: qualquer usuário autenticado lê e escreve
  //      tudo, inclusive saldo bancário e transferências);
  //   3. execução por essa segunda identidade comprovando 403/lista vazia.
  // Declarar aqui "RLS validada" seria falso.
});