/**
 * M7 — REPASSE AO CEDENTE E SAÍDA DA ETAPA "PAGAMENTO".
 *
 * O que cada bloco prova:
 *
 *  · FLUXO (M7.1) — a cadeia completa de etapas (nova → … → pagamento →
 *    finalizada) decidida pela REGRA REAL do workflow, com repasse aplicado no
 *    meio pelo NÚCLEO REAL (`disbursement.js`) contra um banco em memória.
 *
 *  · DUPLICIDADE (M7.2, M7.3) — o mesmo repasse pedido duas vezes, em sequência
 *    e SIMULTANEAMENTE, debita uma única vez e cria um único lançamento.
 *
 *  · AUTORIZAÇÃO (M7.4, M7.5, M7.6) — sem usuário, sem a página de Operações,
 *    sem contrato assinado e fora da etapa "pagamento" o repasse é recusado.
 *
 *  · ASSINATURA (M7.7) — o caminho próprio das operações recorrentes e a
 *    regressão das operações que continuam exigindo título e cronograma.
 *
 *  · PARIDADE (M7.9) — as cópias navegador × servidor não divergiram.
 *
 * O que NÃO está aqui: chamar a função de servidor com um usuário restrito (o
 * ambiente de build autentica como administrador) e qualquer chamada ao Asaas.
 * Nenhuma transferência real é executada: os stores são de memória.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ACOES, avaliarRepasse, avaliarTransicao } from './operationWorkflow.js';
import { chaveRepasse, metodoDoCaixa, registrarRepasse, valorDoRepasse } from './disbursement.js';
import { criarColecao } from './__fixtures__/memoryStore.js';

const AQUI = dirname(fileURLToPath(import.meta.url));

const admin = { email: 'admin@psx.test', role: 'admin', full_name: 'Admin PSX' };
const operador = { email: 'op@psx.test', role: 'user', allowed_pages: ['operacoes'], full_name: 'Operador' };
const semPagina = { email: 'sem@psx.test', role: 'user', allowed_pages: [], full_name: 'Sem Página' };

const titulo = (over = {}) => ({
  id: 't1',
  status: 'pendente',
  valor_face: 1100,
  value: 1100,
  compensation_date: '2026-12-20',
  ...over,
});

const operacao = (over = {}) => ({
  id: 'op-1',
  numero_operacao: 5,
  etapa: 'nova',
  produto: 'cheque',
  type: 'cheque',
  client_id: 'c1',
  client_name: 'CEDENTE TESTE',
  net_value: 1000,
  gross_value: 1000,
  total_receivable: 1100,
  balance_due: 1100,
  needs_contract: false,
  contract_signed_confirmed: false,
  installment_schedule: [{ id: 'p1', number: 1, value: 1100, due_date: '2026-12-20' }],
  payment_executed: false,
  ...over,
});

const contextoPadrao = {
  cliente: { id: 'c1', status: 'ativo', credit_limit: 1000000 },
  config: { block_over_limit: true, validate_cpf_cnpj: false },
  exposicao: 0,
  temContrato: true,
  temVinculoAssinatura: false,
};

/**
 * Aplica o avanço pela regra real e GRAVA a etapa no store, imitando o
 * compare-and-swap da função de servidor (a tela nunca troca etapa sozinha).
 */
async function avancar(env, op, { titulos = [titulo()], contexto = contextoPadrao, usuario = operador } = {}) {
  const decisao = avaliarTransicao({ operacao: op, titulos, contexto, usuario, acao: ACOES.AVANCAR });
  assert.equal(decisao.permitida, true, `avanço recusado em "${op.etapa}": ${decisao.motivo}`);
  const gravacao = await env.Operation.updateWhere(
    { id: op.id, etapa: op.etapa },
    { $set: { etapa: decisao.destino } },
  );
  assert.equal(gravacao.updated, 1, 'o compare-and-swap da etapa precisa vencer');
  return { ...op, etapa: decisao.destino };
}

/** Ambiente isolado: banco, extrato e operação em memória (nenhum efeito real). */
async function ambiente({ saldo = 50000, dados = {} } = {}) {
  const Banco = criarColecao('banco');
  const CashFlow = criarColecao('caixa');
  const Operation = criarColecao('operacao');
  await Banco.create({
    id: 'b1',
    name: 'Conta PSX',
    current_balance: saldo,
    applied_ledger_keys: [],
    ledger_claims: [],
  });
  const op = await Operation.create({ ...operacao(), ...dados });
  return { Banco, CashFlow, Operation, op, bancoId: 'b1' };
}

