/**
 * M6.4 — BAIXA INDIVIDUAL DE TÍTULO PELA CENTRAL DE CONTAS A RECEBER.
 *
 * O que cada grupo prova:
 *  · PARIDADE (M6.4.0) — as cópias de servidor são as mesmas do navegador.
 *  · ELEGIBILIDADE (M6.4.1–M6.4.7) — a validação que a Central acrescenta
 *    antes de chegar ao núcleo: título, estado, valor, data, conta e SALDO.
 *  · NÚCLEO REUTILIZADO (M6.4.8–M6.4.13) — a baixa chama a compensação que já
 *    existe: um crédito, um lançamento, uma alocação, concorrência e
 *    idempotência do núcleo. Nada de segunda escrita financeira.
 *  · PORTA DE ENTRADA DA TELA (M6.4.14–M6.4.15) — quem ganha o botão e como a
 *    liquidação aparece no histórico da central.
 *  · AUTORIZAÇÃO E ESTRUTURA (M6.4.16–M6.4.17) — política pura e asserções
 *    sobre a função de servidor.
 *
 * O único dublê é `criarLancamento` (o helper de caixa depende do cliente da
 * plataforma). O simulador é o de memória já usado nos testes D4/M1, com
 * rendições assíncronas que permitem exercitar concorrência de verdade.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { avaliarBaixaTitulo, MOTIVOS_BAIXA, saldoDaOperacao } from './baixaTitulo.js';
import { compensarCheque, recuperarLancamento, inspecionarCheque, MOTIVOS } from './chequeEventFlow.js';
import { sincronizarOperacao } from './chequeWrite.js';
import { LEDGER_KEYS_FIELD } from './bankLedger.js';
import { criarColecao } from './__fixtures__/memoryStore.js';
import { tituloElegivelParaBaixa, montarLiquidacoes } from './contasReceber.js';
import {
  autorizarMovimentacaoBancaria,
  ACOES_BANCARIAS,
  PAGINA_CONTAS_A_RECEBER,
} from './bankAuthorization.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const ler = (rel) => readFileSync(join(RAIZ, rel), 'utf8');

const DATA = '2026-10-21';

/* ─────────────────────────── paridade de código ────────────────────────── */

