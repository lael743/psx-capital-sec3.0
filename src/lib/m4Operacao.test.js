/**
 * M4 — TESTES DO FLUXO DE CRIAÇÃO DE OPERAÇÕES.
 *
 * Cobrem: cada modalidade, títulos de valores diferentes, geração automática de
 * parcelas, reconciliação de totais, validações, falha parcial, retry, estado
 * inicial, edição sem destruir títulos com efeito e compatibilidade com o M3.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { criarColecao } from './__fixtures__/memoryStore.js';
import {
  resumoFinanceiro, validarOperacao, distribuirPorPeso, montarCronograma, calcTituloRow,
} from './operacaoCalc.js';
import {
  montarPayloadOperacao, montarTitulosCheque, planoDeTitulos, salvarOperacao, proximoNumeroOperacao,
} from './operacaoSave.js';
import { registrarRecebimento } from './receiptEvent.js';

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/* ── plataforma simulada ──────────────────────────────────────────────────── */

function criarApi({ falharNoTitulo = 0 } = {}) {
  const colecoes = {
    Operation: criarColecao('Operation'),
    Cheque: criarColecao('Cheque'),
    Payment: criarColecao('Payment'),
  };
  let criados = 0;
  const entidades = {};

  for (const [nome, col] of Object.entries(colecoes)) {
    entidades[nome] = {
      get: async (id) => {
        const d = col.achar(id);
        return d ? JSON.parse(JSON.stringify(d)) : null;
      },
      filter: (q) => col.filter(q),
      list: async (sort, limit) => {
        const docs = [...col.docs];
        if (typeof sort === 'string' && sort.startsWith('-')) {
          const campo = sort.slice(1);
          docs.sort((a, b) => (Number(b[campo]) || 0) - (Number(a[campo]) || 0));
        }
        return docs.slice(0, limit || docs.length).map((d) => ({ ...d }));
      },
      create: async (d) => {
        if (nome === 'Cheque') {
          criados += 1;
          if (falharNoTitulo && criados === falharNoTitulo) throw new Error('falha simulada ao gravar título');
        }
        // O servidor (operacaoEditar → criar) define o estado inicial: o corpo
        // não manda `etapa` nem `status`.
        const dados = nome === 'Operation' ? { ...d, etapa: 'rascunho', status: 'ativo', amount_paid: 0 } : d;
        return col.create(dados);
      },
      updateMany: (q, u) => col.updateWhere(q, u),
      update: (id, patch) => col.updateWhere({ id }, { $set: patch }),
      delete: (id) => col.delete(id),
      deleteMany: async () => ({ deleted: 0 }),
    };
  }

  return { entities: entidades, colecoes };
}

const FORM = {
  start_date: '2026-10-21',
  rate: 4,
  interest_type: 'simples',
  tarifa_operacao: 0,
  tarifa_por_titulo: 0,
  float_dias: 0,
  arredondar_taxa_diaria: false,
  produto: 'cheque',
  tipo: 'cheque',
  client_id: 'cli1',
  calculo_inverso: false,
  calc_mode: 'inverso',
};

const formCom = (extra = {}) => ({ ...FORM, ...extra });

function titulo(valor, vencimento, extra = {}) {
  return {
    chave: `k-${vencimento}-${valor}-${Math.random().toString(36).slice(2, 7)}`,
    tipo: 'cheque',
    numero: extra.numero || '',
    nf: '',
    sacado: 'SACADO TESTE',
    sacado_doc: '000.000.000-00',
    vencimento,
    valor_face: String(valor),
    outras_despesas: '',
    ...extra,
  };
}

function ctxDe(form, calcMode) {
  return {
    startDate: form.start_date,
    interestType: form.interest_type,
    floatDias: form.float_dias,
    arredondar: form.arredondar_taxa_diaria,
    calcMode,
    calcModeEfetivo: calcMode,
    opType: 'cheque',
    clientId: form.client_id,
    clientName: 'Cedente Teste',
  };
}

