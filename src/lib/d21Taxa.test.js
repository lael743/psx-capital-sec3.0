/**
 * M2.1 — RECUPERAÇÃO DA TAXA DE DEVOLUÇÃO.
 *
 * Exercita o código REAL de `chequeEventFlow.js` contra o simulador de
 * plataforma. Nada de rede, nada de dado real, nenhuma chamada ao Asaas.
 *
 * Os cenários reproduzem EXATAMENTE as janelas em que um processo morre:
 *   · entre o compare-and-swap do cheque e o incremento da operação
 *   · entre a reivindicação do recebimento e o crédito bancário
 *   · entre o crédito e o lançamento de caixa
 *   · entre o crédito e o espelho de `taxa_recebida`
 * Cada um tem uma única retomada segura — ou nenhuma.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  resolverChequeDevolvido,
  receberTaxaDevolucao,
  recuperarTaxaDevolucao,
  inspecionarTaxa,
  inspecionarResolucao,
} from './chequeEventFlow.js';
import {
  ESTADOS_TAXA,
  taxaDevolucaoEventKey,
  taxaIncorporadaEventKey,
} from './chequeCore.js';
import { LEDGER_KEYS_FIELD } from './bankLedger.js';
import { criarColecao } from './__fixtures__/memoryStore.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const ler = (rel) => readFileSync(join(RAIZ, rel), 'utf8');

const CHAVE_TAXA = taxaDevolucaoEventKey('ch1');
const CHAVE_INCORPORADA = taxaIncorporadaEventKey('resolucao_cheque:ch1');

/* ───────────────────────────── ambiente simulado ─────────────────────────── */

function ambiente({ valor = 1000, total = 1000, pago = 0, saldoBanco = 0 } = {}) {
  const cheques = criarColecao('Cheque');
  const operacoes = criarColecao('Operation');
  const bancos = criarColecao('Banco');
  const cashflows = criarColecao('CashFlow');

  cheques.docs.push({
    id: 'ch1',
    status: 'devolvido',
    value: valor,
    valor_face: valor,
    check_number: '000123',
    client_name: 'CLIENTE TESTE',
    bank_name: 'EMISSOR',
    compensation_date: '2026-03-10',
    operation_id: 'op1',
    client_id: 'cli1',
  });
  operacoes.docs.push({
    id: 'op1',
    client_id: 'cli1',
    total_receivable: total,
    amount_paid: pago,
    balance_due: Math.max(0, total - pago),
    status: 'ativo',
    due_date: '2026-03-10',
  });
  bancos.docs.push({ id: 'b1', name: 'BANCO TESTE', current_balance: saldoBanco, [LEDGER_KEYS_FIELD]: [] });

  const recalcular = async () => {
    const op = operacoes.achar('op1');
    if (!op) return;
    const saldo = Math.max(0, (Number(op.total_receivable) || 0) - (Number(op.amount_paid) || 0));
    const quitado = saldo <= 0.01 && (Number(op.total_receivable) || 0) > 0;
    await operacoes.updateWhere({ id: 'op1' }, { $set: { balance_due: saldo, status: quitado ? 'quitado' : op.status } });
  };

  const io = {
    chequeStore: {
      updateWhere: (q, u) => cheques.updateWhere(q, u),
      read: async (id) => {
        const d = cheques.achar(id);
        return d ? { ...d } : null;
      },
    },
    bancoStore: {
      updateWhere: (q, u) => bancos.updateWhere(q, u),
      get: async (id) => {
        const d = bancos.achar(id);
        return d ? { ...d } : null;
      },
    },
    criarLancamento: async (p) => {
      const dup = await cashflows.filter({ source_type: p.source_type, source_id: p.source_id });
      if (dup.length > 0) return { status: 'duplicate', existing: dup[0] };
      return { status: 'created', cashflow: await cashflows.create(p) };
    },
    lerLancamentos: (q) => cashflows.filter(q || {}),
    getOperacao: async (id) => {
      const d = operacoes.achar(id);
      return d ? { ...d } : null;
    },
    // Espelha o CAS da função de servidor: $inc + chave na MESMA escrita.
    ajustarTotalReceivable: async (id, delta, chave) => {
      const res = await operacoes.updateWhere(
        { id, taxa_incorporada_eventos: { $ne: chave } },
        { $inc: { total_receivable: delta }, $push: { taxa_incorporada_eventos: chave } }
      );
      const aplicado = (Number(res && res.updated) || 0) > 0;
      if (aplicado) await recalcular();
      return { aplicado };
    },
    registrarRecebimento: async (id, delta) => {
      await operacoes.updateWhere({ id }, { $inc: { amount_paid: delta } });
      await recalcular();
    },
    marcarTaxaRecebida: async (id, taxa, chave) => {
      const r = await cheques.updateWhere(
        { id, taxa_eventos: { $ne: chave } },
        { $inc: { taxa_recebida: taxa }, $push: { taxa_eventos: chave } }
      );
      return (Number(r && r.updated) || 0) > 0;
    },
    lerCheques: (q) => cheques.filter(q),
    criarCheque: (doc) => cheques.create(doc),
  };

  return {
    cheques,
    operacoes,
    bancos,
    cashflows,
    io,
    cheque: () => cheques.achar('ch1'),
    op: () => operacoes.achar('op1'),
    banco: () => bancos.achar('b1'),
  };
}

