/**
 * M6.3 — FASES 0 e 1: PROTEÇÃO DO SALDO BANCÁRIO.
 *
 * O que cada bloco prova, e o que NÃO prova:
 *
 *  · CADASTRO ≠ SALDO (M6.3.1–M6.3.3) — executado de verdade sobre o construtor
 *    de payload; mais a checagem estrutural de que nenhuma tela envia saldo.
 *    Prova a REGRA do formulário, não a escrita na plataforma.
 *
 *  · AJUSTE DE SALDO (M6.3.4–M6.3.7) — executado contra o MESMO módulo que a
 *    função de servidor importa, com o simulador de plataforma (inclusive
 *    concorrência real: o `updateWhere` do simulador cede o controle antes de
 *    mutar). Prova idempotência, concorrência e validação.
 *
 *  · AUTORIZAÇÃO (M6.3.8, M6.3.9) — executada sobre a política pura e conferida
 *    estruturalmente no despacho da função. Prova a DECISÃO; não chama a função
 *    com uma segunda identidade (o ambiente autentica como admin — ver D3.1.8).
 *
 *  · EXCLUSÃO (M6.3.10) — regra pura de histórico; a leitura das evidências é
 *    feita pelo servidor (asserção estrutural).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  chaveAjusteSaldo,
  validarAjuste,
  avaliarExclusaoConta,
  registrarMovimento,
  diagnosticarMovimento,
  eventoTemSaldo,
  TIPOS,
} from './bankMovement.js';
import { LEDGER_KEYS_FIELD, CLAIMS_FIELD, applyBankDelta } from './bankLedger.js';
import { autorizarMovimentacaoBancaria, ACOES_BANCARIAS } from './bankAuthorization.js';
import { montarPayloadCadastro } from './bancoCadastro.js';
import { criarColecao } from './__fixtures__/memoryStore.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (p) => readFileSync(join(AQUI, p), 'utf8');

const ADMIN = { id: 'u-admin', email: 'admin@psx.test', role: 'admin' };
const OPERADOR = { id: 'u-op', email: 'operador@psx.test', role: 'user', allowed_pages: ['bancos'] };
const SEM_PAPEL = { id: 'u-x', email: 'x@psx.test', role: 'financeiro', allowed_pages: ['bancos'] };

/** Conta de teste com o simulador de plataforma (saldo e chaves de evento). */
function cenario(saldoInicial = 1000) {
  const bancos = criarColecao('banco');
  const cashflows = criarColecao('cf');

  bancos.docs.push({
    id: 'b1',
    name: 'BANCO UM',
    current_balance: saldoInicial,
    [LEDGER_KEYS_FIELD]: [],
    [CLAIMS_FIELD]: [],
  });

  const bancoStore = {
    updateWhere: (q, u) => bancos.updateWhere(q, u),
    get: (id) => bancos.achar(id),
  };
  const cashflowStore = {
    create: (d) => cashflows.create(d),
    filter: (q) => cashflows.filter(q),
  };

  return { bancos, cashflows, bancoStore, cashflowStore };
}

const lancamentoAjuste = (over = {}) => ({
  type: TIPOS.ENTRADA,
  category: 'ajuste_saldo',
  amount: 100,
  date: '2026-10-21',
  description: '[Ajuste de Saldo] BANCO UM — teste',
  method: 'outro',
  bank_id: 'b1',
  ...over,
});

async function aplicarAjuste({ bancoStore, cashflowStore }, { eventId, valor, tipo = TIPOS.ENTRADA }) {
  return registrarMovimento({
    bancoStore,
    cashflowStore,
    bankId: 'b1',
    delta: tipo === TIPOS.ENTRADA ? valor : -valor,
    eventKey: chaveAjusteSaldo(eventId),
    lancamento: lancamentoAjuste({ type: tipo, amount: valor }),
  });
}

/* ══════════════ 1. cadastro e saldo deixaram de ser a mesma coisa ══════════ */

test('M6.3.1 — edição cadastral NÃO carrega saldo: o saldo atual é preservado', () => {
  const existente = {
    id: 'b1',
    name: 'BANCO ANTIGO',
    agency: '0001',
    current_balance: 4321.55,
    applied_ledger_keys: ['transfer:x:saida'],
  };

  const payload = montarPayloadCadastro({
    form: { name: 'BANCO NOVO', agency: '0002', initial_balance: '999', current_balance: '0' },
    existente,
  });

  assert.equal(payload.id, 'b1');
  assert.equal(payload.name, 'BANCO NOVO');
  assert.equal(payload.agency, '0002');
  assert.equal(
    Object.prototype.hasOwnProperty.call(payload, 'current_balance'),
    false,
    'o payload de edição voltou a carregar current_balance: sobrescreveria o saldo',
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(payload, 'initial_balance'),
    false,
    'saldo inicial não se reescreve em edição',
  );
  // O documento existente não é tocado pela construção do payload.
  assert.equal(existente.current_balance, 4321.55);
});

