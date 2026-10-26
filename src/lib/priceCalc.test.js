/**
 * Parcelado (Tabela Price) — testes do motor, do resumo e do cronograma gravado.
 *
 * Cobre os cenários exigidos: parcelas iguais com vencimentos regulares e
 * irregulares, taxas/despesas adicionais, cálculo direto e inverso, soma das
 * parcelas, reconciliação do repasse e consistência entre tabela, resumo,
 * títulos e cronograma persistido.
 *
 * Fixtures puras: nenhum teste toca entidade, banco ou a plataforma.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cronogramaPriceOperacao, linhasPriceDeTitulos, rateioDespesas, datasParcelas,
} from './priceOperacao.js';
import { taxaDoPeriodo } from './formatosCalculo.js';
import { resumoFinanceiro, montarCronograma } from './operacaoCalc.js';
import { daysBetween } from './finance.js';

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const START = '2026-10-21';
const TAXA = 3;
const TIPO_JUROS = 'composto';

function titulosDe(linhas) {
  return linhas.map((l) => ({
    tipo: 'boleto',
    numero: `${l.numero}/${linhas.length}`,
    vencimento: l.vencimento,
    valor_face: String(l.face),
    valor_liquido: String(l.amortizacao),
    outras_despesas: String(l.despesa),
  }));
}

function formDe({ tarifaOperacao = 0, tarifaPorTitulo = 0 } = {}) {
  return {
    rate: TAXA,
    interest_type: TIPO_JUROS,
    start_date: START,
    float_dias: 0,
    tarifa_operacao: tarifaOperacao,
    tarifa_por_titulo: tarifaPorTitulo,
    arredondar_taxa_diaria: false,
  };
}

function facesIguais(linhas) {
  const base = linhas[0].face;
  return linhas.every((l) => Math.abs(l.face - base) <= 0.01);
}

// 1 ── parcelas iguais com vencimentos regulares
test('Price: parcelas de mesmo valor com vencimentos mensais', () => {
  const vencimentos = datasParcelas('2026-11-20', 30, 4);
  const { linhas, totais, repasse } = cronogramaPriceOperacao({
    vencimentos, startDate: START, taxaMensalPct: TAXA, interestType: TIPO_JUROS, repasse: 10000,
  });

  assert.equal(linhas.length, 4);
  assert.ok(facesIguais(linhas), 'todas as parcelas devem ter o mesmo valor de face');
  assert.equal(totais.amortizacao, 10000, 'a soma das amortizações é o valor presente');
  assert.equal(totais.liquido, 10000, 'sem despesas, o líquido total é o repasse');
  assert.equal(totais.face, round2(10000 + totais.juros), 'face = amortização + juros');
  assert.equal(repasse, 10000);

  linhas.forEach((l) => {
    assert.equal(l.face, round2(l.amortizacao + l.juros), 'face = amortização + juros em cada parcela');
  });

  // saldo amortizando: juros caem, amortização cresce — e a taxa de cada
  // período é aplicada sobre o saldo, com 3% a.m. em intervalos de 30 dias.
  assert.ok(Math.abs(linhas[0].juros - round2(10000 * 0.03)) <= 0.02, '1ª parcela paga 3% sobre o valor presente');
  for (let i = 1; i < linhas.length; i++) {
    assert.ok(linhas[i].juros < linhas[i - 1].juros, 'juros caem conforme o saldo amortiza');
    assert.ok(linhas[i].amortizacao > linhas[i - 1].amortizacao, 'amortização cresce');
  }
});

// 2 ── intervalos irregulares
test('Price: intervalos irregulares mantêm a parcela constante e os juros do período', () => {
  const vencimentos = ['2026-11-05', '2026-12-20', '2027-01-10', '2027-03-15'];
  const { linhas, totais } = cronogramaPriceOperacao({
    vencimentos, startDate: START, taxaMensalPct: TAXA, interestType: TIPO_JUROS, repasse: 8000,
  });

  assert.ok(facesIguais(linhas), 'a parcela não muda com o intervalo');
  assert.equal(totais.amortizacao, 8000);

  let saldo = 8000;
  let anterior = START;
  linhas.forEach((l) => {
    const decorridos = daysBetween(START, l.vencimento);
    const intervalo = daysBetween(anterior, l.vencimento);
    assert.equal(l.dias, decorridos, 'a coluna Dias mostra os dias decorridos');
    const jurosEsperado = round2(saldo * taxaDoPeriodo(TAXA, intervalo, TIPO_JUROS));
    assert.ok(Math.abs(l.juros - jurosEsperado) <= 0.02, `juros do período de ${intervalo} dias`);
    saldo = round2(saldo - l.amortizacao);
    anterior = l.vencimento;
  });
});

// 3 ── taxas e despesas adicionais (discriminadas, sem dupla cobrança)
test('Price: tarifas entram uma única vez e o líquido fecha com o repasse', () => {
  const vencimentos = datasParcelas('2026-11-20', 30, 4);
  const { linhas, totais, base } = cronogramaPriceOperacao({
    vencimentos, startDate: START, taxaMensalPct: TAXA, interestType: TIPO_JUROS,
    repasse: 10000, tarifaOperacao: 300, tarifaPorTitulo: 50,
  });

  assert.equal(totais.despesa, 500, '300 de tarifa fixa + 4 × 50 por título');
  assert.equal(base, 10000, 'o valor presente é o repasse: as tarifas não são financiadas');
  assert.equal(totais.amortizacao, 10000);
  assert.equal(totais.liquido, 10000, 'o cliente recebe exatamente o repasse solicitado');
  assert.ok(facesIguais(linhas));
  assert.equal(
    totais.face,
    round2(10000 + totais.juros + 500),
    'as tarifas são SOMADAS à face final (cobrança), não descontadas do líquido',
  );
  linhas.forEach((l) => {
    assert.equal(l.face, round2(l.amortizacao + l.juros + l.despesa), 'face = amortização + juros + tarifa da parcela');
    assert.equal(l.liquido, l.amortizacao, 'o líquido da parcela é o repasse, sem descontar tarifa');
  });

  const resumo = resumoFinanceiro({ titulos: titulosDe(linhas), form: formDe({ tarifaOperacao: 300, tarifaPorTitulo: 50 }), calcMode: 'price' });

  assert.equal(resumo.totals.totalFace, totais.face);
  assert.equal(resumo.totals.totalDesagio, totais.juros);
  assert.equal(resumo.totalReceivable, totais.face, 'a obrigação é a soma das parcelas');
  assert.equal(resumo.valorLiquido, 10000);
  assert.equal(resumo.despesas, 500, 'as tarifas não podem ser descontadas duas vezes');
  assert.equal(resumo.projectedProfit, round2(totais.face - 10000));
  assert.equal(round2(resumo.porTitulo.reduce((s, v) => s + v, 0)), totais.face);
  assert.ok(Math.abs(resumo.installmentValue - linhas[0].face) <= 0.01);
});

// 4 ── cálculo direto e inverso
test('Price: inverso parte da parcela conhecida e volta ao mesmo valor', () => {
  const vencimentos = datasParcelas('2026-11-20', 30, 4);

  const porParcela = cronogramaPriceOperacao({
    vencimentos, startDate: START, taxaMensalPct: TAXA, interestType: TIPO_JUROS,
    valorParcela: 3000, tarifaOperacao: 200, tarifaPorTitulo: 0,
  });
  assert.equal(porParcela.linhas.length, 4);
  porParcela.linhas.forEach((l) => assert.equal(l.face, porParcela.linhas[0].face, 'todas as faces são iguais'));
  assert.ok(Math.abs(porParcela.linhas[0].face - 3000) <= 0.01, 'a face reproduz a parcela informada');
  assert.equal(porParcela.repasse, porParcela.base, 'o repasse é o valor presente (tarifas fora do principal)');

  const porRepasse = cronogramaPriceOperacao({
    vencimentos, startDate: START, taxaMensalPct: TAXA, interestType: TIPO_JUROS,
    repasse: porParcela.repasse, tarifaOperacao: 200, tarifaPorTitulo: 0,
  });
  assert.equal(porRepasse.base, porParcela.base);
  assert.ok(Math.abs(porRepasse.linhas[0].face - 3000) <= 0.01, 'ida e volta preserva a parcela');
  assert.equal(porRepasse.repasse, porParcela.repasse);
});

// 5 ── soma das parcelas e reconciliação do repasse em centavos
test('Price: arredondamento em centavos mantém a soma exata', () => {
  const vencimentos = datasParcelas('2026-11-20', 30, 3);
  const { linhas, totais, repasse } = cronogramaPriceOperacao({
    vencimentos, startDate: START, taxaMensalPct: 2.35, interestType: TIPO_JUROS, repasse: 10000.01,
  });

  assert.equal(repasse, 10000.01);
  assert.equal(totais.amortizacao, 10000.01, 'a soma das amortizações fecha o repasse');
  assert.equal(totais.liquido, 10000.01);
  assert.ok(facesIguais(linhas));
  assert.equal(totais.face, round2(totais.amortizacao + totais.juros));

  const rateio = rateioDespesas({ quantidade: 3, tarifaOperacao: 100, tarifaPorTitulo: 0 });
  assert.equal(round2(rateio.reduce((s, v) => s + v, 0)), 100, 'rateio de tarifa fixa fecha em centavos');
});

// 6 ── tabela, resumo, títulos e cronograma gravado
test('Price: tabela, resumo, títulos e cronograma mostram os mesmos números', () => {
  const vencimentos = datasParcelas('2026-11-20', 30, 4);
  const gerado = cronogramaPriceOperacao({
    vencimentos, startDate: START, taxaMensalPct: TAXA, interestType: TIPO_JUROS,
    repasse: 12000, tarifaOperacao: 240, tarifaPorTitulo: 30,
  });
  const titulos = titulosDe(gerado.linhas);
  const form = formDe({ tarifaOperacao: 240, tarifaPorTitulo: 30 });

  const doFormulario = linhasPriceDeTitulos(titulos, {
    startDate: START, taxaMensalPct: TAXA, interestType: TIPO_JUROS,
    tarifaOperacao: 240, tarifaPorTitulo: 30,
  });

  assert.deepEqual(doFormulario.totais, gerado.totais, 'a tabela derivada dos títulos é idêntica à gerada');
  assert.deepEqual(
    doFormulario.linhas.map((l) => [l.face, l.juros, l.amortizacao, l.despesa, l.liquido]),
    gerado.linhas.map((l) => [l.face, l.juros, l.amortizacao, l.despesa, l.liquido]),
  );

  const resumo = resumoFinanceiro({ titulos, form, calcMode: 'price' });
  assert.equal(resumo.valorLiquido, 12000);
  assert.equal(resumo.totalReceivable, gerado.totais.face);

  const cronograma = montarCronograma(resumo, {
    startDate: START, interestType: TIPO_JUROS, arredondar: false, calcMode: 'price',
  });

  assert.equal(cronograma.length, 4);
  cronograma.forEach((p, i) => {
    assert.equal(p.value, gerado.linhas[i].face, 'parcela gravada = parcela da tabela');
    assert.equal(p.principal, gerado.linhas[i].amortizacao, 'amortização gravada = tabela');
    assert.equal(p.interest, gerado.linhas[i].juros, 'juros gravados = tabela');
    assert.equal(p.total_distribuido, gerado.linhas[i].face, 'obrigação da parcela = face');
    assert.equal(p.due_date, gerado.linhas[i].vencimento);
  });

  assert.equal(
    round2(cronograma.reduce((s, p) => s + p.principal, 0)),
    12000,
    'Σ principal gravado = repasse solicitado',
  );
  assert.equal(
    round2(cronograma.reduce((s, p) => s + p.value, 0)),
    resumo.totalReceivable,
    'a soma das parcelas gravadas fecha a obrigação do resumo',
  );
  assert.equal(
    round2(doFormulario.totais.liquido),
    12000,
    'a soma dos líquidos da tabela é o repasse ao cliente',
  );
});