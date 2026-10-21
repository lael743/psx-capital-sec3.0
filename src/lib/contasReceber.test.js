/**
 * M6.2.2 — Testes do serviço de consulta de Contas a Receber.
 * Fixtures isoladas: nenhum teste toca entidade, banco ou o cliente da plataforma.
 *
 * Testes 1–15 e "extra" vieram do M6.2. Os que mudaram de contrato no M6.2.2 estão
 * marcados com o motivo (fusão por valor desativada, recebimento exige crédito E
 * lançamento, alertas não tornam o título inconsistente).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  montarContasReceber,
  classificarTitulo,
  filtrarTitulos,
  contagemOculta,
  ordenarPorVencimento,
  opcoesDeFiltro,
  carregarContasReceber,
  avaliarEvidencias,
  buscarTudo,
  SITUACAO,
} from './contasReceber.js';
import { chaveDoCredito } from './chequeEventFlow.js';

const HOJE = '2026-10-21';

const operacao = (over = {}) => ({
  id: 'op-1',
  numero_operacao: 1,
  client_name: 'Cedente Alfa',
  sacado_name: 'Sacado Beta',
  type: 'cheque',
  status: 'ativo',
  etapa: 'finalizada',
  balance_due: 5000,
  installments: 1,
  installment_schedule: [],
  ...over,
});

const cheque = (over = {}) => ({
  id: 'ch-1',
  operation_id: 'op-1',
  client_name: 'Cedente Alfa',
  sacado_name: 'Sacado Beta',
  check_number: '001',
  tipo: 'cheque',
  status: 'pendente',
  valor_face: 1000,
  value: 1000,
  compensation_date: '2026-11-20',
  ...over,
});

const parcela = (over = {}) => ({
  id: 'titulo-1',
  number: 1,
  value: 1000,
  due_date: '2026-11-20',
  status: 'pendente',
  paid: false,
  ...over,
});

const banco = (over = {}) => ({
  id: 'bk-1',
  name: 'ASAAS',
  current_balance: 0,
  applied_ledger_keys: [],
  ...over,
});

const lancamento = (over = {}) => ({
  id: 'cf-1',
  source_type: 'cheque_compensacao',
  source_id: 'ch-1#tok-1',
  category: 'compensacao_cheque',
  amount: 1000,
  date: '2026-10-20',
  type: 'entrada',
  ...over,
});

/** Evidência já calculada (equivalente ao que `avaliarEvidencias` devolve). */
const evidenciaCompensacao = (over = {}) => ({
  tipo: 'compensacao',
  estado: 'completo',
  saldo_aplicado: true,
  lancamento_existe: true,
  chave: 'cheque_compensacao:ch-1#tok-1',
  token_proprio: true,
  conta_id: 'bk-1',
  conta_conferida: true,
  estorno: false,
  ...over,
});

const evidenciaResolucao = (over = {}) => ({
  tipo: 'resolucao',
  estado: 'completo',
  saldo_aplicado: true,
  lancamento_existe: true,
  chave: 'resolucao_cheque:ch-1',
  substituto_id: null,
  conta_id: 'bk-1',
  conta_conferida: true,
  ...over,
});

const montar = (cheques = [], operacoes = [], payments = [], extras = {}) =>
  montarContasReceber({ cheques, operations: operacoes, payments, ...extras }, { hoje: HOJE });

const classificar = (dados) => classificarTitulo({ status: 'pendente', ...dados }, HOJE);

// 1) Título em Cheque com parcela correspondente — agora exige prova do núcleo
test('1. título com parcela quitada e crédito comprovado é recebido', () => {
  const resultado = montar(
    [cheque({ status: 'compensado', compensation_token: 'tok-1', compensated_at: '2026-10-20' })],
    [operacao({ installment_schedule: [parcela({ paid: true, settled_by: 'ch-1', status: 'pago' })] })],
    [],
    { evidencias: { 'ch-1': evidenciaCompensacao() } },
  );
  assert.equal(resultado.linhas.length, 1, 'o vínculo comprovado funde a parcela no título');
  const [linha] = resultado.linhas;
  assert.equal(linha.origem, 'cheque');
  assert.equal(linha.vinculo, 'comprovado');
  assert.equal(linha.situacao, SITUACAO.RECEBIDO);
  assert.equal(linha.recebimento_estado, 'comprovado');
  assert.equal(linha.agenda_ref.numero, 1);
  assert.equal(linha.inconsistente, false);
});