/* ── 1. distribuição exata ───────────────────────────────────────────────── */

test('M4.1 — distribuirPorPeso fecha exatamente (nenhum centavo perdido)', () => {
  const partes = distribuirPorPeso(1000, [1, 1, 1]);
  assert.equal(partes.length, 3);
  assert.equal(round2(partes.reduce((s, p) => s + p, 0)), 1000);

  const diferentes = distribuirPorPeso(1000, [100, 300, 600]);
  assert.equal(round2(diferentes.reduce((s, p) => s + p, 0)), 1000);
  assert.ok(diferentes[2] > diferentes[1] && diferentes[1] > diferentes[0]);
});

/* ── 2. cada modalidade reconcilia títulos, parcelas e total ─────────────── */

test('M4.2 — cada modalidade reconcilia títulos, parcelas e total a receber', () => {
  const cenarios = [
    { nome: 'inverso', form: formCom({ calc_mode: 'inverso', tarifa_operacao: 10, tarifa_por_titulo: 5 }), titulos: [titulo(300, '2026-11-20'), titulo(400, '2026-12-20'), titulo(500, '2027-01-20')] },
    { nome: 'desconto_direto', form: formCom({ calc_mode: 'desconto_direto', tarifa_operacao: 10, tarifa_por_titulo: 5 }), titulos: [titulo(300, '2026-11-20'), titulo(400, '2026-12-20'), titulo(500, '2027-01-20')] },
    { nome: 'padrao', form: formCom({ calc_mode: 'padrao', tarifa_operacao: 10, tarifa_por_titulo: 5 }), titulos: [titulo(300, '2026-11-20'), titulo(400, '2026-12-20', { outras_despesas: '20' }), titulo(500, '2027-01-20')] },
    { nome: 'emprestimo', form: formCom({ tipo: 'emprestimo', calc_mode: 'emprestimo', tarifa_operacao: 10, tarifa_por_titulo: 5 }), titulos: [titulo(330, '2026-11-20', { valor_liquido: '300' }), titulo(440, '2026-12-20', { valor_liquido: '400' }), titulo(550, '2027-01-20', { valor_liquido: '500' })] },
  ];

  for (const c of cenarios) {
    const resumo = resumoFinanceiro({ titulos: c.titulos, form: c.form, calcMode: c.nome });
    const schedule = montarCronograma(resumo, ctxDe(c.form, c.nome));

    assert.equal(schedule.length, 3, `${c.nome}: uma parcela por título`);
    assert.equal(new Set(schedule.map((p) => p.id)).size, 3, `${c.nome}: identidades distintas`);
    assert.ok(
      Math.abs(schedule.reduce((s, p) => s + p.value, 0) - resumo.totals.totalFace) < 0.005,
      `${c.nome}: soma das faces = total de face`,
    );
    assert.equal(
      round2(schedule.reduce((s, p) => s + p.total_distribuido, 0)),
      resumo.totalReceivable,
      `${c.nome}: soma das parcelas = total a receber`,
    );
    assert.ok(
      Math.abs(resumo.installmentValue * 3 - resumo.totalReceivable) <= 0.03,
      `${c.nome}: valor da parcela compatível com o total`,
    );
    assert.equal(
      round2(resumo.projectedProfit),
      round2(resumo.totalReceivable - resumo.valorLiquido),
      `${c.nome}: lucro projetado = total − líquido`,
    );
  }
});