test('M6.3.2 — criação nasce com saldo inicial; ajustes posteriores são eventos', () => {
  const novo = montarPayloadCadastro({
    form: { name: 'BANCO NOVO', initial_balance: '2500.40', current_balance: '0' },
    existente: null,
  });

  assert.equal(novo.initial_balance, 2500.4);
  assert.equal(novo.current_balance, 2500.4, 'a conta precisa nascer com o saldo inicial declarado');
  assert.equal(novo.id, undefined);

  // Sem saldo inicial informado, nasce zerada — nunca herda valor de outro campo.
  const semSaldo = montarPayloadCadastro({ form: { name: 'ZERADA' }, existente: null });
  assert.equal(semSaldo.current_balance, 0);
  assert.equal(semSaldo.initial_balance, 0);

  // Valor inválido não vira NaN no documento.
  const invalido = montarPayloadCadastro({ form: { name: 'X', initial_balance: 'abc' }, existente: null });
  assert.equal(invalido.current_balance, 0);
});

test('M6.3.3 — nenhuma tela escreve saldo: cadastro separado, exclusão pelo servidor', () => {
  const form = ler('../components/bancos/BancoFormModal.jsx');
  assert.equal(form.includes('current_balance'), false, 'o formulário de cadastro voltou a tocar no saldo');
  assert.match(form, /montarPayloadCadastro/, 'o formulário precisa usar o construtor de cadastro');

  const ajuste = ler('../components/bancos/AjusteSaldoModal.jsx');
  assert.match(ajuste, /ajustarSaldoConta/, 'o ajuste precisa passar pelo servidor');
  for (const proibido of ['entities.Banco.update', 'entities.Banco.create', 'applyBankDelta', 'entities.Banco.delete']) {
    assert.equal(ajuste.includes(proibido), false, `a tela de ajuste escreve direto: ${proibido}`);
  }

  const pagina = ler('../pages/Bancos.jsx');
  assert.match(pagina, /excluirContaBancaria/, 'a exclusão precisa passar pelo servidor');
  assert.equal(
    pagina.includes('entities.Banco.delete'),
    false,
    'a página voltou a apagar a conta pelo navegador',
  );
});

/* ══════════════════════ 2. ajuste de saldo é um EVENTO ═════════════════════ */

test('M6.3.4 — um ajuste autorizado move o saldo uma única vez e gera um lançamento', async () => {
  const c = cenario(1000);

  const res = await aplicarAjuste(c, { eventId: 'aj-1', valor: 150 });

  assert.equal(res.status, 'aplicado');
  assert.equal(res.lancamento_criado, true);
  assert.equal(c.bancos.achar('b1').current_balance, 1150);
  assert.equal(c.cashflows.docs.length, 1);
  assert.equal(c.cashflows.docs[0].source_type, 'ajuste_saldo');
  assert.equal(c.cashflows.docs[0].source_id, 'ajuste_saldo:aj-1');
  assert.equal(c.cashflows.docs[0].bank_id, 'b1');
  assert.deepEqual(c.bancos.achar('b1')[LEDGER_KEYS_FIELD], ['ajuste_saldo:aj-1']);

  // Débito segue a mesma regra, com sinal negativo.
  const debito = await aplicarAjuste(c, { eventId: 'aj-2', valor: 250, tipo: TIPOS.SAIDA });
  assert.equal(debito.status, 'aplicado');
  assert.equal(c.bancos.achar('b1').current_balance, 900);
});

test('M6.3.5 — repetir a MESMA chave não duplica o ajuste', async () => {
  const c = cenario(1000);

  const primeira = await aplicarAjuste(c, { eventId: 'aj-repetido', valor: 400 });
  assert.equal(primeira.status, 'aplicado');

  for (let i = 0; i < 3; i += 1) {
    const repetida = await aplicarAjuste(c, { eventId: 'aj-repetido', valor: 400 });
    assert.equal(repetida.status, 'ja_aplicado');
    assert.equal(repetida.lancamento_criado, false);
  }

  assert.equal(c.bancos.achar('b1').current_balance, 1400, 'o saldo foi somado mais de uma vez');
  assert.equal(c.cashflows.docs.length, 1, 'o ajuste gerou mais de um lançamento');
});

