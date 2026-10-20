/**
 * M2 — RESOLUÇÃO DE CHEQUE DEVOLVIDO.
 *
 * Exercita o código REAL de `chequeEventFlow.js` (a mesma cópia que a função de
 * servidor importa) contra o simulador de plataforma. Nada de rede, nada de
 * dados reais, nenhuma chamada ao Asaas.
 *
 * O único dublê é `criarLancamento` (o helper de caixa depende do cliente da
 * plataforma e não é importável em node) e as primitivas de escrita da
 * operação, que aqui reproduzem exatamente o que a função de servidor faz:
 * `$inc` de `total_receivable`/`amount_paid` + recomposição condicional de
 * `balance_due`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  resolverChequeDevolvido,
  receberTaxaDevolucao,
  devolverChequeFisicamente,
  estornarResolucao,
  recuperarResolucao,
  inspecionarResolucao,
  MOTIVOS,
} from './chequeEventFlow.js';
import { LEDGER_KEYS_FIELD } from './bankLedger.js';
import { baseTaxaCongelada, calcJurosResolucao, valorRecebivelResolucao } from './chequeCore.js';
import { autorizarMovimentacaoBancaria, ACOES_BANCARIAS } from './bankAuthorization.js';
import { criarColecao } from './__fixtures__/memoryStore.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (rel) => readFileSync(join(AQUI, rel), 'utf8');

/* ───────────────────────────── ambiente simulado ─────────────────────────── */

function ambiente({ saldoBanco = 0, valor = 1000, total = 1000, pago = 0 } = {}) {
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
  bancos.docs.push({
    id: 'b1',
    name: 'BANCO TESTE',
    current_balance: saldoBanco,
    [LEDGER_KEYS_FIELD]: [],
  });

  const recalcular = async () => {
    const op = operacoes.achar('op1');
    if (!op) return;
    const saldo = Math.max(0, (Number(op.total_receivable) || 0) - (Number(op.amount_paid) || 0));
    const quitado = saldo <= 0.01 && (Number(op.total_receivable) || 0) > 0;
    await operacoes.updateWhere(
      { id: 'op1' },
      { $set: { balance_due: saldo, status: quitado ? 'quitado' : op.status } }
    );
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
    // M2.1 — espelha o CAS da função de servidor: o $inc e a chave do evento
    // acontecem na MESMA escrita sobre a operação, e é isso que devolve
    // `aplicado`. Sem isso o teste não provaria a garantia contra soma dupla.
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

/* ══════════════ 1. recebimento integral do cheque devolvido ═══════════════ */

test('M2.1 — pagamento integral credita, lança uma vez e zera o saldo', async () => {
  const a = ambiente();
  const r = await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });

  assert.equal(r.status, 'aplicado');
  assert.equal(r.taxa, 50, 'taxa = 5% de 1.000');
  assert.equal(r.valor_recebido, 1050, 'principal + taxa incorporada');

  assert.equal(a.cheque().status, 'resolvido_pago');
  assert.equal(a.cheque().resolucao_evento, 'resolucao_cheque:ch1');
  assert.equal(a.cheque().taxa_aplicada, true);
  assert.equal(a.cheque().taxa_recebida, 50);
  assert.equal(a.cheque().resolucao_bank_id, 'b1');

  assert.equal(a.op().total_receivable, 1050);
  assert.equal(a.op().amount_paid, 1050);
  assert.equal(a.op().balance_due, 0);
  assert.equal(a.op().status, 'quitado');
  assert.equal(a.banco().current_balance, 1050);

  assert.equal(a.cashflows.docs.length, 1);
  const cf = a.cashflows.docs[0];
  assert.equal(cf.category, 'recebimento_cheque_devolvido');
  assert.equal(cf.type, 'entrada');
  assert.equal(cf.amount, 1050);
  assert.equal(cf.source_id, 'resolucao_cheque:ch1');
});

/* ══════════════════════ 2. taxa incorporada à obrigação ═══════════════════ */