// 2) Parcela sem título correspondente
test('2. parcela da agenda sem título correspondente é exibida como alternativa', () => {
  const resultado = montar([], [operacao({ installment_schedule: [parcela()] })]);
  assert.equal(resultado.linhas.length, 1);
  const [linha] = resultado.linhas;
  assert.equal(linha.origem, 'agenda');
  assert.equal(linha.vinculo, null);
  assert.equal(linha.situacao, SITUACAO.A_VENCER);
  assert.equal(linha.valor_face, 1000);
});

// 3) Dois títulos com valores distintos — M6.2.2: não funde por valor
test('3. dois títulos com valores distintos permanecem quatro registros separados', () => {
  const resultado = montar(
    [
      cheque({ id: 'ch-1', check_number: '001', valor_face: 1000 }),
      cheque({ id: 'ch-2', check_number: '002', valor_face: 2000 }),
    ],
    [
      operacao({
        installments: 2,
        installment_schedule: [
          parcela({ id: 'titulo-1', value: 1000 }),
          parcela({ id: 'titulo-2', number: 2, value: 2000 }),
        ],
      }),
    ],
  );
  assert.equal(resultado.linhas.length, 4);
  assert.deepEqual(resultado.linhas.map((l) => l.origem), ['cheque', 'cheque', 'agenda', 'agenda']);
  assert.ok(resultado.linhas.every((l) => l.vinculo === 'possivel'));
  assert.ok(resultado.linhas.every((l) => l.agenda_ref === null));
  assert.ok(resultado.linhas.every((l) => l.inconsistente === false));
});

// 4) Vencimento igual e valores diferentes
test('4. mesmo vencimento com valores diferentes não funde por data', () => {
  const resultado = montar(
    [
      cheque({ id: 'ch-1', check_number: '001', valor_face: 1000 }),
      cheque({ id: 'ch-2', check_number: '002', valor_face: 2000, compensation_date: '2026-12-20' }),
    ],
    [
      operacao({
        installments: 2,
        installment_schedule: [
          parcela({ id: 'titulo-1', value: 1000 }),
          parcela({ id: 'titulo-2', number: 2, value: 2000, due_date: '2026-11-20' }),
        ],
      }),
    ],
  );
  assert.equal(resultado.linhas.length, 4);
  const segundo = resultado.linhas.find((l) => l.registro_id === 'ch-2');
  assert.equal(segundo.vinculo, 'possivel');
  assert.ok(segundo.alertas.some((m) => m.includes('Possível correspondência')));
  assert.equal(segundo.inconsistente, false, 'indício não é inconsistência');
});

// 4b) mesmo valor repetido → registros separados com indício de conciliação
test('4b. valor repetido na operação não funde registros silenciosamente', () => {
  const resultado = montar(
    [cheque({ id: 'ch-1', check_number: '001' }), cheque({ id: 'ch-2', check_number: '002' })],
    [
      operacao({
        installments: 2,
        installment_schedule: [parcela({ id: 'titulo-1' }), parcela({ id: 'titulo-2', number: 2 })],
      }),
    ],
  );
  assert.equal(resultado.linhas.length, 4);
  assert.equal(resultado.resumo.inconsistente, 0);
  assert.equal(resultado.resumo.com_alerta, 4);
  assert.ok(resultado.linhas.every((l) => l.alertas.some((m) => m.includes('Possível correspondência'))));
  assert.ok(resultado.linhas.every((l) => l.vinculo === 'possivel' || l.origem === 'agenda'));
});