function pedidoRepasse(env, ativo, over = {}) {
  return {
    bancoStore: env.Banco,
    cashflowStore: env.CashFlow,
    operacaoStore: env.Operation,
    operacao: ativo,
    bancoId: env.bancoId,
    bancoNome: 'Conta PSX',
    data: '2026-10-20',
    referencia: 'PIX-998877',
    forma: 'pix',
    autorizadoPor: 'Assessor Teste',
    dono: admin.email,
    ...over,
  };
}

// ── M7.1 — fluxo completo ───────────────────────────────────────────────────
test('M7.1 fluxo completo: nova → análise → formalização → assinatura → pagamento → repasse → finalizada', async () => {
  const env = await ambiente({
    dados: { needs_contract: true, contract_url: 'https://contrato.test/c.pdf' },
  });
  const titulos = [titulo()];

  let op = env.op;
  op = await avancar(env, op); // nova → análise
  op = await avancar(env, op); // análise → confirmação de títulos
  op = await avancar(env, op); // confirmação → formalização
  op = await avancar(env, op); // formalização → assinatura
  await env.Operation.updateWhere({ id: op.id }, { $set: { contract_signed_confirmed: true } });
  op = { ...op, contract_signed_confirmed: true };
  op = await avancar(env, op); // assinatura → pagamento
  assert.equal(op.etapa, 'pagamento');

  // Sem repasse, "pagamento" não tem saída.
  const semRepasse = avaliarTransicao({
    operacao: op, titulos, contexto: contextoPadrao, usuario: operador, acao: ACOES.AVANCAR,
  });
  assert.equal(semRepasse.permitida, false);
  assert.match(semRepasse.motivo, /repasse/i);
  assert.equal(semRepasse.destino, undefined);

  // A regra autoriza o repasse nesta etapa, com o valor da operação.
  const decisao = avaliarRepasse({ operacao: op, usuario: operador });
  assert.equal(decisao.permitida, true);
  assert.equal(decisao.valor, 1000);

  const resultado = await registrarRepasse(pedidoRepasse(env, op));
  assert.equal(resultado.status, 'aplicado');
  assert.equal(resultado.valor, 1000);
  assert.equal(resultado.lancamento_pendente, false);

  // Efeitos reais no ambiente isolado.
  assert.equal(env.Banco.achar(env.bancoId).current_balance, 49000);
  assert.ok(env.Banco.achar(env.bancoId).applied_ledger_keys.includes(chaveRepasse(env.op.id)));
  assert.equal(env.CashFlow.docs.length, 1);
  const lancamento = env.CashFlow.docs[0];
  assert.equal(lancamento.type, 'saida');
  assert.equal(lancamento.amount, 1000);
  assert.equal(lancamento.bank_id, env.bancoId);
  assert.equal(lancamento.operation_id, env.op.id);
  assert.equal(lancamento.method, 'pix');
  assert.equal(lancamento.date, '2026-10-20');

  // A prova na operação: valor, data, conta e referência.
  const depois = env.Operation.achar(env.op.id);
  assert.equal(depois.payment_executed, true);
  assert.equal(depois.payment_execution_date, '2026-10-20');
  assert.equal(depois.disbursement_bank_id, env.bancoId);
  assert.equal(depois.disbursement_reference, 'PIX-998877');
  assert.equal(depois.status, 'repasse_concluido');
  assert.equal(depois.etapa, 'pagamento', 'o repasse não finaliza a operação por conta própria');

  // Agora sim: pagamento → finalizada, decidido pelo servidor.
  const final = avaliarTransicao({
    operacao: depois, titulos, contexto: contextoPadrao, usuario: operador, acao: ACOES.AVANCAR,
  });
  assert.equal(final.permitida, true);
  assert.equal(final.destino, 'finalizada');
});