test('M4.2b — regras de tarifa preservadas por modalidade', () => {
  const titulos = [titulo(1000, '2026-11-20')];
  const form = formCom({ tarifa_operacao: 50, tarifa_por_titulo: 10 });

  const inverso = resumoFinanceiro({ titulos, form, calcMode: 'inverso' });
  assert.equal(inverso.totalReceivable, 1000, 'inverso: tarifas não entram na obrigação');
  assert.equal(round2(inverso.valorLiquido), round2(inverso.totals.totalLiquido - 60), 'inverso: tarifas saem do líquido');

  const padrao = resumoFinanceiro({ titulos, form, calcMode: 'padrao' });
  assert.equal(padrao.totalReceivable, round2(padrao.totals.totalFace + padrao.totals.totalOutras + 60), 'padrão: tarifas repassadas ao cedente');
  assert.equal(round2(padrao.valorLiquido), round2(padrao.totals.totalLiquido), 'padrão: líquido não sofre desconto de tarifa');
});

/* ── 3. títulos com valores diferentes ──────────────────────────────────── */

test('M4.3 — títulos com valores diferentes recebem obrigação proporcional', () => {
  const titulos = [titulo(100, '2026-11-20'), titulo(300, '2026-12-20')];
  const form = formCom({ calc_mode: 'inverso' });
  const resumo = resumoFinanceiro({ titulos, form, calcMode: 'inverso' });

  assert.equal(resumo.totalReceivable, 400);
  assert.equal(round2(resumo.porTitulo.reduce((s, p) => s + p, 0)), 400);
  assert.equal(resumo.porTitulo[0], 100);
  assert.equal(resumo.porTitulo[1], 300);
});

/* ── 4. geração automática e identidade estável ─────────────────────────── */

test('M4.4 — cronograma mantém a identidade do título mesmo mudando o vencimento', () => {
  const t = titulo(500, '2026-11-20');
  const resumoA = resumoFinanceiro({ titulos: [t], form: formCom(), calcMode: 'inverso' });
  const antes = montarCronograma(resumoA, ctxDe(formCom(), 'inverso'));

  const movido = { ...t, vencimento: '2026-12-20' };
  const resumoB = resumoFinanceiro({ titulos: [movido], form: formCom(), calcMode: 'inverso' });
  const depois = montarCronograma(resumoB, ctxDe(formCom(), 'inverso'));

  assert.equal(antes[0].id, depois[0].id, 'a chave do título não depende de data/valor/posição');
  assert.notEqual(antes[0].due_date, depois[0].due_date);
});

test('M4.4b — parcelas geradas automaticamente (3 iguais) reconciliam', () => {
  const titulos = [1, 2, 3].map((i) => titulo(333.33, `2027-0${i}-20`, { numero: `${i}/3` }));
  const form = formCom({ calc_mode: 'padrao' });
  const resumo = resumoFinanceiro({ titulos, form, calcMode: 'padrao' });
  const schedule = montarCronograma(resumo, ctxDe(form, 'padrao'));

  assert.equal(schedule.length, 3);
  assert.equal(round2(schedule.reduce((s, p) => s + p.total_distribuido, 0)), resumo.totalReceivable);
  assert.ok(Math.abs(resumo.installmentValue * 3 - resumo.totalReceivable) <= 0.03);
});

/* ── 5. validações ──────────────────────────────────────────────────────── */

test('M4.5 — campos obrigatórios, datas e valores inválidos são recusados', () => {
  const form = formCom();
  const titulos = [titulo(500, '2026-11-20')];

  assert.deepEqual(validarOperacao({ resumo: resumoFinanceiro({ titulos, form, calcMode: 'inverso' }), form }), []);

  const semInicio = validarOperacao({ resumo: resumoFinanceiro({ titulos, form: { ...form, start_date: '' }, calcMode: 'inverso' }), form: { ...form, start_date: '' } });
  assert.ok(semInicio.length > 0);

  const semTaxa = validarOperacao({ resumo: resumoFinanceiro({ titulos, form: { ...form, rate: 0 }, calcMode: 'inverso' }), form: { ...form, rate: '' } });
  assert.ok(semTaxa.length > 0);

  const vencimentoAnterior = [titulo(500, '2026-10-01')];
  const venc = validarOperacao({ resumo: resumoFinanceiro({ titulos: vencimentoAnterior, form, calcMode: 'inverso' }), form });
  assert.ok(venc.some((e) => /posterior/.test(e)));

  const semValor = validarOperacao({ resumo: resumoFinanceiro({ titulos: [titulo(0, '2026-11-20')], form, calcMode: 'inverso' }), form });
  assert.ok(semValor.length > 0);
});

