/**
 * M1 — COMPENSAÇÃO E ESTORNO DE CHEQUE NO SERVIDOR.
 *
 * Categorias deste arquivo (declaradas para não confundir simulação com prova):
 *  · PARIDADE DE CÓDIGO — M1.1, M1.2: as cópias de servidor são idênticas às
 *    do frontend (só a extensão do import muda). Não é teste de comportamento.
 *  · UNIDADES contra SIMULADOR — M1.3 a M1.9: exercitam a orquestração REAL
 *    (`chequeEventFlow`) e a sincronização REAL (`chequeWrite.sincronizarOperacao`)
 *    sobre o simulador de plataforma. Nenhuma rede, nenhum dado real.
 *  · AUTORIZAÇÃO — M1.10: a política pura, com identidades sintéticas.
 *  · ASSERÇÃO DE CÓDIGO-FONTE — M1.11: o navegador deixou de escrever saldo.
 *
 * O único dublê é `criarLancamento` (o helper de caixa depende do cliente da
 * plataforma e não é importável em node). A regra de deduplicação por
 * source_type + source_id já é coberta por `testCashFlowHelper` na plataforma.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  compensarCheque,
  estornarCheque,
  recuperarLancamento,
  inspecionarCheque,
  MOTIVOS,
} from './chequeEventFlow.js';
import { LEDGER_KEYS_FIELD } from './bankLedger.js';
import { chequeEventKeys } from './chequeCore.js';
import { sincronizarOperacao } from './chequeWrite.js';
import { autorizarMovimentacaoBancaria, ACOES_BANCARIAS } from './bankAuthorization.js';
import { daysOverdue } from './finance.js';
import { criarColecao } from './__fixtures__/memoryStore.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..', '..');
const ler = (rel) => readFileSync(join(raiz, rel), 'utf8');

/* ─────────────────────────── paridade de código ────────────────────────── */

const normalizarExtensoes = (txt) =>
  txt.replace(/from '\.\/(chequeCore|bankLedger|chequeWrite|finance)\.ts'/g, "from './$1.js'");

test('M1.1 — as cópias de servidor são idênticas às do frontend', () => {
  assert.equal(ler('base44/shared/chequeCore.ts'), ler('src/lib/chequeCore.js'),
    'chequeCore divergiu — a regra de alocação mudaria em um dos lados');

  assert.equal(normalizarExtensoes(ler('base44/shared/chequeWrite.ts')), ler('src/lib/chequeWrite.js'),
    'chequeWrite divergiu — a escrita do cronograma mudaria em um dos lados');

  assert.equal(normalizarExtensoes(ler('base44/shared/chequeEventFlow.js')), ler('src/lib/chequeEventFlow.js'),
    'a orquestração de compensação divergiu entre servidor e testes');

  assert.equal(ler('base44/shared/bankAuthorization.js'), ler('src/lib/bankAuthorization.js'),
    'a política de autorização divergiu entre servidor e frontend');
});

test('M1.2 — daysOverdue do servidor devolve o mesmo que o do frontend', () => {
  const fonte = ler('base44/shared/finance.ts').replace('export function daysOverdue', 'function daysOverdue');
  const daysOverdueServidor = new Function(`${fonte}; return daysOverdue;`)();

  const ref = new Date('2026-10-20T12:00:00Z');
  const datas = ['2026-10-20', '2026-10-19', '2026-10-01', '2026-08-01', '2027-01-01', ''];
  for (const d of datas) {
    assert.equal(daysOverdueServidor(d, ref), daysOverdue(d, ref), `divergiu para ${d || '(vazio)'}`);
  }
});

/* ─────────────────────────── ambiente simulado ─────────────────────────── */

function criarAmbiente() {
  const colecoes = {};
  const col = (nome) => (colecoes[nome] = colecoes[nome] || criarColecao(nome));

  const api = {
    entities: new Proxy({}, {
      get(_alvo, nome) {
        if (typeof nome !== 'string') return undefined;
        const c = col(nome);
        return {
          get: async (id) => (c.achar(id) ? { ...c.achar(id) } : null),
          filter: (q) => c.filter(q || {}),
          create: (d) => c.create(d),
          update: async (id, patch) => {
            const doc = c.achar(id);
            if (!doc) throw new Error('não encontrado');
            Object.assign(doc, JSON.parse(JSON.stringify(patch)));
            return { ...doc };
          },
          updateMany: (q, u) => c.updateWhere(q || {}, u),
        };
      },
    }),
  };

  return { api, col };
}