test('M6.4.0 — as cópias de servidor da baixa são idênticas às do navegador', () => {
  assert.equal(
    ler('base44/shared/baixaTitulo.js'),
    ler('src/lib/baixaTitulo.js'),
    'a validação da baixa divergiu — servidor e tela decidiriam diferente',
  );
  assert.equal(
    ler('base44/shared/bankAuthorization.js'),
    ler('src/lib/bankAuthorization.js'),
    'a política de autorização divergiu entre servidor e frontend',
  );
  assert.match(
    ler('src/lib/baixaTituloOps.js'),
    /functions\.invoke\('baixaTitulo'/,
    'o adaptador do navegador precisa chamar a função de servidor',
  );
  const adaptador = ler('src/lib/baixaTituloOps.js');
  const escritas = adaptador.match(/entities\.\w+\.(create|update|delete|updateMany|bulkUpdate)/g) || [];
  assert.equal(escritas.length, 0, 'o adaptador não pode escrever entidade nenhuma');
});

/* ───────────────────────────── elegibilidade ───────────────────────────── */

const bancoOk = { id: 'b1', name: 'BANCO TESTE', active: true };
const operacaoOk = { id: 'op1', status: 'ativo', total_receivable: 1000, amount_paid: 0 };
const chequeOk = {
  id: 'ch1',
  status: 'pendente',
  value: 1000,
  operation_id: 'op1',
  compensation_date: '2026-10-21',
};

test('M6.4.1 — título pendente, com operação com saldo, é elegível', () => {
  const r = avaliarBaixaTitulo({ cheque: chequeOk, operacao: operacaoOk, banco: bancoOk, data: DATA });
  assert.equal(r.elegivel, true);
  assert.equal(r.valor, 1000);
  assert.equal(r.saldo_operacao, 1000);
  assert.equal(r.codigo, null);
});

test('M6.4.2 — título inexistente é recusado com 404', () => {
  const r = avaliarBaixaTitulo({ cheque: null, operacao: operacaoOk, banco: bancoOk, data: DATA });
  assert.equal(r.elegivel, false);
  assert.equal(r.codigo, MOTIVOS_BAIXA.TITULO_INEXISTENTE);
  assert.equal(r.http, 404);
});

test('M6.4.3 — título cancelado e título já liquidado são recusados', () => {
  const cancelado = avaliarBaixaTitulo({
    cheque: { ...chequeOk, status: 'cancelado' }, operacao: operacaoOk, banco: bancoOk, data: DATA,
  });
  assert.equal(cancelado.elegivel, false);
  assert.equal(cancelado.codigo, MOTIVOS_BAIXA.TITULO_NAO_PENDENTE);
  assert.equal(cancelado.http, 409);
  assert.match(cancelado.mensagem, /cancelado/i);

  const liquidado = avaliarBaixaTitulo({
    cheque: { ...chequeOk, status: 'compensado' }, operacao: operacaoOk, banco: bancoOk, data: DATA,
  });
  assert.equal(liquidado.elegivel, false);
  assert.equal(liquidado.codigo, MOTIVOS_BAIXA.TITULO_NAO_PENDENTE);
  assert.match(liquidado.mensagem, /já liquidado/i);
});

test('M6.4.4 — título devolvido ou resolvido não é baixado por esta porta', () => {
  for (const status of ['devolvido', 'resolvido_pago', 'resolvido_substituido', 'resolvido_prorrogado']) {
    const r = avaliarBaixaTitulo({
      cheque: { ...chequeOk, status }, operacao: operacaoOk, banco: bancoOk, data: DATA,
    });
    assert.equal(r.elegivel, false, `${status} não deveria ser elegível`);
    assert.equal(r.codigo, MOTIVOS_BAIXA.TITULO_NAO_PENDENTE);
  }
});

test('M6.4.5 — operação sem saldo em aberto recusa a baixa (validação de saldo pendente)', () => {
  const quitada = avaliarBaixaTitulo({
    cheque: chequeOk,
    operacao: { ...operacaoOk, status: 'quitado' },
    banco: bancoOk,
    data: DATA,
  });
  assert.equal(quitada.elegivel, false);
  assert.equal(quitada.codigo, MOTIVOS_BAIXA.SEM_SALDO);
  assert.equal(quitada.http, 409);

  const semSaldo = avaliarBaixaTitulo({
    cheque: chequeOk,
    operacao: { id: 'op1', status: 'ativo', total_receivable: 1000, amount_paid: 1000 },
    banco: bancoOk,
    data: DATA,
  });
  assert.equal(semSaldo.codigo, MOTIVOS_BAIXA.SEM_SALDO);
  assert.equal(semSaldo.saldo_operacao, 0);
});

test('M6.4.6 — título maior que o saldo em aberto é recusado', () => {
  const r = avaliarBaixaTitulo({
    cheque: { ...chequeOk, value: 1200 },
    operacao: operacaoOk,
    banco: bancoOk,
    data: DATA,
  });
  assert.equal(r.elegivel, false);
  assert.equal(r.codigo, MOTIVOS_BAIXA.VALOR_ACIMA_DO_SALDO);
  assert.equal(r.saldo_operacao, 1000);
});

test('M6.4.7 — data inválida, conta arquivada e título sem valor são recusados', () => {
  assert.equal(
    avaliarBaixaTitulo({ cheque: chequeOk, operacao: operacaoOk, banco: bancoOk, data: '21/10/2026' }).codigo,
    MOTIVOS_BAIXA.DATA_INVALIDA,
  );
  assert.equal(
    avaliarBaixaTitulo({
      cheque: chequeOk, operacao: operacaoOk, banco: { ...bancoOk, active: false }, data: DATA,
    }).codigo,
    MOTIVOS_BAIXA.CONTA_INVALIDA,
  );
  assert.equal(
    avaliarBaixaTitulo({ cheque: { ...chequeOk, value: 0 }, operacao: operacaoOk, banco: bancoOk, data: DATA }).codigo,
    MOTIVOS_BAIXA.TITULO_SEM_VALOR,
  );
  assert.equal(
    avaliarBaixaTitulo({ cheque: { ...chequeOk, operation_id: '' }, operacao: null, banco: bancoOk, data: DATA }).codigo,
    MOTIVOS_BAIXA.TITULO_SEM_OPERACAO,
  );
  assert.equal(saldoDaOperacao({ total_receivable: 500, amount_paid: 200 }), 300);
});

/* ─────────────────── núcleo reutilizado: efeito financeiro ─────────────── */

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

async function cenario({ saldoConta = 0, valor = 1000, pago = 0, marcadorCheques, falharLancamento = false } = {}) {
  const { api, col } = criarAmbiente();

  const banco = await col('Banco').create({
    name: 'BANCO TESTE', current_balance: saldoConta, [LEDGER_KEYS_FIELD]: [], active: true,
  });

  const operacao = await col('Operation').create({
    client_id: 'cli1',
    client_name: 'CLIENTE TESTE',
    numero_operacao: 77,
    total_receivable: valor,
    gross_value: valor,
    amount_paid: pago,
    balance_due: valor - pago,
    status: 'ativo',
    due_date: '2026-10-21',
    installment_schedule: [{ due_date: '2026-10-21', value: valor, number: 1, status: 'pendente' }],
  });

  const cheque = await col('Cheque').create({
    status: 'pendente',
    value: valor,
    check_number: '000123',
    client_name: 'CLIENTE TESTE',
    bank_name: 'BANCO EMISSOR',
    compensation_date: '2026-10-21',
    operation_id: operacao.id,
  });

  const cashflows = col('CashFlow');
  let falhasRestantes = falharLancamento ? 1 : 0;

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
      if (falhasRestantes > 0) {
        falhasRestantes -= 1;
        throw new Error('falha simulada ao registrar o lançamento');
      }
      const dup = await cashflows.filter({ source_type: p.source_type, source_id: p.source_id });
      if (dup.length > 0) return { status: 'duplicate', existing: dup[0] };
      return { status: 'created', cashflow: await cashflows.create({ ...p }) };
    },
    sincronizar: (opId, excluir) => sincronizarOperacao(api, opId, excluir),
    lerLancamentos: (q) => cashflows.filter(q),
  };

  const estado = () => ({
    banco: col('Banco').achar(banco.id),
    cheque: col('Cheque').achar(cheque.id),
    operacao: col('Operation').achar(operacao.id),
    cashflows: cashflows.docs.slice(),
    pagamentos: col('Payment').docs.slice(),
  });

  return { api, col, io, cheque, banco, operacao, cashflows, estado };
}

