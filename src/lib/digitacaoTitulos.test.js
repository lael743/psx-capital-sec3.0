/**
 * Digitação de títulos por TIPO de produto e FORMATO de cálculo.
 *
 * Regras cobertas (as mesmas dos exemplos do produto):
 *  · Cheque padrão ..... face 1.000, 4% a.m., 30 dias → líquido 960,00
 *  · Cheque inverso .... repasse 1.000 → face 1.041,67
 *  · Cheque inverso com arredondamento da taxa diária (0,14%/dia) → face 1.042,00
 *  · Cheque padrão com arredondamento → líquido continua 960,00
 *  · Boleto/Duplicata padrão → mesma regra de deságio sobre a face
 *  · Boleto/Duplicata inverso → Tabela Price (2.000 em 2x30 dias a 4% =
 *    prestação 1.060,39, juros 120,78, total 2.120,78, ROI 6,04%)
 *
 * Fixtures puras: nenhum teste toca entidade, banco ou a plataforma.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { calcTituloRow, resumoFinanceiro } from './operacaoCalc.js';
import {
  calcModeEfetivo, DESAGIO_FACE, FACE_POR_REPASSE, PRICE,
} from './formatosCalculo.js';
import { cronogramaPriceOperacao, datasParcelas } from './priceOperacao.js';

const START = '2026-10-26';
const VENC_30 = '2026-11-25';
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

const titulo = (valor, extra = {}) => ({
  vencimento: VENC_30,
  valor_face: String(valor),
  outras_despesas: '',
  ...extra,
});

const form = {
  rate: 4,
  interest_type: 'simples',
  start_date: START,
  float_dias: 0,
  tarifa_operacao: 0,
  tarifa_por_titulo: 0,
  arredondar_taxa_diaria: false,
};

// ── 1. Cheque ───────────────────────────────────────────────────────────────

test('cheque padrão: face 1.000 a 4% por 30 dias dá líquido 960,00', () => {
  const r = calcTituloRow(titulo(1000), START, 4, 'simples', 0, false, DESAGIO_FACE);
  assert.equal(r.dias, 30);
  assert.equal(r.valorFace, 1000);
  assert.equal(r.desagio, 40);
  assert.equal(r.liquido, 960);
});

test('cheque padrão: arredondar a taxa NÃO altera o líquido (continua 960,00)', () => {
  const r = calcTituloRow(titulo(1000), START, 4, 'simples', 0, true, DESAGIO_FACE);
  assert.equal(r.desagio, 40);
  assert.equal(r.liquido, 960);
});

test('cheque inverso: repasse 1.000 a 4% por 30 dias dá face 1.041,67', () => {
  const r = calcTituloRow(titulo(1000), START, 4, 'simples', 0, false, FACE_POR_REPASSE);
  assert.equal(r.liquido, 1000);
  assert.equal(r.valorFace, 1041.67);
  assert.equal(r.desagio, 41.67);
});

test('cheque inverso com arredondamento: 4%÷30 = 0,14%/dia → face 1.042,00', () => {
  const r = calcTituloRow(titulo(1000), START, 4, 'simples', 0, true, FACE_POR_REPASSE);
  assert.equal(r.valorFace, 1042);
  assert.equal(r.desagio, 42);
  assert.equal(r.liquido, 1000);
});

// ── 2. Boleto / Duplicata ───────────────────────────────────────────────────

test('boleto e duplicata padrão usam a mesma regra de deságio do cheque', () => {
  ['boleto', 'duplicata'].forEach((tipo) => {
    assert.equal(calcModeEfetivo({ tipo, calcMode: DESAGIO_FACE, calculoInverso: false }), DESAGIO_FACE);
    const r = calcTituloRow(titulo(1000), START, 4, 'simples', 0, false, DESAGIO_FACE);
    assert.equal(r.liquido, 960);
  });
});

test('boleto e duplicata no sentido inverso são calculados pela Tabela Price', () => {
  ['boleto', 'duplicata'].forEach((tipo) => {
    assert.equal(calcModeEfetivo({ tipo, calcMode: DESAGIO_FACE, calculoInverso: true }), PRICE);
    assert.equal(calcModeEfetivo({ tipo, calcMode: FACE_POR_REPASSE, calculoInverso: false }), PRICE);
  });
  // O cheque continua no deságio sobre a face.
  assert.equal(calcModeEfetivo({ tipo: 'cheque', calcMode: DESAGIO_FACE, calculoInverso: true }), FACE_POR_REPASSE);
  assert.equal(calcModeEfetivo({ tipo: 'cheque', calcMode: DESAGIO_FACE, calculoInverso: false }), DESAGIO_FACE);
  // Empréstimo legado não muda.
  assert.equal(calcModeEfetivo({ tipo: 'emprestimo', calcMode: DESAGIO_FACE, calculoInverso: true }), 'emprestimo');
});

test('boleto inverso: 2.000 em 2 prestações de 30 dias a 4% fecha o exemplo do produto', () => {
  const { linhas, totais } = cronogramaPriceOperacao({
    vencimentos: datasParcelas(VENC_30, 30, 2),
    startDate: START,
    taxaMensalPct: 4,
    interestType: 'simples',
    repasse: 2000,
  });

  assert.equal(linhas.length, 2);
  // Prestação (PMT) 2x de 1.060,39
  assert.equal(linhas[0].face, 1060.39);
  assert.equal(linhas[1].face, 1060.39);
  // Juros 80,00 na 1ª e 40,78 na 2ª (sobre o saldo devedor)
  assert.equal(linhas[0].juros, 80);
  assert.equal(linhas[0].saldo, 1019.61);
  assert.equal(linhas[1].juros, 40.78);
  assert.equal(linhas[1].saldo, 0);
  // Principal (Total) 2.000, Juros (Price) 120,78, Total a Pagar 2.120,78
  assert.equal(totais.amortizacao, 2000);
  assert.equal(totais.juros, 120.78);
  assert.equal(totais.face, 2120.78);
  // ROI 6,04%
  assert.equal(round2((totais.juros / totais.amortizacao) * 100), 6.04);
});

test('boleto inverso: resumo financeiro usa a MESMA tabela (repasse 2.000, total 2.120,78)', () => {
  const { linhas } = cronogramaPriceOperacao({
    vencimentos: datasParcelas(VENC_30, 30, 2),
    startDate: START,
    taxaMensalPct: 4,
    interestType: 'simples',
    repasse: 2000,
  });
  const titulos = linhas.map((l) => ({
    vencimento: l.vencimento,
    valor_face: String(l.face),
    valor_liquido: String(l.amortizacao),
    outras_despesas: '',
  }));

  const resumo = resumoFinanceiro({ titulos, form, calcMode: PRICE });
  assert.equal(resumo.valorLiquido, 2000);
  assert.equal(resumo.totalReceivable, 2120.78);
  assert.equal(resumo.totals.totalDesagio, 120.78);
});