async function cenario({ saldo = 0, valor = 1000, comOperacao = false } = {}) {
  const { api, col } = criarAmbiente();

  const banco = await col('Banco').create({
    name: 'BANCO TESTE', current_balance: saldo, [LEDGER_KEYS_FIELD]: [],
  });
  const bancoReserva = await col('Banco').create({
    name: 'BANCO RESERVA', current_balance: 0, [LEDGER_KEYS_FIELD]: [],
  });

  let operacao = null;
  if (comOperacao) {
    operacao = await col('Operation').create({
      client_id: 'cli1',
      total_receivable: valor,
      gross_value: valor,
      amount_paid: 0,
      status: 'ativo',
      due_date: '2026-10-20',
      installment_schedule: [{ due_date: '2026-10-20', value: valor, number: 1, status: 'pendente' }],
    });
  }

  const cheque = await col('Cheque').create({
    status: 'pendente',
    value: valor,
    check_number: '000123',
    client_name: 'CLIENTE TESTE',
    bank_name: 'BANCO EMISSOR',
    compensation_date: '2026-10-20',
    ...(operacao ? { operation_id: operacao.id } : {}),
  });

  const cashflows = col('CashFlow');

  const io = {
    chequeStore: {
      updateWhere: (q, u) => col('Cheque').updateWhere(q, u),
      read: async (id) => (col('Cheque').achar(id) ? { ...col('Cheque').achar(id) } : null),
    },
    bancoStore: {
      updateWhere: (q, u) => col('Banco').updateWhere(q, u),
      get: async (id) => (col('Banco').achar(id) ? { ...col('Banco').achar(id) } : null),
    },
    criarLancamento: async (p) => {
      const dup = await cashflows.filter({ source_type: p.source_type, source_id: p.source_id });
      if (dup.length > 0) return { status: 'duplicate', existing: dup[0] };
      return { status: 'created', cashflow: await cashflows.create({ ...p }) };
    },
    sincronizar: (opId, excluir) => sincronizarOperacao(api, opId, excluir),
    lerLancamentos: (q) => cashflows.filter(q),
  };

  const estado = (id) => ({
    banco: col('Banco').achar(id),
    cheque: col('Cheque').achar(cheque.id),
    operacao: operacao ? col('Operation').achar(operacao.id) : null,
    cashflows: cashflows.docs.slice(),
  });

  return { api, col, io, cheque, banco, bancoReserva, operacao, cashflows, estado };
}

/* ────────────────────────── compensação / estorno ──────────────────────── */

test('M1.3 — compensação credita uma vez, lança uma vez e grava a prova', async () => {
  const c = await cenario({ saldo: 0, valor: 1000 });

  const r = await compensarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: '2026-10-20', io: c.io,
  });

  assert.equal(r.status, 'aplicado');
  const e = c.estado(c.banco.id);
  assert.equal(e.banco.current_balance, 1000);
  assert.equal(e.cashflows.length, 1);
  assert.equal(e.cashflows[0].category, 'compensacao_cheque');
  assert.equal(e.cashflows[0].amount, 1000);
  assert.equal(e.cheque.status, 'compensado');
  assert.equal(e.cheque.compensated_at, '2026-10-20');
  assert.ok(e.cheque.compensation_token, 'o token do evento precisa ficar gravado');

  // A prova que habilita o estorno fica na MESMA escrita do saldo.
  const chave = chequeEventKeys(c.cheque.id, e.cheque.compensation_token).compensation;
  const esperado = `${chave.source_type}:${chave.source_id}`;
  assert.ok(e.banco[LEDGER_KEYS_FIELD].includes(esperado), 'chave do evento não gravada no banco');
  assert.equal(r.event_key, esperado);
});

test('M1.4 — oito compensações simultâneas produzem UM crédito e UM lançamento', async () => {
  const c = await cenario({ saldo: 0, valor: 500 });

  const execucoes = Array.from({ length: 8 }, () => compensarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: '2026-10-20', io: c.io,
  }));
  const resultados = await Promise.all(execucoes);

  assert.equal(resultados.filter((r) => r.status === 'aplicado').length, 1);
  assert.equal(resultados.filter((r) => r.motivo === MOTIVOS.ESTADO_JA_ALTERADO).length, 7);
  const e = c.estado(c.banco.id);
  assert.equal(e.banco.current_balance, 500, 'crédito duplo');
  assert.equal(e.cashflows.length, 1, 'lançamento duplicado');
});