const pagamento = (extra = {}) => ({
  modalidade: 'pagamento',
  data: '2026-03-12',
  taxaPercentual: 5,
  taxaIncorporada: true,
  bankId: 'b1',
  bankName: 'BANCO TESTE',
  metodo: 'pix',
  ...extra,
});

/** Deixa o cheque exatamente como ficaria uma resolução interrompida. */
function comoInterrompida(a, { incorporada = true } = {}) {
  const c = a.cheque();
  c.status = 'resolvido_pago';
  c.resolvido_em = '2026-03-12';
  c.resolucao_evento = 'resolucao_cheque:ch1';
  c.taxa_devolucao = 50;
  c.taxa_base_valor = 1000;
  c.taxa_percentual = 5;
  c.taxa_incorporada = incorporada;
  c.taxa_aplicada = false;
  c.taxa_recebida = 0;
  if (incorporada) c.taxa_incorporada_evento = CHAVE_INCORPORADA;
  return c;
}

/* ═════════════ 1. a intenção registrada e a prova de aplicação ════════════ */

test('T1.1 — resolver registra a intenção e só marca taxa_aplicada com prova', async () => {
  const a = ambiente();
  const r = await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });
  assert.equal(r.status, 'aplicado');

  const c = a.cheque();
  assert.equal(c.taxa_incorporada_evento, CHAVE_INCORPORADA, 'a chave da incorporação não foi registrada');
  assert.equal(c.taxa_aplicada, true, 'a flag deveria espelhar o incremento comprovado');
  assert.equal(a.op().total_receivable, 1050);
  assert.deepEqual(a.op().taxa_incorporada_eventos, [CHAVE_INCORPORADA], 'a prova do incremento não está na operação');
});

test('T1.2 — processo morto antes do incremento deixa PENDENTE, não concluído', async () => {
  const a = ambiente();
  a.io.ajustarTotalReceivable = async () => ({ aplicado: false }); // morre antes de escrever

  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });

  assert.equal(a.op().total_receivable, 1000, 'nada deveria ter entrado na obrigação');
  assert.equal(a.cheque().taxa_aplicada, false, 'a flag não pode afirmar o que não aconteceu');

  const diag = await inspecionarTaxa({ cheque: a.cheque(), io: a.io });
  assert.equal(diag.estado, ESTADOS_TAXA.INCORPORADA_PENDENTE);
  assert.equal(diag.acao, 'retomar_incremento');
  assert.equal(diag.divergencias.length, 0, 'pendente não é divergência');
});