// 5) Número de título ausente ou repetido
test('5. número de título ausente ou repetido não derruba a consulta', () => {
  const semNumero = montar([cheque({ id: 'ch-1', check_number: null })], [operacao()]);
  assert.equal(semNumero.linhas.length, 1);
  assert.equal(semNumero.linhas[0].numero, null);
  assert.equal(semNumero.linhas[0].identidade, 'ch-1');

  const repetido = montar(
    [],
    [
      operacao({
        installments: 2,
        installment_schedule: [
          parcela({ id: null, number: 1, value: 1000 }),
          parcela({ id: null, number: 1, value: 900, due_date: '2026-12-20' }),
        ],
      }),
    ],
  );
  assert.equal(repetido.linhas.length, 2);
  assert.equal(new Set(repetido.linhas.map((l) => l.identidade)).size, 2);
});

// 6) Parcela sem `id`
test('6. parcela sem id usa identidade derivada e sinaliza a ausência', () => {
  const resultado = montar([], [operacao({ installment_schedule: [parcela({ id: null, number: 2, value: 500, due_date: '2026-11-01' })] })]);
  const [linha] = resultado.linhas;
  assert.equal(linha.origem, 'agenda');
  assert.equal(linha.registro_id, null);
  assert.equal(linha.identidade, 'legacy:2026-11-01|500|2');
  assert.ok(linha.alertas.some((m) => m.includes('sem identidade própria')));
});

// 7) Título sem valor de face
test('7. título sem valor de face permanece indisponível, nunca zero', () => {
  const resultado = montar([cheque({ id: 'ch-1', valor_face: null, value: null })], [operacao()]);
  const [linha] = resultado.linhas;
  assert.equal(linha.valor_face, null);
  assert.ok(linha.alertas.some((m) => m.includes('Valor de face ausente')));
  assert.equal(resultado.resumo.por_situacao[SITUACAO.A_VENCER].valor, 0);
});

// 8) Compensado sem nenhuma identidade de evento é contraditório
test('8. compensado sem token e sem data é inconsistente, não recebido', () => {
  const resultado = montar([cheque({ id: 'ch-1', status: 'compensado' })], [operacao()]);
  const [linha] = resultado.linhas;
  assert.equal(linha.situacao, SITUACAO.INCONSISTENTE);
  assert.equal(linha.recebimento_comprovado, false);
  assert.ok(linha.bloqueios.some((m) => m.includes('sem prova de crédito')));
});

// 9) Título devolvido sem resolução M2
test('9. devolvido sem resolução fica devolvido; com resolução é contraditório', () => {
  const semResolucao = montar([cheque({ id: 'ch-1', status: 'devolvido', return_reason: 'sem fundos' })], [operacao()]);
  assert.equal(semResolucao.linhas[0].situacao, SITUACAO.DEVOLVIDO);

  const contraditorio = montar([cheque({ id: 'ch-1', status: 'devolvido', resolucao_evento: 'resolucao_cheque:ch-1' })], [operacao()]);
  assert.equal(contraditorio.linhas[0].situacao, SITUACAO.INCONSISTENTE);
});

// 10) Título resolvido com substituição
test('10. resolvido por substituição é resolvido quando há evento comprovado', () => {
  const resultado = montar(
    [
      cheque({ id: 'ch-1', status: 'resolvido_substituido', resolucao_evento: 'resolucao_cheque:ch-1' }),
      cheque({ id: 'ch-2', check_number: '002', status: 'pendente', substitui_cheque_id: 'ch-1', compensation_date: '2026-12-05' }),
    ],
    [operacao()],
  );
  const resolvido = resultado.linhas.find((l) => l.registro_id === 'ch-1');
  assert.equal(resolvido.situacao, SITUACAO.RESOLVIDO);
  assert.equal(resolvido.inconsistente, false);
  assert.equal(resultado.linhas.length, 2);
});