test('M2.2 — taxa incorporada entra na obrigação UMA única vez', async () => {
  const a = ambiente();
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });
  const depois = await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });

  assert.equal(depois.status, 'nao_aplicado');
  assert.equal(depois.motivo, MOTIVOS.ESTADO_JA_ALTERADO);
  assert.equal(a.op().total_receivable, 1050, 'a taxa não pode ser somada duas vezes');
  assert.equal(a.banco().current_balance, 1050, 'crédito duplo');
  assert.equal(a.cashflows.docs.length, 1);
});

/* ═══════════════════════ 3. taxa cobrada separadamente ════════════════════ */

test('M2.3 — taxa separada não altera o agregado e tem recebimento próprio', async () => {
  const a = ambiente();
  const r = await resolverChequeDevolvido({
    cheque: a.cheque(),
    io: a.io,
    ...pagamento({ taxaIncorporada: false }),
  });

  assert.equal(r.status, 'aplicado');
  assert.equal(r.valor_recebido, 1000, 'só o principal é recebido na resolução');
  assert.equal(a.op().total_receivable, 1000, 'a operação não incorpora a taxa');
  assert.equal(a.op().amount_paid, 1000);
  assert.equal(a.op().balance_due, 0);
  assert.equal(a.cheque().taxa_recebida, 0, 'taxa separada ainda não foi recebida');
  assert.equal(a.banco().current_balance, 1000);

  const taxa = await receberTaxaDevolucao({
    cheque: a.cheque(),
    bankId: 'b1',
    bankName: 'BANCO TESTE',
    data: '2026-03-20',
    metodo: 'pix',
    io: a.io,
  });
  assert.equal(taxa.status, 'aplicado');
  assert.equal(a.banco().current_balance, 1050);
  assert.equal(a.cheque().taxa_recebida, 50);
  assert.equal(a.op().total_receivable, 1000, 'taxa separada nunca entra no total a receber');
  assert.equal(a.op().amount_paid, 1000, 'nem no valor recebido da operação');

  // Receber a mesma taxa de novo é recusado.
  const repetida = await receberTaxaDevolucao({
    cheque: a.cheque(),
    bankId: 'b1',
    data: '2026-03-21',
    io: a.io,
  });
  assert.equal(repetida.status, 'nao_aplicado');
  assert.equal(a.banco().current_balance, 1050);
});

/* ═══════════════ 4. ausência de lançamento financeiro antecipado ══════════ */

test('M2.4 — cobrança sem recebimento não gera caixa nem crédito bancário', async () => {
  const a = ambiente();
  const r = await resolverChequeDevolvido({
    cheque: a.cheque(),
    io: a.io,
    modalidade: 'novo_cheque',
    data: '2026-03-12',
    taxaPercentual: 5,
    taxaIncorporada: true,
    novaData: '2026-05-10',
    novoBanco: 'BRADESCO',
    novoNumero: '999888',
  });

  assert.equal(r.status, 'aplicado');
  assert.equal(a.cashflows.docs.length, 0, 'resolver não é receber');
  assert.equal(a.banco().current_balance, 0, 'nenhum crédito antecipado');
  assert.equal(a.op().amount_paid, 0);
  assert.equal(a.op().total_receivable, 1050, 'a taxa foi COBRADA (obrigação), não recebida');
});

/* ══════════ 5. coerência de amount_paid, total_receivable e balance_due ═══ */

test('M2.5 — balance_due acompanha total − recebido em todas as etapas', async () => {
  const a = ambiente();
  await resolverChequeDevolvido({
    cheque: a.cheque(),
    io: a.io,
    ...pagamento({ taxaIncorporada: true }),
  });

  const op = a.op();
  assert.equal(op.balance_due, Math.max(0, op.total_receivable - op.amount_paid));
  assert.equal(op.balance_due, 0, 'a taxa recebida não pode sobrar como saldo aberto');
});