// ── M7.2 — repetição sequencial ─────────────────────────────────────────────
test('M7.2 repasse repetido em sequência não debita nem lança de novo', async () => {
  const env = await ambiente({ dados: { etapa: 'pagamento' } });
  const ativo = env.op;

  const primeiro = await registrarRepasse(pedidoRepasse(env, ativo));
  const segundo = await registrarRepasse(pedidoRepasse(env, ativo, { data: '2026-10-21', referencia: 'OUTRA' }));

  assert.equal(primeiro.status, 'aplicado');
  assert.equal(segundo.status, 'ja_aplicado');
  assert.equal(segundo.operacao_atualizada, false, 'a prova existente não pode ser reescrita');
  assert.equal(env.Banco.achar(env.bancoId).current_balance, 49000);
  assert.equal(env.CashFlow.docs.length, 1);

  const op = env.Operation.achar(env.op.id);
  assert.equal(op.payment_execution_date, '2026-10-20');
  assert.equal(op.disbursement_reference, 'PIX-998877');
});

// ── M7.3 — tentativas simultâneas ───────────────────────────────────────────
test('M7.3 duas tentativas simultâneas de repasse debitam uma única vez', async () => {
  const env = await ambiente({ dados: { etapa: 'pagamento' } });
  const ativo = env.op;

  const [a, b] = await Promise.all([
    registrarRepasse(pedidoRepasse(env, ativo)),
    registrarRepasse(pedidoRepasse(env, ativo)),
  ]);

  assert.equal([a, b].filter((r) => r.status === 'aplicado').length, 1);
  assert.equal(env.Banco.achar(env.bancoId).current_balance, 49000);
  assert.equal(env.CashFlow.docs.length, 1, 'um único lançamento para o evento');
  assert.equal(env.Operation.achar(env.op.id).payment_executed, true);
});

// ── M7.4 — autorização ──────────────────────────────────────────────────────
test('M7.4 sem usuário, sem permissão de página e fora de pagamento o repasse é recusado', () => {
  const op = operacao({ etapa: 'pagamento' });

  assert.equal(avaliarRepasse({ operacao: op, usuario: null }).status, 401);
  assert.equal(avaliarRepasse({ operacao: op, usuario: { email: 'x@x.test', role: 'user' } }).status, 403);
  const negado = avaliarRepasse({ operacao: op, usuario: semPagina });
  assert.equal(negado.status, 403);
  assert.equal(negado.permitida, false);

  assert.equal(avaliarRepasse({ operacao: op, usuario: operador }).permitida, true);
  assert.equal(avaliarRepasse({ operacao: op, usuario: admin }).permitida, true);

  const cedoDemais = avaliarRepasse({ operacao: operacao({ etapa: 'assinatura' }), usuario: operador });
  assert.equal(cedoDemais.permitida, false);
  assert.equal(cedoDemais.status, 409);
  assert.match(cedoDemais.motivo, /pagamento/i);
});

// ── M7.5 — operação sem assinatura ──────────────────────────────────────────
test('M7.5 operação sem contrato assinado não avança nem recebe repasse', () => {
  const op = operacao({ etapa: 'pagamento', needs_contract: true, contract_signed_confirmed: false });

  const repasse = avaliarRepasse({ operacao: op, usuario: operador });
  assert.equal(repasse.permitida, false);
  assert.equal(repasse.status, 409);
  assert.match(repasse.bloqueios.join(' '), /contrato assinado/i);

  // A mesma regra impede chegar a "pagamento" sem assinatura: a cadeia fecha.
  const naAssinatura = avaliarTransicao({
    operacao: operacao({ etapa: 'assinatura', needs_contract: true, contract_signed_confirmed: false }),
    titulos: [titulo()],
    contexto: contextoPadrao,
    usuario: operador,
    acao: ACOES.AVANCAR,
  });
  assert.equal(naAssinatura.permitida, false);

  // Sem exigência de contrato, a modalidade não é bloqueada por isso.
  const semContrato = avaliarRepasse({
    operacao: operacao({ etapa: 'pagamento', needs_contract: false }), usuario: operador,
  });
  assert.equal(semContrato.permitida, true);
});

// ── M7.6 — valor vem da operação ────────────────────────────────────────────
test('M7.6 valor e forma do repasse vêm do documento da operação', () => {
  assert.equal(valorDoRepasse(operacao({ net_value: 1000, gross_value: 5000 })), 1000);
  assert.equal(valorDoRepasse({ gross_value: 5000 }), 5000);
  assert.equal(valorDoRepasse({ net_value: 0 }), 0);
  assert.equal(metodoDoCaixa('ted'), 'transferencia');
  assert.equal(metodoDoCaixa('pix'), 'pix');
  assert.equal(metodoDoCaixa(''), 'transferencia');
  assert.equal(chaveRepasse('op-abc'), 'repasse_cliente:op-abc');
});