test('M6.3.6 — chaves distintas e concorrentes preservam a soma dos valores', async () => {
  const c = cenario(1000);

  const resultados = await Promise.all([
    aplicarAjuste(c, { eventId: 'conc-a', valor: 250 }),
    aplicarAjuste(c, { eventId: 'conc-b', valor: 300 }),
    aplicarAjuste(c, { eventId: 'conc-c', valor: 80, tipo: TIPOS.SAIDA }),
  ]);

  assert.deepEqual(resultados.map((r) => r.status), ['aplicado', 'aplicado', 'aplicado']);
  assert.equal(c.bancos.achar('b1').current_balance, 1470, 'perda de atualização sob concorrência');
  assert.equal(c.cashflows.docs.length, 3);
  assert.deepEqual(
    c.bancos.achar('b1')[LEDGER_KEYS_FIELD].slice().sort(),
    ['ajuste_saldo:conc-a', 'ajuste_saldo:conc-b', 'ajuste_saldo:conc-c'],
  );
});

test('M6.3.7 — valor inválido e chave ausente são recusados', async () => {
  // Regra de valor, aplicada no SERVIDOR (a tela pode ser contornada).
  assert.equal(validarAjuste({ tipo: 'entrada', valor: 10, motivo: 'correção de saldo', data: '2026-10-21' }), null);
  assert.match(validarAjuste({ tipo: 'entrada', valor: 0, motivo: 'correção de saldo', data: '2026-10-21' }), /maior que zero/);
  assert.match(validarAjuste({ tipo: 'entrada', valor: -5, motivo: 'correção de saldo', data: '2026-10-21' }), /maior que zero/);
  assert.match(validarAjuste({ tipo: 'entrada', valor: NaN, motivo: 'correção de saldo', data: '2026-10-21' }), /maior que zero/);
  assert.match(validarAjuste({ tipo: 'ajuste', valor: 10, motivo: 'correção de saldo', data: '2026-10-21' }), /Tipo/);
  assert.match(validarAjuste({ tipo: 'entrada', valor: 10, motivo: '', data: '2026-10-21' }), /motivo/);
  assert.match(validarAjuste({ tipo: 'entrada', valor: 10, motivo: 'correção de saldo', data: 'data-ruim' }), /Data/);

  // Sem chave de evento não existe idempotência: o razão se recusa a aplicar.
  const c = cenario(1000);
  await assert.rejects(
    () => applyBankDelta({ store: c.bancoStore, bankId: 'b1', delta: 100, eventKey: '' }),
    /eventKey/,
  );
  assert.equal(c.bancos.achar('b1').current_balance, 1000, 'recusa não pode mexer no saldo');

  // E a função de servidor valida ANTES de aplicar qualquer coisa.
  const fonte = ler('../../base44/functions/eventoBancario/entry.ts');
  const ajuste = fonte.slice(fonte.indexOf("operacao === 'ajuste_saldo'"), fonte.indexOf("operacao === 'excluir_conta'"));
  assert.ok(ajuste.indexOf('validarAjuste(') > 0, 'o ajuste não é validado no servidor');
  assert.ok(ajuste.indexOf('idDeEventoValido(') > 0, 'a chave do evento não é validada');
  assert.ok(ajuste.indexOf('idDeEventoValido(') < ajuste.indexOf('registrarMovimento('), 'aplicou antes de validar a chave');
  assert.ok(ajuste.indexOf('validarAjuste(') < ajuste.indexOf('registrarMovimento('), 'aplicou antes de validar o valor');
});