test('M2.5b — recebimento de cheque preserva pagamento independente (Asaas)', async () => {
  // Operação com 300 já recebidos por fora e 1.300 a receber.
  const a = ambiente({ total: 1300, pago: 300 });
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });

  assert.equal(a.op().amount_paid, 1350, '300 independentes + 1.000 + 50 de taxa');
  assert.equal(a.op().total_receivable, 1350);
  assert.equal(a.op().balance_due, 0);
});

/* ═══════════ 6. prorrogação sem alteração indevida do valor de face ═══════ */

test('M2.6 — prorrogação mantém a face e conta juros só do período não coberto', async () => {
  const a = ambiente();
  const r = await resolverChequeDevolvido({
    cheque: a.cheque(),
    io: a.io,
    modalidade: 'prorrogacao',
    data: '2026-03-12',
    taxaPercentual: 0,
    novaData: '2026-04-10',
    taxaMensal: 4,
  });

  assert.equal(r.status, 'aplicado');
  assert.equal(a.cheque().value, 1000, 'o valor de face NÃO muda na prorrogação');
  assert.equal(a.cheque().valor_face, 1000);
  assert.equal(a.cheque().compensation_date, '2026-04-10');
  assert.equal(a.cheque().juros_cobrados_ate, '2026-04-10');
  assert.equal(a.cheque().status, 'resolvido_prorrogado');
  assert.equal(a.cashflows.docs.length, 0);
  assert.equal(a.banco().current_balance, 0);

  // 31 dias (10/03 → 10/04) na fórmula comercial existente.
  assert.equal(r.juros, calcJurosResolucao(1000, 4, 31));

  // Nova prorrogação conta a partir do período JÁ cobrado, sem sobreposição.
  const b = ambiente();
  b.cheques.docs[0].juros_cobrados_ate = '2026-04-10';
  b.cheques.docs[0].compensation_date = '2026-04-10';
  const r2 = await resolverChequeDevolvido({
    cheque: b.cheque(),
    io: b.io,
    modalidade: 'prorrogacao',
    data: '2026-04-11',
    novaData: '2026-05-10',
    taxaMensal: 4,
  });
  assert.equal(r2.juros, calcJurosResolucao(1000, 4, 30), 'não recobra os 31 dias anteriores');
});

/* ═══════════════ 7. substituição sem duplicidade da obrigação ═════════════ */

test('M2.7 — substituição mantém o principal e cria um único substituto', async () => {
  const a = ambiente();
  const dados = {
    cheque: a.cheque(),
    io: a.io,
    modalidade: 'novo_cheque',
    data: '2026-03-12',
    taxaPercentual: 5,
    taxaIncorporada: true,
    novaData: '2026-05-10',
    novoBanco: 'BRADESCO',
    novoNumero: '999888',
  };

  await resolverChequeDevolvido(dados);
  const substitutos = a.cheques.docs.filter((c) => c.substitui_cheque_id === 'ch1');

  assert.equal(substitutos.length, 1);
  assert.equal(substitutos[0].value, 1000, 'a face não pode incluir a taxa já cobrada');
  assert.equal(substitutos[0].valor_face, 1000);
  assert.equal(substitutos[0].status, 'pendente');
  assert.equal(a.op().total_receivable, 1050, 'a obrigação sobe UMA vez, pela taxa');

  await resolverChequeDevolvido(dados);
  assert.equal(a.cheques.docs.filter((c) => c.substitui_cheque_id === 'ch1').length, 1);
  assert.equal(a.op().total_receivable, 1050, 'sem duplicar a obrigação');
});

/* ═════════════ 8. devolução física sem quitação indevida da dívida ════════ */