// 11) Cobrança Asaas pendente sem recebimento (a cobrança pertence à parcela)
test('11. cobrança Asaas pendente é "em cobrança", não recebido', () => {
  const resultado = montar(
    [cheque({ id: 'ch-1' })],
    [operacao({ installment_schedule: [parcela({ asaas_payment_id: 'pay_1', asaas_payment_status: 'pending' })] })],
  );
  const agenda = resultado.linhas.find((l) => l.origem === 'agenda');
  assert.equal(agenda.situacao, SITUACAO.EM_COBRANCA);
  assert.equal(agenda.recebimento_comprovado, false);
  assert.equal(agenda.cobranca.id, 'pay_1');
  const titulo = resultado.linhas.find((l) => l.origem === 'cheque');
  assert.equal(titulo.cobranca, null, 'cobrança não é atribuída por inferência');
});

// 12) Operação quitada sem evidência individual de recebimento
test('12. operação quitada não torna o título recebido', () => {
  const resultado = montar([cheque({ id: 'ch-1' })], [operacao({ status: 'quitado' })]);
  const [linha] = resultado.linhas;
  assert.equal(linha.situacao, SITUACAO.A_VENCER);
  assert.equal(linha.recebimento_comprovado, false);
  assert.ok(linha.alertas.some((m) => m.includes('Operação quitada sem evidência individual')));
});

// 13) Dados contraditórios entre título, parcela e operação
test('13. contradição entre agenda, título e operação é sinalizada', () => {
  const resultado = montar(
    [cheque({ id: 'ch-1' })],
    [operacao({ installment_schedule: [parcela({ paid: true, settled_by: 'ch-inexistente', status: 'pago' })] })],
  );
  assert.equal(resultado.linhas.length, 2);
  const agenda = resultado.linhas.find((l) => l.origem === 'agenda');
  assert.equal(agenda.situacao, SITUACAO.INCONSISTENTE);
  assert.ok(agenda.bloqueios.some((m) => m.includes('título inexistente')));
  const titulo = resultado.linhas.find((l) => l.origem === 'cheque');
  assert.equal(titulo.vinculo, null);
  assert.equal(titulo.situacao, SITUACAO.A_VENCER);
});

// 14) Lista vazia, erro de consulta e filtros
test('14. lista vazia, erro de consulta e filtros', async () => {
  const vazio = montar();
  assert.equal(vazio.linhas.length, 0);
  assert.equal(vazio.resumo.total, 0);
  assert.deepEqual(opcoesDeFiltro(vazio.linhas), { clientes: [], sacados: [], tipos: [] });

  await assert.rejects(
    () =>
      carregarContasReceber({
        entities: {
          Cheque: { filter: async () => { throw new Error('falha de leitura'); } },
          Operation: { filter: async () => [] },
          Payment: { filter: async () => [] },
        },
      }),
    /falha de leitura/,
  );

  const resultado = montar(
    [
      cheque({ id: 'ch-1', check_number: '001', client_name: 'Cedente Alfa', compensation_date: '2026-10-01' }),
      cheque({ id: 'ch-2', check_number: '777', client_name: 'Cedente Gama', tipo: 'boleto', valor_face: 2000 }),
    ],
    [operacao({ client_name: 'Cedente Alfa' })],
  );
  assert.equal(filtrarTitulos(resultado.linhas, { situacao: SITUACAO.VENCIDO }).length, 1);
  assert.equal(filtrarTitulos(resultado.linhas, { cliente: 'Cedente Gama' }).length, 1);
  assert.equal(filtrarTitulos(resultado.linhas, { tipo: 'boleto' }).length, 1);
  assert.equal(filtrarTitulos(resultado.linhas, { origem: 'cheque' }).length, 2);
  assert.equal(filtrarTitulos(resultado.linhas, { busca: '777' }).length, 1);
  assert.equal(filtrarTitulos(resultado.linhas, { de: '2026-12-01' }).length, 0);

  const ordenado = ordenarPorVencimento(resultado.linhas, 'asc');
  assert.equal(ordenado[0].registro_id, 'ch-1');
  assert.equal(ordenarPorVencimento(resultado.linhas, 'desc')[0].registro_id, 'ch-2');
});

