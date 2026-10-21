/**
 * M6.2 — Testes do serviço de consulta de Contas a Receber.
 * Fixtures isoladas: nenhum teste toca entidade, banco ou o cliente da plataforma.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  montarContasReceber,
  classificarTitulo,
  filtrarTitulos,
  ordenarPorVencimento,
  opcoesDeFiltro,
  carregarContasReceber,
  SITUACAO,
} from './contasReceber.js';

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

const montar = (cheques = [], operacoes = [], payments = []) =>
  montarContasReceber({ cheques, operations: operacoes, payments }, { hoje: HOJE });

const porRegistro = (resultado, registroId) => resultado.linhas.filter((l) => l.registro_id === registroId);

const classificar = (dados) => classificarTitulo({ status: 'pendente', ...dados }, HOJE);

// 1) Título em Cheque com parcela correspondente na agenda
test('1. título em Cheque com parcela correspondente não duplica a linha', () => {
  const resultado = montar(
    [cheque({ status: 'compensado', compensation_token: 'tok-1' })],
    [operacao({ installment_schedule: [parcela({ paid: true, settled_by: 'ch-1', status: 'pago' })] })],
  );
  assert.equal(resultado.linhas.length, 1);
  const [linha] = resultado.linhas;
  assert.equal(linha.origem, 'cheque');
  assert.equal(linha.vinculo, 'comprovado');
  assert.equal(linha.situacao, SITUACAO.RECEBIDO);
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

// 3) Dois títulos com o mesmo vencimento
test('3. dois títulos no mesmo vencimento continuam sendo duas linhas', () => {
  const resultado = montar(
    [cheque({ id: 'ch-1', check_number: '001', valor_face: 1000 }), cheque({ id: 'ch-2', check_number: '002', valor_face: 2000 })],
    [operacao({ installments: 2, installment_schedule: [parcela({ id: 'titulo-1', value: 1000 }), parcela({ id: 'titulo-2', number: 2, value: 2000 })] })],
  );
  assert.equal(resultado.linhas.length, 2);
  assert.deepEqual(resultado.linhas.map((l) => l.origem), ['cheque', 'cheque']);
  assert.deepEqual(resultado.linhas.map((l) => l.vinculo), ['inferido', 'inferido']);
  assert.deepEqual(resultado.linhas.map((l) => l.agenda_ref.numero).sort(), [1, 2]);
});

// 4) Vencimento igual e valores diferentes → casamento por valor, divergência sinalizada
test('4. mesmo vencimento com valores diferentes não funde por data', () => {
  const resultado = montar(
    [cheque({ id: 'ch-1', check_number: '001', valor_face: 1000 }), cheque({ id: 'ch-2', check_number: '002', valor_face: 2000, compensation_date: '2026-12-20' })],
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
  assert.equal(resultado.linhas.length, 2);
  const segundo = resultado.linhas.find((l) => l.registro_id === 'ch-2');
  assert.equal(segundo.vinculo, 'inferido');
  assert.equal(segundo.inconsistente, true);
  assert.ok(segundo.alertas.some((m) => m.includes('Vencimento difere')));
});

// 4b) mesmo vencimento e mesmo valor repetido → não funde, sinaliza conciliação pendente
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
  assert.equal(resultado.resumo.inconsistentes, 4);
  assert.ok(resultado.linhas.every((l) => l.situacao === SITUACAO.INCONSISTENTE));
  assert.ok(resultado.linhas.every((l) => l.bloqueios.some((m) => m.includes('Conciliação pendente'))));
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

// 8) Título compensado sem evidência financeira
test('8. compensado sem token de compensação é inconsistente, não recebido', () => {
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
      cheque({ id: 'ch-1', status: 'resolvido_substituido', resolucao_evento: 'resolucao_cheque:ch-1', substitui_cheque_id: 'ch-0' }),
      cheque({ id: 'ch-2', check_number: '002', status: 'pendente', substitui_cheque_id: 'ch-1', compensation_date: '2026-12-05' }),
    ],
    [operacao()],
  );
  const resolvido = resultado.linhas.find((l) => l.registro_id === 'ch-1');
  assert.equal(resolvido.situacao, SITUACAO.RESOLVIDO);
  assert.equal(resolvido.inconsistente, false);
  assert.equal(resultado.linhas.length, 2);
});

// 11) Cobrança Asaas pendente sem recebimento
test('11. cobrança Asaas pendente é "em cobrança", não recebido', () => {
  const resultado = montar(
    [cheque({ id: 'ch-1' })],
    [operacao({ installment_schedule: [parcela({ asaas_payment_id: 'pay_1', asaas_payment_status: 'pending' })] })],
  );
  const [linha] = resultado.linhas;
  assert.equal(linha.situacao, SITUACAO.EM_COBRANCA);
  assert.equal(linha.recebimento_comprovado, false);
  assert.equal(linha.cobranca.id, 'pay_1');
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