test('M2.8 — devolução física exige quitação e nunca baixa a dívida', async () => {
  const a = ambiente();
  await resolverChequeDevolvido({
    cheque: a.cheque(),
    io: a.io,
    ...pagamento({ taxaIncorporada: false }),
  });

  // Taxa separada em aberto: a entrega padrão é recusada.
  const recusada = await devolverChequeFisicamente({
    cheque: a.cheque(),
    data: '2026-03-25',
    io: a.io,
  });
  assert.equal(recusada.status, 'nao_aplicado');
  assert.equal(recusada.motivo, MOTIVOS.TAXA_EM_ABERTO);

  await receberTaxaDevolucao({ cheque: a.cheque(), bankId: 'b1', data: '2026-03-26', io: a.io });

  const antes = { ...a.op() };
  const ok = await devolverChequeFisicamente({
    cheque: a.cheque(),
    data: '2026-03-27',
    autorizadoPor: 'operador@psx.test',
    io: a.io,
  });

  assert.equal(ok.status, 'aplicado');
  assert.equal(a.cheque().devolucao_fisica_evento, 'devolucao_fisica_cheque:ch1');
  assert.equal(a.cheque().devolucao_fisica_por, 'operador@psx.test');
  assert.equal(a.cheque().status, 'resolvido_pago', 'entrega não muda o estado financeiro');
  assert.deepEqual(
    { total: a.op().total_receivable, pago: a.op().amount_paid, saldo: a.op().balance_due },
    { total: antes.total_receivable, pago: antes.amount_paid, saldo: antes.balance_due },
    'nenhum saldo pode mudar por devolução física'
  );
  assert.equal(a.cashflows.docs.length, 2, 'só os recebimentos; nada novo pela entrega');
});

test('M2.8b — exceção administrativa exige justificativa e não quita', async () => {
  const a = ambiente();
  const semJustificativa = await devolverChequeFisicamente({
    cheque: a.cheque(),
    data: '2026-03-25',
    excecao: true,
    io: a.io,
  });
  assert.equal(semJustificativa.status, 'nao_aplicado');
  assert.equal(semJustificativa.motivo, MOTIVOS.DADOS_INVALIDOS);

  const ok = await devolverChequeFisicamente({
    cheque: a.cheque(),
    data: '2026-03-25',
    excecao: true,
    justificativa: 'Autorizado pela diretoria — acordo em formalização',
    autorizadoPor: 'admin@psx.test',
    io: a.io,
  });

  assert.equal(ok.status, 'aplicado');
  assert.equal(a.cheque().devolucao_fisica_excecao, true);
  assert.equal(a.op().balance_due, 1000, 'exceção NÃO baixa dívida');
  assert.equal(a.op().amount_paid, 0);
  assert.equal(a.cashflows.docs.length, 0);
});

/* ═══════════ 9. repetição da mesma requisição sem duplicar lançamentos ════ */

test('M2.9 — repetir a mesma resolução não duplica caixa, saldo nem obrigação', async () => {
  const a = ambiente();
  const dados = { cheque: a.cheque(), io: a.io, ...pagamento() };

  const primeira = await resolverChequeDevolvido(dados);
  const segunda = await resolverChequeDevolvido(dados);
  const terceira = await resolverChequeDevolvido(dados);

  assert.equal(primeira.status, 'aplicado');
  assert.equal(segunda.status, 'nao_aplicado');
  assert.equal(terceira.status, 'nao_aplicado');
  assert.equal(a.cashflows.docs.length, 1);
  assert.equal(a.banco().current_balance, 1050);
  assert.equal(a.op().total_receivable, 1050);
  assert.equal(a.op().amount_paid, 1050);
});

/* ═══════════════ 10. duas requisições concorrentes para o cheque ══════════ */

test('M2.10 — seis resoluções simultâneas produzem UM recebimento', async () => {
  const a = ambiente();
  const observado = a.cheque();

  const resultados = await Promise.all(
    Array.from({ length: 6 }, () =>
      resolverChequeDevolvido({ cheque: observado, io: a.io, ...pagamento() })
    )
  );

  assert.equal(resultados.filter((r) => r.status === 'aplicado').length, 1);
  assert.equal(resultados.filter((r) => r.motivo === MOTIVOS.ESTADO_JA_ALTERADO).length, 5);
  assert.equal(a.banco().current_balance, 1050, 'crédito duplo');
  assert.equal(a.cashflows.docs.length, 1, 'lançamento duplicado');
  assert.equal(a.op().total_receivable, 1050, 'taxa somada duas vezes');
  assert.equal(a.op().amount_paid, 1050);
});