// 15) Datas no limite entre vencido e a vencer
test('15. vencimento igual a hoje é a vencer; o dia anterior é vencido', () => {
  assert.equal(classificar({ vencimento: HOJE }).situacao, SITUACAO.A_VENCER);
  assert.equal(classificar({ vencimento: '2026-10-20' }).situacao, SITUACAO.VENCIDO);
  assert.equal(classificar({ vencimento: '2026-10-22' }).situacao, SITUACAO.A_VENCER);
  assert.equal(classificar({ vencimento: null }).situacao, SITUACAO.INCONSISTENTE);
});

// Extra) o montador não altera os dados recebidos
test('extra. montagem é somente leitura e não muta as fixtures', () => {
  const cheques = [cheque({ id: 'ch-1' })];
  const operacoes = [operacao({ installment_schedule: [parcela()] })];
  const antes = JSON.stringify({ cheques, operacoes });
  montar(cheques, operacoes);
  assert.equal(JSON.stringify({ cheques, operacoes }), antes);
});

/* ────────────────────────────────────────────────────────────────────────────
 * M6.2.2 — REGRESSÃO DA CONFIABILIDADE (P0, P1 e paginação)
 * ──────────────────────────────────────────────────────────────────────────── */

const compensado = (over = {}) =>
  cheque({
    status: 'compensado',
    compensation_token: 'tok-1',
    compensated_at: '2026-10-20',
    deposited_bank_id: 'bk-1',
    ...over,
  });

test('16. compensado com crédito na conta e lançamento é recebido comprovado', async () => {
  const dados = {
    cheques: [compensado()],
    operations: [operacao()],
    bancos: [banco({ applied_ledger_keys: [chaveDoCredito('ch-1', 'tok-1')] })],
    cashflows: [lancamento()],
  };
  const evidencias = await avaliarEvidencias(dados);
  assert.equal(evidencias['ch-1'].estado, 'completo');

  const resultado = montar(dados.cheques, dados.operations, [], { evidencias });
  const [linha] = resultado.linhas;
  assert.equal(linha.situacao, SITUACAO.RECEBIDO);
  assert.equal(linha.recebimento_estado, 'comprovado');
  assert.equal(linha.evidencia_label, 'crédito na conta + lançamento de caixa');
});

test('17. compensado com token mas sem a chave na conta fica a confirmar', async () => {
  const dados = {
    cheques: [compensado()],
    operations: [operacao()],
    bancos: [banco({ applied_ledger_keys: [] })],
    cashflows: [lancamento()],
  };
  const evidencias = await avaliarEvidencias(dados);
  const resultado = montar(dados.cheques, dados.operations, [], { evidencias });
  const [linha] = resultado.linhas;
  assert.equal(evidencias['ch-1'].estado, 'lancamento_sem_saldo');
  assert.equal(linha.situacao, SITUACAO.A_CONFIRMAR);
  assert.equal(linha.recebimento_comprovado, false);
  assert.equal(linha.inconsistente, false, 'ausência de chave não é contradição');
  assert.ok(linha.alertas.some((m) => m.includes('não consta na conta')));
});

test('18. chave bancária de outro cheque não comprova o recebimento', async () => {
  const dados = {
    cheques: [compensado()],
    operations: [operacao()],
    bancos: [banco({ applied_ledger_keys: [chaveDoCredito('ch-outro', 'tok-9')] })],
    cashflows: [lancamento()],
  };
  const evidencias = await avaliarEvidencias(dados);
  const resultado = montar(dados.cheques, dados.operations, [], { evidencias });
  assert.equal(resultado.linhas[0].situacao, SITUACAO.A_CONFIRMAR);
  assert.equal(resultado.linhas[0].recebimento_comprovado, false);
});

test('19. compensação legada (sem token) usa a data e fica a confirmar', async () => {
  const dados = {
    cheques: [cheque({ status: 'compensado', compensated_at: '2026-10-20' })],
    operations: [operacao()],
    bancos: [banco({ applied_ledger_keys: [] })],
    cashflows: [],
  };
  const evidencias = await avaliarEvidencias(dados);
  const resultado = montar(dados.cheques, dados.operations, [], { evidencias });
  const [linha] = resultado.linhas;
  assert.equal(evidencias['ch-1'].token_proprio, false);
  assert.equal(linha.situacao, SITUACAO.A_CONFIRMAR);
  assert.ok(linha.alertas.some((m) => m.includes('Compensação legada')));
});