test('T1.3 — a recuperação aplica a taxa UMA vez e é repetível sem efeito', async () => {
  const a = ambiente();
  a.io.ajustarTotalReceivable = async () => ({ aplicado: false });
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });

  const rec = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'taxa_incorporada');
  assert.equal(a.op().total_receivable, 1050);
  assert.equal(a.cheque().taxa_aplicada, true);

  const rec2 = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec2.status, 'sem_acao');
  assert.equal(a.op().total_receivable, 1050, 'a taxa não pode ser somada duas vezes');
  assert.deepEqual(a.op().taxa_incorporada_eventos, [CHAVE_INCORPORADA]);
});

test('T1.4 — chave na operação sem flag: só espelha, nenhum valor se move', async () => {
  const a = ambiente();
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });
  a.cheque().taxa_aplicada = false; // morreu entre o $inc e o espelho

  const diag = await inspecionarTaxa({ cheque: a.cheque(), io: a.io });
  assert.equal(diag.estado, ESTADOS_TAXA.INCORPORADA_CONCLUIDA);
  assert.equal(diag.acao, 'espelhar_flag');

  const rec = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'espelho_corrigido');
  assert.equal(a.cheque().taxa_aplicada, true);
  assert.equal(a.op().total_receivable, 1050, 'o espelho não pode movimentar a obrigação');
});

test('T1.5 — flag ligada sem chave (legado) é AMBÍGUA e nunca reaplica', async () => {
  const a = ambiente();
  const c = comoInterrompida(a);
  c.taxa_aplicada = true;
  delete c.taxa_incorporada_evento;

  const diag = await inspecionarTaxa({ cheque: c, io: a.io });
  assert.equal(diag.estado, ESTADOS_TAXA.INCORPORADA_AMBIGUA);
  assert.equal(diag.acao, 'nenhuma');
  assert.ok(diag.divergencias.includes('flag_sem_prova'));

  const rec = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'requer_intervencao');
  assert.equal(a.op().total_receivable, 1000, 'estado ambíguo não pode movimentar a obrigação');
  assert.equal(a.op().taxa_incorporada_eventos, undefined);
});

test('T1.6 — operação ilegível também é ambígua (ausência de prova ≠ prova de ausência)', async () => {
  const a = ambiente();
  comoInterrompida(a);
  a.io.getOperacao = async () => null;

  const diag = await inspecionarTaxa({ cheque: a.cheque(), io: a.io });
  assert.equal(diag.estado, ESTADOS_TAXA.INCORPORADA_AMBIGUA);
  assert.equal(diag.acao, 'nenhuma');
  assert.ok(diag.divergencias.includes('operacao_nao_conferida'));

  const rec = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'requer_intervencao');
});

/* ═══════════ 2. taxa SEPARADA: janelas entre reivindicar e receber ════════ */

test('T2.1 — reivindicação sem nenhum efeito é liberada para nova tentativa', async () => {
  const a = ambiente();
  const c = comoInterrompida(a, { incorporada: false });
  c.taxa_eventos = [CHAVE_TAXA];
  c.taxa_bank_id = 'b1';

  const diag = await inspecionarTaxa({ cheque: c, io: a.io });
  assert.equal(diag.estado, ESTADOS_TAXA.SEPARADA_NADA_APLICADO);

  const rec = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'reivindicacao_liberada');
  assert.deepEqual(a.cheque().taxa_eventos, [], 'a reivindicação órfã deveria sair');
  assert.equal(a.banco().current_balance, 0, 'liberar reivindicação não credita nada');
  assert.equal(a.cashflows.docs.length, 0);

  // Agora o operador pode repetir — e o valor entra UMA vez.
  const r = await receberTaxaDevolucao({ cheque: a.cheque(), bankId: 'b1', bankName: 'BANCO TESTE', data: '2026-03-13', io: a.io });
  assert.equal(r.status, 'aplicado');
  assert.equal(a.banco().current_balance, 50);
  assert.equal(a.cheque().taxa_recebida, 50);
  assert.equal(a.cashflows.docs.length, 1);
});