/* ═════════════ 11. recuperação após falha em cada etapa financeira ════════ */

test('M2.11 — saldo aplicado sem lançamento é reparado sem recreditar', async () => {
  const a = ambiente();
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });

  // Simula falha depois do crédito e antes do lançamento.
  a.cashflows.docs = [];

  const antes = await inspecionarResolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(antes.estado, 'saldo_sem_lancamento');

  const rec = await recuperarResolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'lancamento_reparado');
  assert.equal(a.cashflows.docs.length, 1);
  assert.equal(a.banco().current_balance, 1050, 'a recuperação NUNCA recredita');
});

test('M2.11b — lançamento sem saldo comprovado bloqueia e pede intervenção', async () => {
  const a = ambiente();
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });

  // Simula o inverso: o lançamento existe, mas a chave não está no banco.
  a.bancos.docs[0][LEDGER_KEYS_FIELD] = [];

  const diag = await inspecionarResolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(diag.estado, 'lancamento_sem_saldo');

  const rec = await recuperarResolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'requer_intervencao');
  assert.equal(a.banco().current_balance, 1050, 'nada é movimentado');
  assert.equal(a.cashflows.docs.length, 1);
});

test('M2.11c — resolução completa não tem nada a reparar', async () => {
  const a = ambiente();
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });

  const diag = await inspecionarResolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(diag.estado, 'completo');
  assert.equal(diag.saldo_aplicado, true);
  assert.equal(diag.lancamento_existe, true);

  const rec = await recuperarResolucao({ cheque: a.cheque(), io: a.io });
  assert.equal(rec.status, 'requer_intervencao');
  assert.equal(rec.estado_anterior, 'completo');
  assert.equal(a.cashflows.docs.length, 1);
});

/* ═══════ 12. estorno somente com comprovação do lançamento original ═══════ */

test('M2.12 — estorno exige evidência do recebimento original', async () => {
  const a = ambiente();
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });

  // Sem a chave da resolução na conta, o débito é recusado.
  const chave = a.bancos.docs[0][LEDGER_KEYS_FIELD][0];
  a.bancos.docs[0][LEDGER_KEYS_FIELD] = [];
  const semProva = await estornarResolucao({ cheque: a.cheque(), data: '2026-03-20', io: a.io });
  assert.equal(semProva.status, 'nao_aplicado');
  assert.equal(semProva.motivo, MOTIVOS.SEM_CREDITO_COMPROVADO);
  assert.equal(a.banco().current_balance, 1050);

  // Com a prova, debita uma única vez e devolve a obrigação ao estado cobrado.
  a.bancos.docs[0][LEDGER_KEYS_FIELD] = [chave];
  const ok = await estornarResolucao({ cheque: a.cheque(), data: '2026-03-20', io: a.io });

  assert.equal(ok.status, 'aplicado');
  assert.equal(a.banco().current_balance, 0);
  assert.equal(a.op().amount_paid, 0);
  assert.equal(a.op().total_receivable, 1050, 'a taxa segue cobrada, não recebida');
  assert.equal(a.op().balance_due, 1050);
  assert.equal(a.cheque().status, 'devolvido');
  assert.equal(a.cheque().taxa_recebida, 0);

  const repetido = await estornarResolucao({ cheque: a.cheque(), data: '2026-03-21', io: a.io });
  assert.equal(repetido.status, 'nao_aplicado');
  assert.equal(a.banco().current_balance, 0, 'débito duplo');
});

/* ═════════════════════════ 13. bloqueio de usuários ═══════════════════════ */