test('20. resolução M2 com crédito e lançamento é resolvida com prova', async () => {
  const dados = {
    cheques: [
      cheque({
        status: 'resolvido_pago',
        resolucao_evento: 'resolucao_cheque:ch-1',
        resolucao_bank_id: 'bk-1',
        value: 1000,
      }),
    ],
    operations: [operacao()],
    bancos: [banco({ applied_ledger_keys: ['resolucao_cheque:ch-1'] })],
    cashflows: [
      lancamento({ id: 'cf-2', source_type: 'recebimento_cheque_devolvido', source_id: 'resolucao_cheque:ch-1' }),
    ],
  };
  const evidencias = await avaliarEvidencias(dados);
  const resultado = montar(dados.cheques, dados.operations, [], { evidencias });
  const [linha] = resultado.linhas;
  assert.equal(evidencias['ch-1'].estado, 'completo');
  assert.equal(linha.situacao, SITUACAO.RESOLVIDO);
  assert.equal(linha.recebimento_comprovado, true);
  assert.equal(resultado.resumo.por_situacao[SITUACAO.RESOLVIDO].quantidade, 1);
});

test('21. resolução M2 sem efeito financeiro fica a confirmar, não recebida', async () => {
  const dados = {
    cheques: [cheque({ status: 'resolvido_pago', resolucao_evento: 'resolucao_cheque:ch-1', resolucao_bank_id: 'bk-1' })],
    operations: [operacao()],
    bancos: [banco({ applied_ledger_keys: [] })],
    cashflows: [],
  };
  const evidencias = await avaliarEvidencias(dados);
  const resultado = montar(dados.cheques, dados.operations, [], { evidencias });
  const [linha] = resultado.linhas;
  assert.equal(linha.situacao, SITUACAO.A_CONFIRMAR);
  assert.equal(linha.resolucao_estado, 'inconclusivo');
  assert.equal(linha.recebimento_comprovado, false);
  assert.equal(resultado.resumo.por_situacao[SITUACAO.RESOLVIDO].quantidade, 0);
});

test('22. recebimento manual da operação não vira parcela recebida nem vencida', () => {
  const resultado = montar(
    [],
    [operacao({ installment_schedule: [parcela({ value: 1000, due_date: '2026-10-01' })] })],
    [{ id: 'pg-1', operation_id: 'op-1', amount: 1000, payment_date: '2026-10-05', method: 'pix' }],
  );
  const [linha] = resultado.linhas;
  assert.equal(linha.situacao, SITUACAO.A_CONFIRMAR);
  assert.equal(linha.recebimento_comprovado, false);
  assert.ok(linha.alertas.some((m) => m.includes('recebimento agregado')));
  assert.equal(resultado.resumo.recebimentos.manuais.eventos, 1);
  assert.equal(resultado.resumo.recebimentos.manuais.total, 1000);
});

test('23. evento Asaas contabilizado sem vínculo não é alocado a título', () => {
  const resultado = montar(
    [],
    [operacao({ installment_schedule: [parcela({ value: 1000, due_date: '2026-10-01' })] })],
    [],
    {
      asaasEventos: [
        { id: 'ev-1', event_key: 'pay_1', operation_id: 'op-1', value: 1000, status: 'contabilizado' },
      ],
    },
  );
  const [linha] = resultado.linhas;
  assert.equal(linha.situacao, SITUACAO.A_CONFIRMAR);
  assert.equal(linha.recebimento_comprovado, false);
  assert.ok(linha.alertas.some((m) => m.includes('recebimento agregado')));
});

test('24. evento Asaas duplicado não é somado duas vezes', () => {
  const resultado = montar([], [operacao()], [], {
    asaasEventos: [
      { id: 'ev-1', event_key: 'pay_1', operation_id: 'op-1', value: 1000, status: 'contabilizado' },
      { id: 'ev-2', event_key: 'pay_1', operation_id: 'op-1', value: 1000, status: 'contabilizado' },
    ],
  });
  assert.equal(resultado.resumo.recebimentos.asaas.eventos, 1);
  assert.equal(resultado.resumo.recebimentos.asaas.total, 1000);
  assert.equal(resultado.resumo.recebimentos.asaas.duplicados, 1);
});