test('M6.4.8 — a baixa liquida o título com UM crédito, UM lançamento e alocação na agenda', async () => {
  const c = await cenario({ saldoConta: 0, valor: 1000 });

  const r = await compensarCheque({
    cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: DATA, io: c.io,
  });
  assert.equal(r.status, 'aplicado');

  const e = c.estado();
  assert.equal(e.banco.current_balance, 1000, 'a conta não recebeu o valor do título');
  assert.equal(e.cashflows.length, 1, 'mais de um lançamento para a mesma baixa');
  assert.equal(e.cheque.status, 'compensado');
  assert.equal(e.cheque.compensated_at, DATA);
  assert.equal(e.cheque.deposited_bank_id, c.banco.id, 'a conta do recebimento não ficou gravada');
  assert.ok(e.cheque.compensation_token, 'sem token de evento não há idempotência');

  assert.equal(e.operacao.amount_paid, 1000, 'a operação não recebeu a baixa');
  assert.equal(e.operacao.balance_due, 0);
  assert.equal(e.operacao.status, 'quitado');
  assert.equal(e.operacao.installment_schedule[0].paid, true);
  assert.equal(
    e.operacao.installment_schedule[0].settled_by,
    e.cheque.id,
    'vínculo um-a-um título→parcela perdido',
  );

  const cf = e.cashflows[0];
  assert.equal(cf.operation_id, e.operacao.id, 'lançamento sem vínculo com a operação');
  assert.equal(cf.bank_id, c.banco.id, 'lançamento sem vínculo com a conta');
  assert.equal(cf.source_type, 'cheque_compensacao');
  assert.ok(cf.source_id.startsWith(String(e.cheque.id)), 'a chave do lançamento não identifica o título');
  assert.equal(cf.amount, 1000);
});

