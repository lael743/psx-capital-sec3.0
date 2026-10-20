/**
 * M3 — RECEBIMENTOS: unicidade, concorrência, lucro e recuperação.
 *
 * Exercita o núcleo REAL (`src/lib/receiptEvent.js`, cópia idêntica do módulo de
 * servidor, provada por M3.0) contra um banco em memória que reproduz a
 * semântica comprovada da plataforma:
 *   · `updateMany` com guarda + `$inc` + `$push` é UMA escrita atômica por documento
 *   · a guarda `$ne` bloqueia a reentrega do mesmo evento
 *
 * Também exercita os outros dois canais (Asaas e cheque) para provar que a
 * MESMA operação, com os mesmos valores econômicos, apresenta o MESMO lucro
 * realizado — independentemente de quem a liquidou.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  registrarRecebimento,
  aplicarRecebimento,
  recomporDerivados,
  validarMora,
  diasDeAtraso,
  saldoEmAberto,
  ORIGENS,
} from './receiptEvent.js';
import { criarColecao } from './__fixtures__/memoryStore.js';
import { processReceipt } from './asaasReceiptFlow.js';
import { sincronizarOperacao } from './chequeWrite.js';

/* ── Plataforma em memória ─────────────────────────────────────────────────── */

function extratoSync(caminho) {
  const txt = readFileSync(new URL(caminho, import.meta.url), 'utf8');
  const m = txt.match(/\/\* @sync:start[^\n]*\n([\s\S]*?)\/\* @sync:end \*\//);
  assert.ok(m, `marcadores @sync ausentes em ${caminho}`);
  return m[1].trim();
}

function criarApi() {
  const colecoes = {
    Operation: criarColecao('Operation'),
    Payment: criarColecao('Payment'),
    Cheque: criarColecao('Cheque'),
    Client: criarColecao('Client'),
    LancamentoContaCorrente: criarColecao('LancamentoContaCorrente'),
    AsaasEvento: criarColecao('AsaasEvento'),
    Banco: criarColecao('Banco'),
    CashFlow: criarColecao('CashFlow'),
  };

  const montar = () => {
    const entidades = {};
    for (const [nome, col] of Object.entries(colecoes)) {
      entidades[nome] = {
        get: async (id) => {
          const d = col.achar(id);
          return d ? JSON.parse(JSON.stringify(d)) : null;
        },
        filter: (q) => col.filter(q),
        create: (d) => col.create(d),
        updateMany: (q, u) => col.updateWhere(q, u),
        update: (id, patch) => col.updateWhere({ id }, { $set: patch }),
        delete: (id) => col.delete(id),
        deleteMany: async () => ({ deleted: 0 }),
      };
    }
    return { entities: entidades, asServiceRole: { entities: entidades } };
  };

  const base44 = montar();

  return {
    base44,
    colecoes,
    semear(nome, doc) {
      colecoes[nome].docs.push({ ...doc });
      return doc;
    },
    ler(nome, id) {
      const d = colecoes[nome].achar(id);
      return d ? JSON.parse(JSON.stringify(d)) : null;
    },
    contar(nome) {
      return colecoes[nome].docs.length;
    },
  };
}

const DATA = '2026-10-20';

function opBase(extra = {}) {
  return {
    id: 'op1',
    client_id: 'cli1',
    client_name: 'Cedente Teste',
    total_receivable: 1000,
    amount_paid: 0,
    balance_due: 1000,
    gross_value: 800,
    net_value: 800,
    status: 'ativo',
    due_date: '2026-11-20',
    receipt_keys: [],
    ...extra,
  };
}

function recebimento(chave, valor, extra = {}) {
  return {
    operationId: 'op1',
    valorRecebido: valor,
    data: DATA,
    origem: ORIGENS.MANUAL,
    metodo: 'pix',
    chave,
    usuario: 'operador@psx.test',
    ...extra,
  };
}

/* ── M3.0 — as cópias concordam ────────────────────────────────────────────── */

test('M3.0 — núcleo de recebimento: cópia do servidor == cópia testada', () => {
  const front = extratoSync('./receiptEvent.js');
  const back = extratoSync('../../base44/shared/receiptEvent.js');
  assert.equal(front, back, 'as cópias do núcleo divergiram — ressincronize o bloco @sync');
});

/* ── M3.1 — recebimento manual ─────────────────────────────────────────────── */

test('M3.1 — recebimento manual aplica valor, grava evento e recompõe derivados', async () => {
  const api = criarApi();
  api.semear('Operation', opBase());

  const r = await registrarRecebimento(api.base44, recebimento('manual:e1', 400));

  assert.equal(r.ok, true);
  assert.equal(r.aplicado, true);
  assert.equal(r.valor_aplicado, 400);
  assert.equal(r.saldo_em_aberto, 600);
  assert.equal(r.status, 'ativo');

  const op = api.ler('Operation', 'op1');
  assert.equal(op.amount_paid, 400);
  assert.equal(op.balance_due, 600);
  assert.deepEqual(op.receipt_keys, ['manual:e1']);
  assert.equal(op.realized_profit, 0, 'operação não quitada preserva lucro realizado em zero');

  assert.equal(api.contar('Payment'), 1);
  const pagamento = api.ler('Payment', 'Payment-1');
  assert.equal(pagamento.amount, 400);
  assert.equal(pagamento.event_key, 'manual:e1');
  assert.equal(pagamento.registrado_por, 'operador@psx.test');
  assert.equal(pagamento.is_partial, true);
});

/* ── M3.2 — repetição do mesmo evento ─────────────────────────────────────── */

test('M3.2 — repetir o mesmo evento não soma de novo nem duplica o registro', async () => {
  const api = criarApi();
  api.semear('Operation', opBase());

  await registrarRecebimento(api.base44, recebimento('manual:e1', 400));
  const segunda = await registrarRecebimento(api.base44, recebimento('manual:e1', 400));

  assert.equal(segunda.ok, true);
  assert.equal(segunda.ja_aplicado, true);
  assert.equal(api.ler('Operation', 'op1').amount_paid, 400, 'valor aplicado duas vezes');
  assert.equal(api.contar('Payment'), 1, 'registro duplicado do mesmo evento');
  assert.equal(api.ler('Operation', 'op1').balance_due, 600);
});

/* ── M3.3 — concorrência ──────────────────────────────────────────────────── */

test('M3.3 — seis recebimentos simultâneos não perdem incremento', async () => {
  const api = criarApi();
  api.semear('Operation', opBase());

  const chaves = ['manual:a', 'manual:b', 'manual:c', 'manual:d', 'manual:e', 'manual:f'];
  const resultados = await Promise.all(
    chaves.map((chave) => registrarRecebimento(api.base44, recebimento(chave, 100)))
  );

  assert.ok(resultados.every((r) => r.ok), 'algum recebimento foi recusado');
  assert.equal(api.ler('Operation', 'op1').amount_paid, 600);
  assert.equal(api.ler('Operation', 'op1').balance_due, 400);
  assert.equal(api.contar('Payment'), 6);
  assert.equal(api.ler('Operation', 'op1').receipt_keys.length, 6);
});

test('M3.3b — dois recebimentos simultâneos com a MESMA chave aplicam uma vez', async () => {
  const api = criarApi();
  api.semear('Operation', opBase());

  const [a, b] = await Promise.all([
    registrarRecebimento(api.base44, recebimento('manual:mesma', 300)),
    registrarRecebimento(api.base44, recebimento('manual:mesma', 300)),
  ]);

  assert.equal(api.ler('Operation', 'op1').amount_paid, 300);
  assert.equal(api.contar('Payment'), 1);
  assert.equal([a, b].filter((r) => r.aplicado).length, 1, 'as duas execuções aplicaram');
});

/* ── M3.4 — saldo em aberto nunca negativo ────────────────────────────────── */

test('M3.4 — valor acima do saldo é recusado sem escrever nada', async () => {
  const api = criarApi();
  api.semear('Operation', opBase());

  const r = await registrarRecebimento(api.base44, recebimento('manual:excesso', 1200));

  assert.equal(r.ok, false);
  assert.match(r.erro, /acima do saldo em aberto/);
  assert.equal(api.ler('Operation', 'op1').amount_paid, 0);
  assert.equal(api.ler('Operation', 'op1').balance_due, 1000);
  assert.equal(api.contar('Payment'), 0);
});

test('M3.4b — saldo em aberto nunca fica negativo por arredondamento', async () => {
  const api = criarApi();
  api.semear('Operation', opBase({ total_receivable: 1000.005, amount_paid: 0, balance_due: 1000.005 }));

  await registrarRecebimento(api.base44, recebimento('manual:centavo', 1000.01));
  const op = api.ler('Operation', 'op1');
  assert.ok(op.balance_due >= 0, 'saldo negativo');
  assert.equal(op.balance_due, 0);
  assert.equal(saldoEmAberto(op.total_receivable, op.amount_paid), 0);
});

/* ── M3.5 / M3.8 — quitação e lucro realizado ─────────────────────────────── */

test('M3.5 — quitar pelo caminho manual calcula o lucro realizado', async () => {
  const api = criarApi();
  api.semear('Operation', opBase());

  const r = await registrarRecebimento(api.base44, recebimento('manual:total', 1000));

  assert.equal(r.status, 'quitado');
  assert.equal(r.realized_profit, 200, 'lucro realizado = 1000 − 800 de líquido');
  const op = api.ler('Operation', 'op1');
  assert.equal(op.status, 'quitado');
  assert.equal(op.balance_due, 0);
  assert.equal(op.amount_paid, 1000);
});

test('M3.6 — Asaas e manual produzem o MESMO lucro para a mesma operação', async () => {
  const viaManual = criarApi();
  viaManual.semear('Operation', opBase({ id: 'opM' }));
  await registrarRecebimento(viaManual.base44, {
    ...recebimento('manual:igual', 1000),
    operationId: 'opM',
  });

  const viaAsaas = criarApi();
  viaAsaas.semear('Operation', opBase({ id: 'opA', asaas_eventos_processados: [] }));
  await processReceipt(viaAsaas.base44, {
    operationId: 'opA',
    paymentId: 'pay_1',
    value: 1000,
    lancamentoPayload: null,
  });

  const manual = viaManual.ler('Operation', 'opM');
  const asaas = viaAsaas.ler('Operation', 'opA');

  assert.equal(asaas.status, 'quitado');
  assert.equal(asaas.balance_due, 0);
  assert.equal(asaas.realized_profit, manual.realized_profit,
    'a mesma operação apresenta lucros diferentes conforme o canal');
  assert.equal(asaas.realized_profit, 200);
});

test('M3.6b — Asaas não recalcula lucro antes da quitação', async () => {
  const api = criarApi();
  api.semear('Operation', opBase({ id: 'opP', asaas_eventos_processados: [] }));

  await processReceipt(api.base44, {
    operationId: 'opP',
    paymentId: 'pay_parcial',
    value: 400,
    lancamentoPayload: null,
  });

  const op = api.ler('Operation', 'opP');
  assert.equal(op.amount_paid, 400);
  assert.equal(op.balance_due, 600);
  assert.equal(op.realized_profit, 0, 'lucro não pode ser realizado com saldo em aberto');
});

test('M3.7 — compensação de cheque continua aplicando a mesma regra de lucro', async () => {
  const api = criarApi();
  api.semear('Client', { id: 'cli1', name: 'Cedente Teste' });
  api.semear('Operation', opBase({
    id: 'opC',
    installment_schedule: [{ number: 1, value: 1000, due_date: '2026-10-10', status: 'pendente' }],
    cheques_compensados_total: 0,
  }));
  api.semear('Cheque', {
    id: 'ch1',
    operation_id: 'opC',
    status: 'compensado',
    valor_face: 1000,
    compensation_date: '2026-10-10',
  });

  await sincronizarOperacao(api.base44, 'opC');

  const op = api.ler('Operation', 'opC');
  assert.equal(op.amount_paid, 1000);
  assert.equal(op.balance_due, 0);
  assert.equal(op.status, 'quitado');
  assert.equal(op.realized_profit, 200);
});

/* ── M3.9 — mora: regra explícita, não sobrescrita ────────────────────────── */

test('M3.9 — mora declarada é conferida contra o cálculo e entra uma única vez', async () => {
  const api = criarApi();
  api.semear('Operation', opBase());

  const r = await registrarRecebimento(api.base44, recebimento('baixa_manual:m1', 1050, {
    origem: ORIGENS.BAIXA_MANUAL,
    jurosMora: 50,
    taxaMora: 5,
    diasAtraso: 30,
  }));

  assert.equal(r.ok, true);
  assert.equal(r.juros_mora, 50);
  const op = api.ler('Operation', 'op1');
  assert.equal(op.total_receivable, 1050, 'a mora é incorporada à obrigação');
  assert.equal(op.amount_paid, 1050);
  assert.equal(op.balance_due, 0);
  assert.equal(op.realized_profit, 250);

  const pagamento = api.ler('Payment', 'Payment-1');
  assert.equal(pagamento.acrescimo, 50, 'mora precisa ficar registrada separadamente');
  assert.equal(pagamento.amount, 1050);

  // Repetir o mesmo evento não soma a mora duas vezes.
  await registrarRecebimento(api.base44, recebimento('baixa_manual:m1', 1050, {
    origem: ORIGENS.BAIXA_MANUAL,
    jurosMora: 50,
    taxaMora: 5,
    diasAtraso: 30,
  }));
  assert.equal(api.ler('Operation', 'op1').total_receivable, 1050);
});

test('M3.9b — mora divergente do cálculo é recusada', () => {
  const divergente = validarMora({ jurosMora: 80, taxaMora: 5, diasAtraso: 30, saldo: 1000 });
  assert.equal(divergente.ok, false);

  const semTaxa = validarMora({ jurosMora: 50, taxaMora: 0, diasAtraso: 30, saldo: 1000 });
  assert.equal(semTaxa.ok, false);

  const correta = validarMora({ jurosMora: 50, taxaMora: 5, diasAtraso: 30, saldo: 1000 });
  assert.equal(correta.ok, true);
  assert.equal(correta.mora, 50);

  assert.equal(diasDeAtraso('2026-09-20', DATA), 30);
  assert.equal(diasDeAtraso('2026-11-20', DATA), 0);
});

test('M3.9c — tarifas, despesas e taxa separada permanecem intactas', async () => {
  const api = criarApi();
  api.semear('Operation', opBase({
    total_receivable: 1130,
    tarifa_operacao: 100,
    tarifa_por_titulo: 30,
    capital_cost: 20,
  }));

  await registrarRecebimento(api.base44, recebimento('manual:sem-mora', 500));

  const op = api.ler('Operation', 'op1');
  assert.equal(op.total_receivable, 1130, 'recebimento não altera a obrigação');
  assert.equal(op.tarifa_operacao, 100);
  assert.equal(op.tarifa_por_titulo, 30);
  assert.equal(op.capital_cost, 20);
  assert.equal(op.amount_paid, 500);

  const pagamento = api.ler('Payment', 'Payment-1');
  assert.equal(pagamento.acrescimo, 0, 'sem mora não há acréscimo');
});

/* ── M3.10 — compatibilidade com operações históricas ────────────────────── */

test('M3.10 — operação histórica sem receipt_keys nem amount_paid não é duplicada', async () => {
  const api = criarApi();
  api.semear('Operation', {
    id: 'opLegado',
    client_id: 'cli1',
    client_name: 'Cedente Antigo',
    total_receivable: 1000,
    status: 'ativo',
    due_date: '2026-09-01',
    gross_value: 800,
  });

  const entrada = {
    operationId: 'opLegado',
    valorRecebido: 300,
    data: DATA,
    origem: ORIGENS.MANUAL,
    metodo: 'pix',
    chave: 'manual:legado',
  };

  await registrarRecebimento(api.base44, entrada);
  await registrarRecebimento(api.base44, entrada);

  const op = api.ler('Operation', 'opLegado');
  assert.equal(op.amount_paid, 300, 'operação legada foi duplicada');
  assert.equal(op.balance_due, 700);
  assert.equal(op.status, 'ativo', 'status fora de atraso é preservado');
  assert.deepEqual(op.receipt_keys, ['manual:legado']);
  assert.equal(api.contar('Payment'), 1);
});

test('M3.10b — operação quitada não aceita novo recebimento', async () => {
  const api = criarApi();
  api.semear('Operation', opBase({ amount_paid: 1000, balance_due: 0, status: 'quitado' }));

  const r = await registrarRecebimento(api.base44, recebimento('manual:tarde', 100));
  assert.equal(r.ok, false);
  assert.match(r.erro, /sem saldo em aberto/);
  assert.equal(api.contar('Payment'), 0);
});

/* ── M3.11 — falha entre efeito financeiro e registro do evento ───────────── */

test('M3.11 — falha ao registrar o evento é recuperável e não aplica duas vezes', async () => {
  const api = criarApi();
  api.semear('Operation', opBase());

  let falhar = true;
  const criarOriginal = api.base44.entities.Payment.create;
  api.base44.entities.Payment.create = async (d) => {
    if (falhar) {
      falhar = false;
      throw new Error('falha simulada entre aplicação e registro');
    }
    return criarOriginal(d);
  };

  const entrada = recebimento('manual:falha', 400);

  await assert.rejects(() => registrarRecebimento(api.base44, entrada), /falha simulada/);

  // O dinheiro entrou; o registro do evento ficou faltando.
  assert.equal(api.ler('Operation', 'op1').amount_paid, 400);
  assert.equal(api.contar('Payment'), 0);

  // Repetir com a MESMA chave completa o registro sem somar de novo.
  const retry = await registrarRecebimento(api.base44, entrada);
  assert.equal(retry.ok, true);
  assert.equal(retry.ja_aplicado, true);
  assert.equal(api.ler('Operation', 'op1').amount_paid, 400, 'o retry somou de novo');
  assert.equal(api.contar('Payment'), 1);
  assert.equal(api.ler('Payment', 'Payment-1').event_key, 'manual:falha');
});

test('M3.11b — recomposição obsoleta não sobrescreve valor mais novo', async () => {
  const api = criarApi();
  api.semear('Operation', opBase({ amount_paid: 500, balance_due: 500 }));

  // Simula uma recomposição que leu um valor antigo: o CAS precisa recusar.
  const resultado = await api.base44.entities.Operation.updateMany(
    { id: 'op1', amount_paid: 400 },
    { $set: { balance_due: 600 } }
  );
  assert.equal(resultado.updated, 0);

  await recomporDerivados(api.base44, 'op1');
  assert.equal(api.ler('Operation', 'op1').balance_due, 500);
  assert.equal(api.ler('Operation', 'op1').amount_paid, 500);
});

/* ── M3.12 — sem regressão em caixa e bancos ─────────────────────────────── */

test('M3.12 — recebimento da operação não movimenta caixa nem saldo bancário', async () => {
  const api = criarApi();
  api.semear('Operation', opBase());
  api.semear('Banco', { id: 'b1', name: 'Banco Teste', current_balance: 5000, applied_ledger_keys: [] });

  await registrarRecebimento(api.base44, recebimento('manual:sem-caixa', 1000));

  assert.equal(api.ler('Banco', 'b1').current_balance, 5000, 'saldo bancário foi movimentado');
  assert.deepEqual(api.ler('Banco', 'b1').applied_ledger_keys, []);
  assert.equal(api.contar('CashFlow'), 0, 'recebimento não pode gerar lançamento de caixa sozinho');
});

/* ── M3.13 — autorização não vem do corpo ────────────────────────────────── */

test('M3.13 — identidade do recebimento sai da entrada do servidor, não do documento', async () => {
  const api = criarApi();
  api.semear('Operation', opBase());

  await aplicarRecebimento(api.base44, recebimento('manual:autor', 100, {
    usuario: 'operador@psx.test',
    registrado_por: 'admin@psx.test',
    role: 'admin',
  }));

  const op = api.ler('Operation', 'op1');
  assert.equal(op.amount_paid, 100);
  assert.equal(op.registrado_por, undefined, 'o corpo não pode escrever na operação');
});