test('25. título cancelado ou substituído não absorve parcela em aberto', () => {
  const resultado = montar(
    [cheque({ id: 'ch-1', status: 'cancelado' })],
    [operacao({ installment_schedule: [parcela({ value: 1000, due_date: '2026-12-01' })] })],
  );
  assert.equal(resultado.linhas.length, 2, 'nenhum recebível é ocultado');
  const titulo = resultado.linhas.find((l) => l.origem === 'cheque');
  const agenda = resultado.linhas.find((l) => l.origem === 'agenda');
  assert.equal(titulo.situacao, SITUACAO.CANCELADO);
  assert.equal(agenda.situacao, SITUACAO.A_VENCER);
  assert.equal(agenda.vinculo, null);
  assert.equal(agenda.recebimento_comprovado, false);
});

test('26. TIT-n com valor divergente não vincula', () => {
  const resultado = montar(
    [cheque({ id: 'ch-1', check_number: 'TIT-1', valor_face: 500 })],
    [operacao({ installment_schedule: [parcela({ id: 'titulo-1', number: 1, value: 1000 })] })],
  );
  assert.equal(resultado.linhas.length, 2);
  const titulo = resultado.linhas.find((l) => l.origem === 'cheque');
  assert.equal(titulo.vinculo, 'possivel');
  assert.equal(titulo.agenda_ref, null);
  assert.ok(titulo.alertas.some((m) => m.includes('o valor difere')));
});

test('27. TIT-n com vencimento divergente não vincula', () => {
  const resultado = montar(
    [cheque({ id: 'ch-1', check_number: 'TIT-1', valor_face: 1000, compensation_date: '2026-12-15' })],
    [operacao({ installment_schedule: [parcela({ id: 'titulo-1', number: 1, value: 1000, due_date: '2026-11-20' })] })],
  );
  assert.equal(resultado.linhas.length, 2);
  const titulo = resultado.linhas.find((l) => l.origem === 'cheque');
  assert.equal(titulo.vinculo, 'possivel');
  assert.ok(titulo.alertas.some((m) => m.includes('o vencimento difere')));
});

test('27b. TIT-n com valor e vencimento compatíveis vincula pelo identificador', () => {
  const resultado = montar(
    [cheque({ id: 'ch-1', check_number: 'TIT-1', valor_face: 1000, compensation_date: '2026-11-20' })],
    [operacao({ installment_schedule: [parcela({ id: 'titulo-1', number: 1, value: 1000, due_date: '2026-11-20' })] })],
  );
  assert.equal(resultado.linhas.length, 1);
  assert.equal(resultado.linhas[0].vinculo, 'identificador');
  assert.equal(resultado.linhas[0].grau_vinculo, 'identificador');
});

test('28. correspondência inferida ambígua mantém todos os registros separados', () => {
  const resultado = montar(
    [cheque({ id: 'ch-1', valor_face: 1000 }), cheque({ id: 'ch-2', check_number: '002', valor_face: 1000 })],
    [
      operacao({
        installments: 2,
        installment_schedule: [
          parcela({ id: 'titulo-1', value: 1000 }),
          parcela({ id: 'titulo-2', number: 2, value: 1000 }),
        ],
      }),
    ],
  );
  assert.equal(resultado.linhas.length, 4);
  assert.equal(resultado.resumo.inconsistente, 0);
  assert.ok(resultado.linhas.every((l) => l.agenda_ref === null));
  assert.ok(resultado.linhas.every((l) => l.alertas.some((m) => m.includes('Possível correspondência'))));
});