test('M6.4.9 — duas baixas concorrentes do mesmo título: uma aplica, nenhuma duplica', async () => {
  const c = await cenario({ saldoConta: 0, valor: 1000 });

  const [a, b] = await Promise.all([
    compensarCheque({ cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: DATA, io: c.io }),
    compensarCheque({ cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: DATA, io: c.io }),
  ]);

  const aplicados = [a, b].filter((r) => r.status === 'aplicado');
  const recusados = [a, b].filter((r) => r.status === 'nao_aplicado');
  assert.equal(aplicados.length, 1, 'as duas execuções aplicaram a baixa');
  assert.equal(recusados.length, 1);
  assert.equal(recusados[0].motivo, MOTIVOS.ESTADO_JA_ALTERADO);

  const e = c.estado();
  assert.equal(e.banco.current_balance, 1000, 'a conta foi creditada mais de uma vez');
  assert.equal(e.cashflows.length, 1, 'a baixa duplicou o lançamento de caixa');
  assert.equal(e.operacao.amount_paid, 1000, 'a operação recebeu a baixa duas vezes');
});

test('M6.4.10 — repetir a baixa do mesmo título não reaplica nem recredita', async () => {
  const c = await cenario({ saldoConta: 0, valor: 1000 });

  await compensarCheque({ cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: DATA, io: c.io });
  const depois = await c.io.chequeStore.read(c.cheque.id);

  const repetida = await compensarCheque({
    cheque: depois, bankId: c.banco.id, bankName: 'BANCO TESTE', data: DATA, io: c.io,
  });
  assert.equal(repetida.status, 'nao_aplicado');
  assert.equal(repetida.motivo, MOTIVOS.ESTADO_JA_ALTERADO);

  const e = c.estado();
  assert.equal(e.banco.current_balance, 1000, 'o saldo foi creditado de novo');
  assert.equal(e.cashflows.length, 1, 'o lançamento foi duplicado');
  assert.equal(e.cheque.compensation_token, depois.compensation_token, 'a identidade do evento mudou');
});

test('M6.4.11 — falha no registro bancário: recuperação não recredita e não vira "recebido"', async () => {
  const c = await cenario({ saldoConta: 0, valor: 1000, falharLancamento: true });

  await assert.rejects(
    compensarCheque({ cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: DATA, io: c.io }),
    /falha simulada/,
  );

  const aposFalha = c.estado();
  assert.equal(aposFalha.banco.current_balance, 0, 'nada deveria ter sido creditado antes do lançamento');
  assert.equal(aposFalha.cashflows.length, 0);

  // Recuperação: cria o lançamento que faltou, sem tocar o saldo.
  const reparo = await recuperarLancamento({ cheque: c.cheque, io: c.io });
  assert.equal(reparo.status, 'reparado');

  const aposReparo = c.estado();
  assert.equal(aposReparo.cashflows.length, 1);
  assert.equal(aposReparo.banco.current_balance, 0, 'a recuperação não pode recreditar o saldo');

  // A evidência NÃO pode concluir recebimento: lançamento existe, crédito não.
  const evidencia = await inspecionarCheque({ cheque: c.cheque, io: c.io });
  assert.equal(evidencia.estado, 'lancamento_sem_saldo');
  assert.notEqual(evidencia.estado, 'completo', 'falha parcial não pode ser apresentada como recebimento');
});