/* ── 6. criação: estado inicial e vínculos ──────────────────────────────── */

async function criarOperacao(api, { form = formCom(), calcMode = 'inverso', titulos } = {}) {
  const resumo = resumoFinanceiro({ titulos, form, calcMode });
  const ctx = ctxDe(form, calcMode);
  const numeroOperacao = await proximoNumeroOperacao(api);
  const payload = montarPayloadOperacao({ resumo, form, ctx, editando: false, numeroOperacao });
  const desejados = montarTitulosCheque({ resumo, ctx, operationId: '' });
  const resultado = await salvarOperacao(api, { operacaoId: '', payload, desejados });
  return { resultado, resumo, payload };
}

test('M4.6 — criação persiste operação ativa em rascunho', async () => {
  const api = criarApi();
  const { resultado, resumo } = await criarOperacao(api, {
    titulos: [titulo(300, '2026-11-20'), titulo(700, '2026-12-20')],
  });

  const op = api.colecoes.Operation.achar(resultado.operationId);
  assert.equal(op.etapa, 'rascunho', 'toda operação nasce em rascunho');
  assert.equal(op.status, 'ativo');
  assert.equal(op.numero_operacao, 1);
  assert.equal(op.total_receivable, resumo.totalReceivable);
  assert.equal(op.gross_value, resumo.valorLiquido, 'gross_value guarda o líquido (nome legado)');
  assert.equal(op.balance_due, resumo.totalReceivable);
  assert.equal(op.amount_paid, 0);
  assert.equal(op.installment_schedule.length, 2);

  const cheques = api.colecoes.Cheque.docs.filter((c) => c.operation_id === op.id);
  assert.equal(cheques.length, 2, 'todos os títulos foram gravados');
  assert.deepEqual(
    cheques.map((c) => c.compensation_date).sort(),
    op.installment_schedule.map((p) => p.due_date).sort(),
    'títulos e cronograma apontam para os mesmos vencimentos',
  );
  assert.ok(op.installment_schedule.every((p) => !!p.id), 'cada parcela tem identidade estável');
});

/* ── 7. retry / clique repetido ─────────────────────────────────────────── */

test('M4.7 — repetir a gravação não duplica operação nem títulos', async () => {
  const api = criarApi();
  const titulos = [titulo(300, '2026-11-20'), titulo(700, '2026-12-20')];
  const { resultado } = await criarOperacao(api, { titulos });

  const form = formCom();
  const calcMode = 'inverso';
  const resumo = resumoFinanceiro({ titulos, form, calcMode });
  const ctx = ctxDe(form, calcMode);
  const payload = montarPayloadOperacao({ resumo, form, ctx, editando: false, numeroOperacao: 1 });
  const desejados = montarTitulosCheque({ resumo, ctx, operationId: resultado.operationId });

  const segunda = await salvarOperacao(api, { operacaoId: resultado.operationId, payload, desejados });

  assert.equal(segunda.operationId, resultado.operationId);
  assert.equal(api.colecoes.Operation.docs.length, 1, 'nenhuma operação duplicada');
  assert.equal(api.colecoes.Cheque.docs.length, 2, 'nenhum título duplicado');
});

/* ── 8. falha parcial e recuperação ─────────────────────────────────────── */