test('M2.13 — autorização: devolução física e exceção têm donos diferentes', () => {
  const admin = { email: 'a@x.com', role: 'admin', allowed_pages: [] };
  const operador = { email: 'o@x.com', role: 'user', allowed_pages: ['cheques'] };
  const semPagina = { email: 's@x.com', role: 'user', allowed_pages: ['dashboard'] };

  assert.equal(autorizarMovimentacaoBancaria(operador, ACOES_BANCARIAS.DEVOLVER_CHEQUE).autorizado, true);
  assert.equal(autorizarMovimentacaoBancaria(semPagina, ACOES_BANCARIAS.DEVOLVER_CHEQUE).autorizado, false);
  assert.equal(autorizarMovimentacaoBancaria(admin, ACOES_BANCARIAS.DEVOLVER_CHEQUE).autorizado, true);

  assert.equal(autorizarMovimentacaoBancaria(operador, ACOES_BANCARIAS.DEVOLVER_CHEQUE_EXCECAO).autorizado, false);
  assert.equal(autorizarMovimentacaoBancaria(admin, ACOES_BANCARIAS.DEVOLVER_CHEQUE_EXCECAO).autorizado, true);

  // Estorno do RECEBIMENTO da resolução e recuperação são administrativos.
  assert.equal(autorizarMovimentacaoBancaria(operador, ACOES_BANCARIAS.ESTORNAR_RESOLUCAO).autorizado, false);
  assert.equal(autorizarMovimentacaoBancaria(admin, ACOES_BANCARIAS.ESTORNAR_RESOLUCAO).autorizado, true);
  assert.equal(autorizarMovimentacaoBancaria(operador, ACOES_BANCARIAS.RECUPERAR_CHEQUE).autorizado, false);
  assert.equal(autorizarMovimentacaoBancaria(null, ACOES_BANCARIAS.RESOLVER_CHEQUE).autorizado, false);
});

test('M2.13b — a função autoriza antes de elevar privilégio e não lê identidade do corpo', () => {
  const fonte = ler('../../base44/functions/chequeEvento/entry.ts');

  const posAutorizacao = fonte.indexOf('autorizarMovimentacaoBancaria(user, acaoPolitica)');
  const posServico = fonte.indexOf('asServiceRole');
  const posPrimeiraEscrita = fonte.indexOf('.create(');

  assert.ok(posAutorizacao > 0, 'autorização ausente');
  assert.ok(posAutorizacao < posServico, 'elevação antes da checagem');
  assert.ok(posAutorizacao < posPrimeiraEscrita, 'escrita antes da checagem');

  for (const proibido of ['body.role', 'body.email', 'body.permissions', 'body.allowed_pages', 'body.userEmail']) {
    assert.equal(fonte.includes(proibido), false, `a função lê "${proibido}" do navegador`);
  }
  assert.match(fonte, /ACOES_BANCARIAS\.DEVOLVER_CHEQUE_EXCECAO/, 'a exceção precisa de política própria');
  // M2.1 — `usuario` não existe nesta função: o dono vem de `user`, resolvido do token.
  assert.match(fonte, /autorizadoPor: user\.email/, 'o dono da devolução física vem do token');
  assert.equal(/autorizadoPor: usuario\.email/.test(fonte), false, 'restou identidade de variável inexistente');
});

/* ═════════════ 14. compatibilidade com cheques e operações antigos ════════ */

test('M2.14 — cheque histórico sem base congelada usa a face original', async () => {
  assert.equal(baseTaxaCongelada({ value: 1000, valor_face: 800 }), 800);
  assert.equal(baseTaxaCongelada({ value: 700 }), 700);
  assert.equal(baseTaxaCongelada({}), 0);

  const a = ambiente();
  delete a.cheques.docs[0].valor_face; // cheque legado sem face explícita
  const r = await resolverChequeDevolvido({
    cheque: a.cheque(),
    io: a.io,
    modalidade: 'prorrogacao',
    data: '2026-03-12',
    taxaPercentual: 10,
    taxaIncorporada: true,
    novaData: '2026-04-10',
    taxaMensal: 0,
  });

  assert.equal(r.taxa, 100, '10% sobre a face de 1.000');
  assert.equal(a.cheque().taxa_base_valor, 1000);
});