test('M6.4.12 — a baixa não cria Payment nem duplica evento de caixa', async () => {
  const c = await cenario({ saldoConta: 0, valor: 1000 });
  await compensarCheque({ cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: DATA, io: c.io });

  const e = c.estado();
  assert.equal(e.pagamentos.length, 0, 'a baixa não deve criar registro em Payment');
  assert.equal(e.cashflows.length, 1);
  assert.equal(
    e.cashflows.filter((cf) => cf.source_type === 'cheque_compensacao').length,
    1,
    'o mesmo título gerou dois lançamentos',
  );
  assert.equal(e.banco[LEDGER_KEYS_FIELD].length, 1, 'a chave do crédito deveria estar gravada uma única vez');
});

test('M6.4.13 — título, operação, caixa e conta contam a mesma história', async () => {
  const c = await cenario({ saldoConta: 500, valor: 1000, pago: 250 });
  await compensarCheque({ cheque: c.cheque, bankId: c.banco.id, bankName: 'BANCO TESTE', data: DATA, io: c.io });

  const e = c.estado();
  assert.equal(e.banco.current_balance, 1500, 'o crédito não corresponde ao valor do título');
  assert.equal(e.operacao.amount_paid, 1250, 'o recebimento não foi somado ao já recebido');
  assert.equal(e.operacao.balance_due, 250, 'o saldo derivado não foi recomposto');

  const cf = e.cashflows[0];
  const chaveDoCredito = `${cf.source_type}:${cf.source_id}`;
  assert.ok(
    e.banco[LEDGER_KEYS_FIELD].includes(chaveDoCredito),
    'a chave gravada no banco não é a mesma do lançamento',
  );
  assert.ok(
    e.operacao.receipt_keys === undefined || e.operacao.receipt_keys.length === 0,
    'a baixa não deve escrever chaves de recebimento manual',
  );
});

/* ───────────────────── porta de entrada da tela ────────────────────────── */

const linhaBase = {
  id: 'cheque:ch1',
  origem: 'cheque',
  origem_label: 'Título',
  registro_id: 'ch1',
  numero: '000123',
  status_registro: 'pendente',
  vencimento: '2026-10-21',
  valor_face: 1000,
  operacao_id: 'op1',
  saldo_operacao: 1000,
  inconsistente: false,
};

test('M6.4.14 — a tela só oferece baixa para título elegível', () => {
  assert.equal(tituloElegivelParaBaixa(linhaBase).elegivel, true);

  const liquidado = tituloElegivelParaBaixa({ ...linhaBase, status_registro: 'compensado' });
  assert.equal(liquidado.elegivel, false);
  assert.match(liquidado.motivo, /já liquidado/i);

  const cancelado = tituloElegivelParaBaixa({ ...linhaBase, status_registro: 'cancelado' });
  assert.equal(cancelado.elegivel, false);

  const inconsistente = tituloElegivelParaBaixa({ ...linhaBase, inconsistente: true });
  assert.equal(inconsistente.elegivel, false);

  const semSaldo = tituloElegivelParaBaixa({ ...linhaBase, saldo_operacao: 0 });
  assert.equal(semSaldo.elegivel, false);
  assert.match(semSaldo.motivo, /sem saldo/i);

  const agenda = tituloElegivelParaBaixa({ ...linhaBase, origem: 'agenda', registro_id: 'p1' });
  assert.equal(agenda.elegivel, false);
  assert.match(agenda.motivo, /sem título|limitação/i);
});