test('29. identidade repetida na paginação é deduplicada', async () => {
  // Página cheia (500) cujo deslocamento não avança: a segunda página repete a
  // primeira. O carregamento precisa parar, deduplicar e declarar a limitação.
  const registros = Array.from({ length: 500 }, (_, i) => ({ id: `ch-${i}` }));
  const api = {
    entities: {
      Cheque: { filter: async () => registros },
    },
  };
  const resultado = await buscarTudo(api, 'Cheque', '-created_date');
  assert.equal(resultado.registros.length, 500);
  assert.equal(new Set(resultado.registros.map((r) => r.id)).size, 500);
  assert.equal(resultado.limitacao, 'deslocamento_instavel', 'a repetição vira limitação explícita');
});

test('30. consulta incompleta impede classificação por unicidade e não inventa contradição', async () => {
  const api = {
    entities: {
      Cheque: { filter: async () => [{ id: 'ch-1', operation_id: 'op-1', status: 'pendente' }] },
      Operation: { filter: async () => [operacao({ installment_schedule: [parcela({ paid: true, settled_by: 'ch-ausente' })] })] },
      Payment: { filter: async () => [] },
      Banco: { filter: async () => { throw new Error('sem acesso'); } },
      CashFlow: { filter: async () => [] },
      AsaasEvento: { filter: async () => [] },
    },
  };
  const resultado = await carregarContasReceber(api);
  assert.equal(resultado.completude.confiavel, true);
  const agenda = resultado.linhas.find((l) => l.origem === 'agenda');
  // A base de cheques veio completa: a referência ausente é contradição real.
  assert.ok(agenda.bloqueios.some((m) => m.includes('inexistente')));
  assert.ok(resultado.limitacoes.some((m) => m.includes('Contas bancárias indisponíveis')));

  const incompleta = montar(
    [cheque({ id: 'ch-1' })],
    [operacao({ installment_schedule: [parcela({ paid: true, settled_by: 'ch-ausente' })] })],
    [],
    { },
  );
  assert.ok(incompleta.linhas.length === 2);

  const comRisco = montarContasReceber(
    {
      cheques: [cheque({ id: 'ch-1' })],
      operations: [operacao({ installment_schedule: [parcela({ paid: true, settled_by: 'ch-ausente' })] })],
    },
    { hoje: HOJE, completude: { confiavel: false, motivos: ['Cheque: deslocamento_instavel'] } },
  );
  const agendaRisco = comRisco.linhas.find((l) => l.origem === 'agenda');
  assert.equal(agendaRisco.situacao, SITUACAO.A_CONFIRMAR);
  assert.equal(agendaRisco.inconsistente, false);
  assert.ok(agendaRisco.alertas.some((m) => m.includes('não veio na consulta')));
});

test('30b. erro de página interrompe a consulta em vez de publicar resultado parcial', async () => {
  const api = {
    entities: {
      Cheque: { filter: async () => { throw new Error('falha de página'); } },
      Operation: { filter: async () => [] },
      Payment: { filter: async () => [] },
    },
  };
  await assert.rejects(() => carregarContasReceber(api), /falha de página/);
});

test('31. indicadores distinguem inconsistências de simples alertas', () => {
  const resultado = montar(
    [
      cheque({ id: 'ch-1', valor_face: 1000 }),
      cheque({ id: 'ch-2', check_number: '002', valor_face: 1000 }),
      cheque({ id: 'ch-3', check_number: '003', status: 'compensado' }),
    ],
    [operacao({ installment_schedule: [parcela({ value: 1000 })] })],
  );
  assert.equal(resultado.linhas.length, 4);
  assert.equal(resultado.resumo.inconsistente, 1, 'só o compensado sem identidade é inconsistência');
  assert.ok(resultado.resumo.com_alerta >= 3);
  assert.equal(resultado.resumo.alertas_sem_bloqueio, resultado.resumo.com_alerta - 1);

  const semFiltro = resultado.linhas.length;
  const filtradas = filtrarTitulos(resultado.linhas, { situacao: SITUACAO.A_VENCER });
  assert.ok(filtradas.length < semFiltro);
  const ocultos = contagemOculta(resultado.linhas, filtradas);
  assert.equal(ocultos.inconsistentes, 1);
  assert.equal(filtrarTitulos(resultado.linhas, { situacao: SITUACAO.INCONSISTENTE }).length, 1);
});