test('M4.8 — falha ao gravar um título é recuperável no retry, sem duplicar', async () => {
  const api = criarApi({ falharNoTitulo: 2 });
  const titulos = [titulo(300, '2026-11-20'), titulo(700, '2026-12-20')];
  const { resultado } = await criarOperacao(api, { titulos });

  assert.equal(resultado.operationId !== undefined, true, 'a operação foi criada');
  assert.equal(resultado.falhas.length, 1, 'a falha é reportada');
  assert.equal(api.colecoes.Cheque.docs.length, 1, 'título que falhou não foi gravado');

  // Retry: mesma operação (nenhuma segunda é criada), completa o que faltou.
  const api2 = api; // a falha simulada já foi consumida
  const form = formCom();
  const calcMode = 'inverso';
  const resumo = resumoFinanceiro({ titulos, form, calcMode });
  const ctx = ctxDe(form, calcMode);
  const payload = montarPayloadOperacao({ resumo, form, ctx, editando: false, numeroOperacao: 1 });
  const desejados = montarTitulosCheque({ resumo, ctx, operationId: resultado.operationId });
  const retry = await salvarOperacao(api2, { operacaoId: resultado.operationId, payload, desejados });

  assert.equal(retry.falhas.length, 0);
  assert.equal(api.colecoes.Operation.docs.length, 1);
  assert.equal(api.colecoes.Cheque.docs.length, 2, 'a segunda tentativa completou os títulos');
});

/* ── 9. edição preserva registros ───────────────────────────────────────── */

test('M4.9 — edição atualiza títulos no lugar em vez de apagar e recriar', async () => {
  const api = criarApi();
  const titulos = [titulo(300, '2026-11-20'), titulo(700, '2026-12-20')];
  const { resultado } = await criarOperacao(api, { titulos });
  const idsAntes = api.colecoes.Cheque.docs.map((c) => c.id).sort();

  const form = formCom();
  const calcMode = 'inverso';
  const novos = [
    { ...titulos[0], vencimento: '2026-11-25' },
    { ...titulos[1], valor_face: '800' },
  ];
  const resumo = resumoFinanceiro({ titulos: novos, form, calcMode });
  const ctx = ctxDe(form, calcMode);
  const payload = montarPayloadOperacao({ resumo, form, ctx, editando: true });
  const desejados = montarTitulosCheque({ resumo, ctx, operationId: resultado.operationId });

  const editado = await salvarOperacao(api, { operacaoId: resultado.operationId, payload, desejados });

  assert.equal(editado.bloqueio, null);
  const idsDepois = api.colecoes.Cheque.docs.map((c) => c.id).sort();
  assert.deepEqual(idsDepois, idsAntes, 'os mesmos registros de título foram preservados');
  const porVencimento = Object.fromEntries(api.colecoes.Cheque.docs.map((c) => [c.compensation_date, c]));
  assert.equal(porVencimento['2026-11-25'].valor_face, 300);
  assert.equal(porVencimento['2026-12-20'].valor_face, 800);
});

test('M4.10 — título com efeito financeiro bloqueia a edição e permanece intacto', async () => {
  const api = criarApi();
  const titulos = [titulo(300, '2026-11-20'), titulo(700, '2026-12-20')];
  const { resultado } = await criarOperacao(api, { titulos });

  // Um título foi compensado — não pode ser apagado nem reescrito.
  const alvo = api.colecoes.Cheque.docs[0];
  alvo.status = 'compensado';
  alvo.compensation_token = 'tok-1';

  const form = formCom();
  const calcMode = 'inverso';
  const sobrou = [titulo(700, '2026-12-20')]; // usuário removeu o título compensado
  const resumo = resumoFinanceiro({ titulos: sobrou, form, calcMode });
  const ctx = ctxDe(form, calcMode);
  const payload = montarPayloadOperacao({ resumo, form, ctx, editando: true });
  const desejados = montarTitulosCheque({ resumo, ctx, operationId: resultado.operationId });

  const bloqueado = await salvarOperacao(api, { operacaoId: resultado.operationId, payload, desejados });

  assert.ok(bloqueado.bloqueio, 'a edição é recusada com mensagem');
  assert.equal(api.colecoes.Cheque.docs.length, 2, 'nenhum título com efeito foi removido');
  assert.equal(api.colecoes.Cheque.docs.find((c) => c.compensation_token === 'tok-1').status, 'compensado');
});