test('M6.3.8 — perfil não autorizado é recusado pela política do servidor', () => {
  assert.equal(autorizarMovimentacaoBancaria(ADMIN, ACOES_BANCARIAS.AJUSTAR_SALDO).autorizado, true);

  for (const usuario of [OPERADOR, SEM_PAPEL, null, undefined, {}]) {
    const decisao = autorizarMovimentacaoBancaria(usuario, ACOES_BANCARIAS.AJUSTAR_SALDO);
    assert.equal(decisao.autorizado, false, `ajuste autorizado para ${usuario ? usuario.role : 'anônimo'}`);
  }
  assert.equal(autorizarMovimentacaoBancaria(OPERADOR, ACOES_BANCARIAS.AJUSTAR_SALDO).exige_admin, true);

  // A recusa precisa vir da POLÍTICA, não de validação de campos: a ação é
  // administrativa mesmo com todos os dados corretos.
  const adminComDadosValidos = autorizarMovimentacaoBancaria(ADMIN, ACOES_BANCARIAS.AJUSTAR_SALDO);
  const operadorComDadosValidos = autorizarMovimentacaoBancaria(OPERADOR, ACOES_BANCARIAS.AJUSTAR_SALDO);
  assert.equal(adminComDadosValidos.autorizado, true);
  assert.equal(operadorComDadosValidos.autorizado, false);
  assert.match(operadorComDadosValidos.motivo, /administrador/i);

  // O despacho do servidor mapeia a operação para essa ação.
  const fonte = ler('../../base44/functions/eventoBancario/entry.ts');
  assert.match(fonte, /ajuste_saldo:\s*ACOES_BANCARIAS\.AJUSTAR_SALDO/);
  assert.match(fonte, /excluir_conta:\s*ACOES_BANCARIAS\.EXCLUIR_CONTA/);
});

/* ═══════════════════ 3. exclusão de conta com histórico ════════════════════ */

test('M6.3.10 — conta com qualquer movimentação NÃO pode ser excluída', () => {
  const vazia = { id: 'b1', name: 'LIMPA', [LEDGER_KEYS_FIELD]: [], [CLAIMS_FIELD]: [] };
  assert.equal(avaliarExclusaoConta({ banco: vazia }).permitido, true);

  // Cada natureza de histórico, isolada, já impede a exclusão.
  const casos = {
    'evento de saldo': { banco: { ...vazia, [LEDGER_KEYS_FIELD]: ['ajuste_saldo:x'] } },
    'reivindicação pendente': { banco: { ...vazia, [CLAIMS_FIELD]: ['claim:remessa_banco:y'] } },
    'lançamento no extrato': { banco: vazia, lancamentos: [{ id: 'cf-1', bank_id: 'b1' }] },
    'cheque depositado': { banco: vazia, cheques: [{ id: 'ch-1', deposited_bank_id: 'b1' }] },
    'transferência': { banco: vazia, transferencias: [{ id: 'tr-1', from_bank_id: 'b1' }] },
  };

  for (const [nome, entrada] of Object.entries(casos)) {
    const veredito = avaliarExclusaoConta(entrada);
    assert.equal(veredito.permitido, false, `exclusão permitida apesar de ${nome}`);
    assert.match(veredito.motivo, /não pode ser excluída/);
    assert.match(veredito.motivo, /arquivar/i, 'a recusa precisa indicar a alternativa (arquivar)');
  }

  assert.equal(avaliarExclusaoConta({}).permitido, false, 'conta inexistente não é excluível');

  // O servidor consulta o histórico ANTES de apagar; a decisão é dele.
  const fonte = ler('../../base44/functions/eventoBancario/entry.ts');
  const trecho = fonte.slice(fonte.indexOf("operacao === 'excluir_conta'"));
  assert.ok(trecho.indexOf('avaliarExclusaoConta(') < trecho.indexOf('entities.Banco.delete('), 'apagou antes de conferir o histórico');
  assert.match(trecho, /falha\(veredito\.motivo, 409\)/, 'recusa de exclusão precisa ser 409, não 500');
});

test('M6.3.11 — o ajuste é evento COM saldo: falha parcial é detectada, nunca reaplicada', async () => {
  assert.equal(eventoTemSaldo('ajuste_saldo:x'), true);

  const c = cenario(1000);
  const eventKey = chaveAjusteSaldo('aj-parcial');

  // Processo morre DEPOIS do incremento: só o saldo foi aplicado.
  await applyBankDelta({ store: c.bancoStore, bankId: 'b1', delta: 90, eventKey });

  const diag = await diagnosticarMovimento({
    bancoStore: c.bancoStore,
    cashflowStore: c.cashflowStore,
    bankId: 'b1',
    eventKey,
  });
  assert.equal(diag.estado, 'saldo_sem_lancamento', 'a divergência precisa ser apontada');

  // Nova tentativa do MESMO evento não recredita nem cria lançamento sozinha.
  const retry = await aplicarAjuste(c, { eventId: 'aj-parcial', valor: 90 });
  assert.equal(retry.status, 'ja_aplicado');
  assert.equal(c.bancos.achar('b1').current_balance, 1090);
  assert.equal(c.cashflows.docs.length, 0);
});