test('T2.2 — crédito aplicado sem lançamento: recria SÓ o lançamento', async () => {
  const a = ambiente({ saldoBanco: 50 });
  const c = comoInterrompida(a, { incorporada: false });
  c.taxa_eventos = [CHAVE_TAXA];
  c.taxa_bank_id = 'b1';
  c.taxa_recebida = 50;
  a.banco()[LEDGER_KEYS_FIELD] = [CHAVE_TAXA];

  const rec = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'lancamento_reparado');
  assert.equal(a.cashflows.docs.length, 1);
  assert.equal(a.cashflows.docs[0].source_id, CHAVE_TAXA);
  assert.equal(a.banco().current_balance, 50, 'o saldo não pode ser creditado de novo');
  assert.deepEqual(a.banco()[LEDGER_KEYS_FIELD], [CHAVE_TAXA]);
});

test('T2.3 — lançamento sem crédito é ambíguo: intervenção, sem crédito automático', async () => {
  const a = ambiente();
  const c = comoInterrompida(a, { incorporada: false });
  c.taxa_eventos = [CHAVE_TAXA];
  c.taxa_bank_id = 'b1';
  await a.cashflows.create({
    source_type: 'taxa_devolucao_cheque',
    source_id: CHAVE_TAXA,
    category: 'taxa_devolucao_cheque',
    type: 'entrada',
    amount: 50,
    date: '2026-03-12',
  });

  const diag = await inspecionarTaxa({ cheque: c, io: a.io });
  assert.equal(diag.estado, ESTADOS_TAXA.SEPARADA_LANCAMENTO_SEM_SALDO);
  assert.ok(diag.divergencias.includes('lancamento_sem_credito'));

  const rec = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'requer_intervencao');
  assert.equal(a.banco().current_balance, 0);
  assert.equal(a.cashflows.docs.length, 1, 'não pode criar lançamento compensatório');
});

test('T2.4 — efeitos completos com taxa_recebida atrás: corrige só o espelho', async () => {
  const a = ambiente({ saldoBanco: 50 });
  const c = comoInterrompida(a, { incorporada: false });
  c.taxa_eventos = [CHAVE_TAXA];
  c.taxa_bank_id = 'b1';
  a.banco()[LEDGER_KEYS_FIELD] = [CHAVE_TAXA];
  await a.cashflows.create({
    source_type: 'taxa_devolucao_cheque',
    source_id: CHAVE_TAXA,
    category: 'taxa_devolucao_cheque',
    type: 'entrada',
    amount: 50,
    date: '2026-03-12',
  });

  const rec = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'recebida_corrigida');
  assert.equal(a.cheque().taxa_recebida, 50);
  assert.equal(a.banco().current_balance, 50);
  assert.equal(a.cashflows.docs.length, 1);

  const rec2 = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec2.status, 'sem_acao');
  assert.equal(a.cheque().taxa_recebida, 50);
});

test('T2.5 — sem cobrança registrada não há nada a recuperar', async () => {
  const a = ambiente();
  const c = comoInterrompida(a, { incorporada: false });
  const diag = await inspecionarTaxa({ cheque: c, io: a.io });
  assert.equal(diag.estado, ESTADOS_TAXA.SEPARADA_NAO_COBRADA);

  const rec = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'sem_acao');
  assert.equal(a.banco().current_balance, 0);
  assert.equal(a.cashflows.docs.length, 0);
});

test('T2.6 — contradição (recebida > 0 sem crédito nem lançamento) não é "nada aplicado"', async () => {
  const a = ambiente();
  const c = comoInterrompida(a, { incorporada: false });
  c.taxa_eventos = [CHAVE_TAXA];
  c.taxa_bank_id = 'b1';
  c.taxa_recebida = 50; // diz que recebeu, mas nada aconteceu

  const diag = await inspecionarTaxa({ cheque: c, io: a.io });
  assert.equal(diag.estado, ESTADOS_TAXA.SEPARADA_LANCAMENTO_SEM_SALDO);
  assert.ok(diag.divergencias.includes('recebida_sem_efeito'));

  const rec = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'requer_intervencao');
  assert.deepEqual(a.cheque().taxa_eventos, [CHAVE_TAXA], 'não pode liberar uma reivindicação que diz ter recebido');
});