// ── M7.7 — caminho próprio da assinatura + regressão dos títulos ────────────
test('M7.7 assinatura passa em confirmação de títulos com antecipação e assinante; título continua exigido nos demais', () => {
  const assinatura = operacao({
    etapa: 'confirmacao_titulos',
    produto: 'assinatura',
    type: 'assinatura',
    valor_antecipacao: 500,
    installments: 2,
    installment_schedule: [],
    net_value: 500,
  });

  const semVinculo = avaliarTransicao({
    operacao: assinatura, titulos: [], contexto: contextoPadrao, usuario: operador, acao: ACOES.AVANCAR,
  });
  assert.equal(semVinculo.permitida, false);
  assert.match(semVinculo.bloqueios.join(' '), /assinante/i);

  const comVinculo = avaliarTransicao({
    operacao: assinatura,
    titulos: [],
    contexto: { ...contextoPadrao, temVinculoAssinatura: true },
    usuario: operador,
    acao: ACOES.AVANCAR,
  });
  assert.equal(comVinculo.permitida, true);
  assert.equal(comVinculo.destino, 'formalizacao');

  // Assinatura sem valor antecipado continua travada (regra do próprio wizard).
  const semValor = avaliarTransicao({
    operacao: { ...assinatura, valor_antecipacao: 0 },
    titulos: [],
    contexto: { ...contextoPadrao, temVinculoAssinatura: true },
    usuario: operador,
    acao: ACOES.AVANCAR,
  });
  assert.equal(semValor.permitida, false);
  assert.match(semValor.bloqueios.join(' '), /antecipação/i);

  // A assinatura também sai da criação sem título.
  const naCriacao = avaliarTransicao({
    operacao: { ...assinatura, etapa: 'nova' },
    titulos: [],
    contexto: contextoPadrao,
    usuario: operador,
    acao: ACOES.AVANCAR,
  });
  assert.equal(naCriacao.permitida, true);

  // Regressão: operação de cheque segue exigindo título e cronograma.
  const chequeSemTitulo = avaliarTransicao({
    operacao: operacao({ etapa: 'confirmacao_titulos' }), titulos: [], contexto: contextoPadrao, usuario: operador, acao: ACOES.AVANCAR,
  });
  assert.equal(chequeSemTitulo.permitida, false);
  assert.match(chequeSemTitulo.bloqueios.join(' '), /títulos/i);

  const chequeSemAgenda = avaliarTransicao({
    operacao: operacao({ etapa: 'confirmacao_titulos', installment_schedule: [] }),
    titulos: [titulo()],
    contexto: contextoPadrao,
    usuario: operador,
    acao: ACOES.AVANCAR,
  });
  assert.equal(chequeSemAgenda.permitida, false);
  assert.match(chequeSemAgenda.bloqueios.join(' '), /agenda/i);
});

// ── M7.8 — a execução não autoriza por conta própria ────────────────────────
test('M7.8 a função de repasse consulta a regra do workflow e não atualiza etapa', () => {
  const fonte = readFileSync(join(AQUI, '../../base44/functions/executeOperationDisbursement/entry.ts'), 'utf8');
  assert.match(fonte, /avaliarRepasse\(/);
  assert.match(fonte, /registrarRepasse\(/);
  assert.doesNotMatch(fonte, /etapa:\s*'/, 'o repasse não grava etapa');
  assert.doesNotMatch(fonte, /asaas/i, 'o repasse não fala com o Asaas');
});

// ── M7.9 — paridade das cópias ──────────────────────────────────────────────
test('M7.9 cópias de operationWorkflow e disbursement são idênticas entre navegador e servidor', () => {
  const wfNavegador = readFileSync(join(AQUI, 'operationWorkflow.js'), 'utf8');
  const wfServidor = readFileSync(join(AQUI, '../../base44/shared/operationWorkflow.js'), 'utf8');
  assert.equal(wfServidor, wfNavegador);

  const normalizar = (texto) => texto.replace("from './bankLedger.ts'", "from './bankLedger.js'");
  const dNavegador = readFileSync(join(AQUI, 'disbursement.js'), 'utf8');
  const dServidor = readFileSync(join(AQUI, '../../base44/shared/disbursement.js'), 'utf8');
  assert.equal(normalizar(dServidor), normalizar(dNavegador));
});