test('M4.10b — plano recusa reescrever termos de título com efeito', () => {
  const existente = { id: 'c1', check_number: 'TIT-1', status: 'devolvido', valor_face: 300, compensation_date: '2026-11-20' };
  const plano = planoDeTitulos([existente], [{ check_number: 'TIT-1', valor_face: 999, compensation_date: '2026-11-20' }]);
  assert.ok(plano.bloqueio);
  assert.equal(plano.atualizar.length, 0);
});

/* ── 11. edição não escreve campos financeiros ──────────────────────────── */

test('M4.11 — payload de edição omite os campos do recebimento (M2/M3)', () => {
  const form = formCom();
  const titulos = [titulo(500, '2026-11-20')];
  const resumo = resumoFinanceiro({ titulos, form, calcMode: 'inverso' });
  const ctx = ctxDe(form, 'inverso');

  const criacao = montarPayloadOperacao({ resumo, form, ctx, editando: false, numeroOperacao: 7 });
  // O estado inicial é do SERVIDOR (`operacaoEditar` recusa etapa/status no
  // corpo): mandá-los fazia a criação inteira falhar com 403.
  assert.equal('etapa' in criacao, false, 'criação não envia etapa');
  assert.equal('status' in criacao, false, 'criação não envia status');
  assert.equal(criacao.numero_operacao, 7);
  assert.equal(criacao.amount_paid, 0);

  const edicao = montarPayloadOperacao({ resumo, form, ctx, editando: true });
  for (const campo of ['amount_paid', 'cheques_compensados_total', 'realized_profit', 'receipt_keys', 'taxa_incorporada_eventos', 'etapa', 'numero_operacao']) {
    assert.equal(campo in edicao, false, `edição não deve escrever ${campo}`);
  }
});

/* ── 12. compatibilidade com o M3 ──────────────────────────────────────── */

test('M4.12 — recebimento do M3 aplica sobre operação criada pelo wizard', async () => {
  const api = criarApi();
  const form = formCom();
  const titulos = [titulo(1000, '2026-11-20')];
  const resumo = resumoFinanceiro({ titulos, form, calcMode: 'inverso' });
  const ctx = ctxDe(form, 'inverso');
  const numeroOperacao = await proximoNumeroOperacao(api);
  const payload = montarPayloadOperacao({ resumo, form, ctx, editando: false, numeroOperacao });
  const desejados = montarTitulosCheque({ resumo, ctx, operationId: '' });
  const criada = await salvarOperacao(api, { operacaoId: '', payload, desejados });

  const r = await registrarRecebimento(api, {
    chave: 'manual:m4-teste',
    operationId: criada.operationId,
    origem: 'manual',
    data: '2026-10-21',
    valorRecebido: 400,
    metodo: 'pix',
    observacao: '',
  });

  assert.equal(r.ok, true, r.erro);
  const op = api.colecoes.Operation.achar(criada.operationId);
  assert.equal(op.amount_paid, 400);
  assert.equal(op.balance_due, round2(op.total_receivable - 400));
  assert.equal(op.status, 'ativo');
  assert.equal(op.receipt_keys.length, 1);
});

/* ── 13. numeração ──────────────────────────────────────────────────────── */

test('M4.13 — próximo número usa o maior existente, não os mais recentes', async () => {
  const api = criarApi();
  api.colecoes.Operation.docs.push({ id: 'a', numero_operacao: 42 });
  api.colecoes.Operation.docs.push({ id: 'b', numero_operacao: 7 });
  api.colecoes.Operation.docs.push({ id: 'c', numero_operacao: 19 });
  assert.equal(await proximoNumeroOperacao(api), 43);
});