test('M1.5 — estorno devolve o saldo e registra o evento contrário', async () => {
  const c = await cenario({ saldo: 0, valor: 700 });
  await compensarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: '2026-10-20', io: c.io,
  });

  const r = await estornarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: '2026-10-20', io: c.io,
  });

  assert.equal(r.status, 'aplicado');
  const e = c.estado(c.banco.id);
  assert.equal(e.banco.current_balance, 0, 'o saldo precisa voltar ao original');
  assert.equal(e.cheque.status, 'pendente');
  assert.equal(e.cheque.compensated_at, null);
  const estorno = e.cashflows.filter((x) => x.category === 'estorno_compensacao');
  assert.equal(estorno.length, 1);
  assert.equal(estorno[0].type, 'saida');
});

test('M1.6 — estorno de cheque "compensado" por quitação NÃO debita a conta', async () => {
  // É exatamente o que syncTitulosByOperacaoStatus produz: status compensado
  // sem token de evento e sem crédito aplicado.
  const c = await cenario({ saldo: 1000, valor: 1000 });
  await c.col('Cheque').updateWhere({ id: c.cheque.id }, { $set: { status: 'compensado', compensated_at: '2026-10-19' } });

  const r = await estornarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: '2026-10-20', io: c.io,
  });

  assert.equal(r.status, 'nao_aplicado');
  assert.equal(r.motivo, MOTIVOS.SEM_CREDITO_COMPROVADO);
  const e = c.estado(c.banco.id);
  assert.equal(e.banco.current_balance, 1000, 'debitou conta que nunca recebeu');
  assert.equal(e.cheque.status, 'compensado', 'o cheque não pode ser reaberto sem efeito');
  assert.equal(e.cashflows.length, 0);
});

test('M1.7 — estorno em conta diferente da que recebeu é recusado', async () => {
  const c = await cenario({ saldo: 0, valor: 400 });
  await compensarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: '2026-10-20', io: c.io,
  });

  const r = await estornarCheque({
    cheque: c.cheque, bankId: c.bancoReserva.id, bankName: 'BANCO RESERVA', data: '2026-10-20', io: c.io,
  });

  assert.equal(r.motivo, MOTIVOS.SEM_CREDITO_COMPROVADO);
  assert.equal(c.col('Banco').achar(c.banco.id).current_balance, 400);
  assert.equal(c.col('Banco').achar(c.bancoReserva.id).current_balance, 0);
});

test('M1.8 — recuperação recria o lançamento e NUNCA recredita o saldo', async () => {
  const c = await cenario({ saldo: 0, valor: 300 });
  await compensarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: '2026-10-20', io: c.io,
  });
  // Simula falha parcial: o lançamento desapareceu, o saldo ficou.
  const cf = c.cashflows.docs[0];
  c.cashflows.docs = c.cashflows.docs.filter((x) => x.id !== cf.id);

  const r = await recuperarLancamento({ cheque: c.cheque, io: c.io });

  assert.equal(r.status, 'reparado');
  const e = c.estado(c.banco.id);
  assert.equal(e.cashflows.length, 1, 'o lançamento precisa voltar');
  assert.equal(e.banco.current_balance, 300, 'a recuperação não pode recreditar');
});

test('M1.9 — a alocação cheque↔parcela continua idêntica após a migração', async () => {
  const c = await cenario({ saldo: 0, valor: 1000, comOperacao: true });

  await compensarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: '2026-10-20', io: c.io,
  });

  const op = c.col('Operation').achar(c.operacao.id);
  assert.equal(op.amount_paid, 1000, 'amount_paid não refletiu o cheque compensado');
  assert.equal(op.cheques_compensados_total, 1000, 'o marcador precisa acompanhar');
  assert.equal(op.balance_due, 0);
  assert.equal(op.status, 'quitado');
  const parcela = op.installment_schedule[0];
  assert.equal(parcela.paid, true);
  assert.equal(parcela.status, 'pago');
  assert.equal(parcela.settled_by, c.cheque.id, 'vínculo um-a-um cheque→parcela perdido');
});