test('M2.14b — operação já quitada continua coerente ao receber a resolução', async () => {
  const a = ambiente({ total: 1000, pago: 1000 });
  await a.io.registrarRecebimento('op1', 0);
  assert.equal(a.op().balance_due, 0);

  const r = await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });
  assert.equal(r.status, 'aplicado');
  assert.equal(a.op().balance_due, 0);
  assert.equal(a.op().amount_paid, 2050, '1.000 já recebidos + 1.050 desta resolução');
  assert.equal(a.op().total_receivable, 1050, 'total não regride ao receber a taxa');
});

/* ═══════ 15. ausência de escritas financeiras diretas no frontend ═════════ */

test('M2.15 — o modal de resolução não escreve mais nada por conta própria', () => {
  const fonte = ler('../components/cheque/ChequeDevolvidoModal.jsx');

  for (const proibido of [
    'entities.CashFlow',
    'entities.Operation.update',
    'entities.Banco.updateMany',
    'entities.Cheque.create',
    'entities.Cheque.update',
    'applyBankDelta',
    'aplicarEventoBancario',
    'chaveEvento',
  ]) {
    assert.equal(fonte.includes(proibido), false, `o modal ainda escreve via ${proibido}`);
  }
  assert.match(fonte, /from '@\/lib\/chequeOps'/, 'o modal precisa usar o adaptador do servidor');
  assert.match(fonte, /resolverChequeDevolvido/, 'o modal precisa chamar a resolução do servidor');
  assert.equal(fonte.includes("'500'"), false, 'taxa fixa de R$ 500 removida');
});

test('M2.15b — o fluxo duplicado de substituição saiu da tela de Cheques', () => {
  const fonte = ler('../pages/Cheques.jsx');
  assert.equal(fonte.includes('TrocaChequeModal'), false, 'fluxo duplicado ainda presente');
  assert.match(fonte, /DevolucaoFisicaModal/, 'a devolução física precisa de entrada na tela');
});

/* ═══════ 16. vínculos obrigatórios das categorias de fluxo de caixa ═══════ */

test('M2.16 — todo lançamento da resolução carrega origem, operação e banco', async () => {
  const a = ambiente();
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });
  await resolverChequeDevolvido({
    cheque: { ...a.cheque(), id: 'ch2' },
    io: a.io,
    modalidade: 'prorrogacao',
    taxaPercentual: 5,
    taxaIncorporada: false,
    data: '2026-03-12',
    novaData: '2026-04-10',
    taxaMensal: 4,
  });

  const cf = a.cashflows.docs[0];
  assert.ok(cf.operation_id, 'categoria operacional exige operation_id');
  assert.ok(cf.bank_id, 'categoria bancária exige bank_id');
  assert.ok(cf.source_type && cf.source_id, 'origem obrigatória para idempotência');
});

test('M2.16b — o estorno também respeita os vínculos da categoria', async () => {
  const a = ambiente();
  await resolverChequeDevolvido({ cheque: a.cheque(), io: a.io, ...pagamento() });
  await estornarResolucao({ cheque: a.cheque(), data: '2026-03-20', io: a.io });

  const estorno = a.cashflows.docs.find((c) => c.category === 'estorno_resolucao_cheque');
  assert.ok(estorno, 'lançamento de estorno ausente');
  assert.equal(estorno.type, 'saida');
  assert.ok(estorno.operation_id && estorno.bank_id);
  assert.equal(estorno.source_id, 'resolucao_cheque:ch1:estorno');
});

test('M2.16c — valorRecebivelResolucao distingue incorporada de separada', () => {
  assert.equal(valorRecebivelResolucao({ value: 1000, taxa_devolucao: 50, taxa_incorporada: true }), 1050);
  assert.equal(valorRecebivelResolucao({ value: 1000, taxa_devolucao: 50, taxa_incorporada: false }), 1000);
});