test('M6.4.15 — o histórico da central mostra as liquidações com conta e valor', () => {
  const liquidacoes = montarLiquidacoes({
    cashflows: [
      {
        id: 'cf1',
        source_type: 'cheque_compensacao',
        source_id: 'ch1#tok',
        date: '2026-10-21',
        amount: 1000,
        bank_id: 'b1',
        operation_id: 'op1',
        description: 'Compensação cheque #000123 — CLIENTE TESTE',
      },
      {
        id: 'cf2',
        source_type: 'cheque_estorno_compensacao',
        source_id: 'ch1#tok#estorno',
        date: '2026-10-22',
        amount: 1000,
        bank_id: 'b1',
      },
    ],
    bancos: [{ id: 'b1', name: 'BANCO TESTE' }],
    cheques: [{ id: 'ch1', check_number: '000123' }],
  });

  assert.equal(liquidacoes.length, 1, 'só compensações entram como liquidação de título');
  assert.equal(liquidacoes[0].titulo, '000123');
  assert.equal(liquidacoes[0].conta, 'BANCO TESTE');
  assert.equal(liquidacoes[0].valor, 1000);
  assert.equal(liquidacoes[0].operacao_id, 'op1');
});

/* ──────────────────────── autorização e estrutura ──────────────────────── */

const ADMIN = { email: 'admin@psx.test', role: 'admin' };
const OPERADOR_CENTRAL = { email: 'op@psx.test', role: 'user', allowed_pages: [PAGINA_CONTAS_A_RECEBER] };
const OPERADOR_SEM_CENTRAL = { email: 'op2@psx.test', role: 'user', allowed_pages: ['bancos'] };

test('M6.4.16 — baixa exige a página da central e recusa anônimo', () => {
  assert.equal(autorizarMovimentacaoBancaria(ADMIN, ACOES_BANCARIAS.BAIXAR_TITULO).autorizado, true);
  assert.equal(
    autorizarMovimentacaoBancaria(OPERADOR_CENTRAL, ACOES_BANCARIAS.BAIXAR_TITULO).autorizado,
    true,
  );

  const semPagina = autorizarMovimentacaoBancaria(OPERADOR_SEM_CENTRAL, ACOES_BANCARIAS.BAIXAR_TITULO);
  assert.equal(semPagina.autorizado, false);
  assert.equal(semPagina.pagina_exigida, PAGINA_CONTAS_A_RECEBER);

  for (const usuario of [null, {}, { email: '' }, { email: 'x@psx.test', role: 'financeiro', allowed_pages: ['pagamentos'] }]) {
    assert.equal(autorizarMovimentacaoBancaria(usuario, ACOES_BANCARIAS.BAIXAR_TITULO).autorizado, false);
  }
});

test('M6.4.17 — a função autoriza antes de elevar privilégio e usa o núcleo único', () => {
  const fonte = ler('base44/functions/baixaTitulo/entry.ts');

  const posAutorizacao = fonte.indexOf('autorizarMovimentacaoBancaria(usuario, ACOES_BANCARIAS.BAIXAR_TITULO)');
  const posServico = fonte.indexOf('asServiceRole');
  assert.ok(posAutorizacao > 0, 'autorização ausente');
  assert.ok(posAutorizacao < posServico, 'elevação de privilégio antes da checagem');

  for (const proibido of ['body.role', 'body.email', 'body.permissions', 'body.allowed_pages']) {
    assert.equal(fonte.includes(proibido), false, `a função lê "${proibido}" do navegador`);
  }
  assert.equal(fonte.includes("entities.Payment.create"), false, 'a baixa não cria Payment');

  assert.match(fonte, /compensarCheque\(/, 'a baixa precisa usar o núcleo de compensação existente');
  assert.match(fonte, /avaliarBaixaTitulo\(/, 'a elegibilidade precisa ser validada no servidor');
  assert.match(fonte, /criarIoChequeEvento\(/, 'o I/O precisa ser o mesmo do evento de cheque');
});

test('M6.4.18 — o evento de cheque continua usando o mesmo I/O compartilhado', () => {
  const fonte = ler('base44/functions/chequeEvento/entry.ts');
  assert.match(fonte, /criarIoChequeEvento\(servico\)/, 'o evento de cheque deixou de usar o I/O compartilhado');
  assert.equal(
    /createChequeCashFlow|sincronizarOperacao/.test(fonte),
    false,
    'o evento de cheque voltou a montar o transporte por conta própria',
  );
});