test('M1.9b — estorno com operação recalcula por diferença, sem apagar pagamento avulso', async () => {
  const c = await cenario({ saldo: 0, valor: 1000, comOperacao: true });
  await compensarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: '2026-10-20', io: c.io,
  });
  // Pagamento independente (Asaas/baixa manual) de 250 sobre a mesma operação.
  await c.col('Operation').updateWhere({ id: c.operacao.id }, { $inc: { amount_paid: 250 } });

  await estornarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: '2026-10-21', io: c.io,
  });

  const op = c.col('Operation').achar(c.operacao.id);
  assert.equal(op.amount_paid, 250, 'o estorno apagou um pagamento independente');
  assert.equal(op.cheques_compensados_total, 0);
  assert.equal(op.installment_schedule[0].paid, false);
});

test('M1.9c — inspeção distingue completo de lançamento sem saldo', async () => {
  const c = await cenario({ saldo: 0, valor: 200 });
  await compensarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: '2026-10-20', io: c.io,
  });
  const completo = await inspecionarCheque({ cheque: c.cheque, io: c.io });
  assert.equal(completo.estado, 'completo');
  assert.equal(completo.estorno_permitido, true);

  const cf = c.cashflows.docs[0];
  c.cashflows.docs = c.cashflows.docs.filter((x) => x.id !== cf.id);
  const parcial = await inspecionarCheque({ cheque: c.cheque, io: c.io });
  assert.equal(parcial.estado, 'saldo_sem_lancamento');
});

/* ────────────────────────────── autorização ────────────────────────────── */

test('M1.10 — quem pode compensar e quem pode recuperar', () => {
  const admin = { email: 'a@x.com', role: 'admin', allowed_pages: [] };
  const comCheques = { email: 'b@x.com', role: 'user', allowed_pages: ['cheques'] };
  const comBancos = { email: 'c@x.com', role: 'user', allowed_pages: ['bancos'] };
  const semNada = { email: 'd@x.com', role: 'user', allowed_pages: ['clientes'] };

  assert.equal(autorizarMovimentacaoBancaria(admin, ACOES_BANCARIAS.COMPENSAR_CHEQUE).autorizado, true);
  assert.equal(autorizarMovimentacaoBancaria(comCheques, ACOES_BANCARIAS.COMPENSAR_CHEQUE).autorizado, true);
  assert.equal(autorizarMovimentacaoBancaria(comBancos, ACOES_BANCARIAS.COMPENSAR_CHEQUE).autorizado, true);
  assert.equal(autorizarMovimentacaoBancaria(comCheques, ACOES_BANCARIAS.ESTORNAR_CHEQUE).autorizado, true);
  assert.equal(autorizarMovimentacaoBancaria(semNada, ACOES_BANCARIAS.COMPENSAR_CHEQUE).autorizado, false);
  assert.equal(autorizarMovimentacaoBancaria(null, ACOES_BANCARIAS.COMPENSAR_CHEQUE).autorizado, false);

  // Recuperação é reparo: fica restrita a administrador.
  assert.equal(autorizarMovimentacaoBancaria(comCheques, ACOES_BANCARIAS.RECUPERAR_CHEQUE).autorizado, false);
  assert.equal(autorizarMovimentacaoBancaria(admin, ACOES_BANCARIAS.RECUPERAR_CHEQUE).autorizado, true);

  // A exigência anterior (transferência = página bancos) não foi afrouxada.
  assert.equal(autorizarMovimentacaoBancaria(comCheques, ACOES_BANCARIAS.TRANSFERIR).autorizado, false);
});

/* ───────────────────── o navegador deixou de escrever ──────────────────── */

test('M1.11 — o adaptador não escreve saldo nem lançamento', () => {
  const adaptador = ler('src/lib/chequeOps.js');
  for (const proibido of ['entities.Banco', 'entities.CashFlow', 'applyBankDelta', 'createChequeCashFlow', 'entities.Cheque']) {
    assert.ok(!adaptador.includes(proibido), `chequeOps ainda escreve direto: ${proibido}`);
  }
  assert.ok(adaptador.includes("functions.invoke('chequeEvento'"), 'o adaptador precisa chamar a função de servidor');
});