/* ══════════════════ 3. concorrência e idempotência ════════════════════════ */

test('T3.1 — seis recuperações simultâneas somam a taxa UMA vez', async () => {
  const a = ambiente();
  a.io.ajustarTotalReceivable = async () => ({ aplicado: false });
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });
  // Restaura o incremento guardado por chave (o mesmo da função de servidor).
  a.io.ajustarTotalReceivable = async (id, delta, chave) => {
    const res = await a.operacoes.updateWhere(
      { id, taxa_incorporada_eventos: { $ne: chave } },
      { $inc: { total_receivable: delta }, $push: { taxa_incorporada_eventos: chave } }
    );
    return { aplicado: (Number(res && res.updated) || 0) > 0 };
  };

  const resultados = await Promise.all(
    Array.from({ length: 6 }, () => recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io }))
  );

  assert.equal(a.op().total_receivable, 1050, 'a taxa entrou mais de uma vez');
  assert.deepEqual(a.op().taxa_incorporada_eventos, [CHAVE_INCORPORADA]);
  assert.equal(resultados.filter((r) => r.status === 'taxa_incorporada').length, 1, 'mais de uma execução aplicou');
});

test('T3.2 — repetir a recuperação de reivindicação não corrompe o estado', async () => {
  const a = ambiente();
  const c = comoInterrompida(a, { incorporada: false });
  c.taxa_eventos = [CHAVE_TAXA];
  c.taxa_bank_id = 'b1';

  const primeira = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(primeira.status, 'reivindicacao_liberada');
  const segunda = await recuperarTaxaDevolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(segunda.status, 'sem_acao');
  assert.deepEqual(a.cheque().taxa_eventos, []);
});

/* ═══════════ 4. sem taxa e diagnóstico dentro da resolução ════════════════ */

test('T4.1 — cheque sem taxa não tem o que recuperar', async () => {
  const a = ambiente();
  const c = comoInterrompida(a);
  c.taxa_devolucao = 0;
  const diag = await inspecionarTaxa({ cheque: c, io: a.io });
  assert.equal(diag.estado, ESTADOS_TAXA.SEM_TAXA);
  const rec = await recuperarTaxaDevolucao({ cheque: c, io: a.io });
  assert.equal(rec.status, 'sem_acao');
});

test('T4.2 — o diagnóstico da resolução passa a expor a taxa', async () => {
  const a = ambiente();
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });
  const diag = await inspecionarResolucao({ cheque: a.cheque(), io: a.io });
  assert.ok(diag.taxa, 'inspecionarResolucao não expõe o estado da taxa');
  assert.equal(diag.taxa.estado, ESTADOS_TAXA.INCORPORADA_CONCLUIDA);
  assert.equal(diag.taxa.valor, 50);
  assert.equal(diag.estado, 'completo', 'o diagnóstico da resolução não pode regredir');
});

/* ═══════════════════════ 5. paridade servidor ↔ frontend ══════════════════ */

test('T5.1 — as cópias do núcleo e da autorização são idênticas', () => {
  assert.equal(ler('src/lib/chequeCore.js'), ler('base44/shared/chequeCore.ts'));
  assert.equal(ler('src/lib/bankAuthorization.js'), ler('base44/shared/bankAuthorization.js'));
});

test('T5.2 — o fluxo difere do servidor apenas pela extensão dos imports', () => {
  const normalizar = (texto) => texto.replace(/from '\.\/(chequeCore|bankLedger|chequeWrite)\.(js|ts)'/g, "from './$1'");
  assert.equal(normalizar(ler('src/lib/chequeEventFlow.js')), normalizar(ler('base44/shared/chequeEventFlow.js')));
});

test('T5.3 — o servidor implementa o incremento guardado por chave', () => {
  const fonte = ler('base44/functions/chequeEvento/entry.ts');
  assert.match(fonte, /taxa_incorporada_eventos:\s*\{\s*\$ne:\s*chave\s*\}/, 'o $inc não está guardado pela chave');
  assert.match(fonte, /return \{ aplicado \}/, 'o servidor não informa se aplicou');
});