/**
 * PARCELADO (TABELA PRICE) — motor único do wizard.
 *
 * Regra financeira (a mesma em todos os pontos):
 *
 *   PV (valor presente)  = repasse solicitado  (é o LÍQUIDO que o cedente recebe)
 *   prestação (PMT)      = PMT constante, obtido descontando o PV pelas taxas
 *                          de CADA período (dias reais até o vencimento)
 *   juros do período k   = saldo_{k-1} × i_k
 *   amortização k        = PMT − juros_k   (a última absorve os centavos)
 *   face k               = prestação + tarifa rateada da parcela
 *
 * Assim:
 *   · todas as parcelas têm o MESMO valor nominal (face);
 *   · os juros variam com o prazo de cada vencimento;
 *   · a amortização varia com os juros;
 *   · Σ amortização = PV  e  Σ líquido = repasse solicitado (nunca menor);
 *   · TODAS as tarifas entram na face: Σ face = repasse + juros + tarifas;
 *   · tarifas aparecem UMA única vez, embutidas e discriminadas por parcela.
 *
 * `linhasPriceDeTitulos` deriva a MESMA tabela a partir dos títulos já
 * gravados no formulário — é o que garante que a etapa de Parcelas, o Resumo &
 * Confirmação e o cronograma persistido mostrem exatamente os mesmos números.
 */

import { daysBetween } from './finance.js';
import {
  cronogramaPrice, cronogramaPricePorParcela, taxaDoPeriodo,
} from './formatosCalculo.js';

function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

/** Datas de vencimento: primeiro vencimento + i × intervalo (em dias). */
export function datasParcelas(primeiroVencimento, intervaloDias, quantidade) {
  const base = String(primeiroVencimento || '');
  const n = Math.max(0, Number(quantidade) || 0);
  if (!base || !n) return [];
  const passo = Math.max(1, Number(intervaloDias) || 30);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + i * passo);
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    out.push(`${d.getFullYear()}-${mes}-${dia}`);
  }
  return out;
}

/**
 * Rateio das despesas da operação por parcela.
 * A tarifa por título é linear e a tarifa fixa é dividida em partes iguais,
 * com o resíduo de centavos na última. A soma é EXATAMENTE o total cobrado.
 */
export function rateioDespesas({ quantidade, tarifaOperacao = 0, tarifaPorTitulo = 0 } = {}) {
  const n = Math.max(0, Number(quantidade) || 0);
  if (!n) return [];
  const fixa = round2(tarifaOperacao);
  const porTitulo = round2(tarifaPorTitulo);

  const partes = [];
  let acumulado = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      partes.push(round2(fixa - acumulado));
    } else {
      const parte = round2(fixa / n);
      acumulado = round2(acumulado + parte);
      partes.push(parte);
    }
  }
  return partes.map((v) => round2(v + porTitulo));
}

/**
 * Cronograma Price do wizard.
 * Entrada: `repasse` (padrão) OU `valorParcela` (cálculo inverso).
 * Saída: linhas prontas para a tabela, com despesa rateada e líquido.
 */
export function cronogramaPriceOperacao({
  vencimentos = [],
  startDate,
  taxaMensalPct = 0,
  interestType = 'simples',
  repasse = 0,
  valorParcela = 0,
  tarifaOperacao = 0,
  tarifaPorTitulo = 0,
} = {}) {
  const datas = (vencimentos || []).filter(Boolean);
  const n = datas.length;
  if (!n) return { linhas: [], totais: totaisVazios(), repasse: 0, parcela: 0, base: 0 };

  const periodos = datas.map((vencimento, idx) => ({
    // A taxa de cada período usa os dias ENTRE vencimentos (o intervalo), não
    // os dias acumulados desde o início — era isso que fazia os juros da 2ª
    // parcela em diante serem calculados como se o prazo dobrasse.
    intervalo: daysBetween(idx === 0 ? startDate : datas[idx - 1], vencimento),
    decorridos: daysBetween(startDate, vencimento),
    vencimento,
  }));

  const despesas = rateioDespesas({ quantidade: n, tarifaOperacao, tarifaPorTitulo });
  const totalDespesas = round2(despesas.reduce((s, v) => s + v, 0));

  const parcelaInformada = Number(valorParcela) || 0;
  // O valor presente é o REPASSE. As tarifas NÃO são financiadas: elas são
  // somadas à face de cada parcela (entram na cobrança, nunca no principal).
  let base;
  if (parcelaInformada > 0) {
    // Inverso: a parcela informada é o que o cliente PAGA (já com a tarifa da
    // parcela); descontado esse valor, chega-se ao repasse.
    const principalPorParcela = round2(parcelaInformada - totalDespesas / n);
    base = round2(cronogramaPricePorParcela({
      valorParcela: principalPorParcela,
      taxaMensalPct,
      interestType,
      vencimentos: periodos.map((p) => ({ dias: p.intervalo, vencimento: p.vencimento })),
    }).repasse);
  } else {
    base = round2(repasse);
  }

  const cronograma = cronogramaPrice({
    repasse: base,
    taxaMensalPct,
    interestType,
    vencimentos: periodos.map((p) => ({ dias: p.intervalo, vencimento: p.vencimento })),
  });
  if (!cronograma.length) return { linhas: [], totais: totaisVazios(), repasse: base, parcela: 0, base };

  // Prestação constante (juros + amortização): a última absorve o resíduo de
  // centavos, de modo que Σ amortização = PV. A FACE de cada parcela é essa
  // prestação MAIS a tarifa rateada dela.
  const prestacao = round2(cronograma[0].valor);
  let somaAmortizacao = 0;
  const linhas = cronograma.map((r, k) => {
    const ultima = k === cronograma.length - 1;
    const amortizacao = ultima ? round2(base - somaAmortizacao) : round2(prestacao - r.juros);
    somaAmortizacao = round2(somaAmortizacao + amortizacao);
    const despesa = despesas[k] || 0;
    const juros = round2(prestacao - amortizacao);
    return {
      numero: k + 1,
      vencimento: r.vencimento,
      dias: periodos[k].decorridos,
      face: round2(amortizacao + juros + despesa),
      juros,
      amortizacao,
      saldo: round2(base - somaAmortizacao),
      despesa,
      liquido: amortizacao,
    };
  });

  return {
    linhas,
    totais: totaisDeLinhas(linhas),
    repasse: base,
    parcela: linhas[0]?.face || 0,
    base,
  };
}

/**
 * Mesma tabela, derivada dos títulos do formulário (fonte exibida e gravada).
 * `valor_face` = face cobrada (prestação + tarifa), `valor_liquido` = amortização
 * (a parte do repasse) e `outras_despesas` = tarifa embutida naquela parcela.
 * A tarifa vem GRAVADA no título — não é recalculada a partir do formulário.
 */
export function linhasPriceDeTitulos(titulos = [], {
  startDate,
  taxaMensalPct = 0,
  interestType = 'simples',
} = {}) {
  const lista = (titulos || []).filter((t) => t && t.vencimento && parseFloat(t.valor_face) > 0);
  const n = lista.length;
  if (!n) return { linhas: [], totais: totaisVazios(), repasse: 0, parcela: 0 };

  const linhas = lista.map((t, k) => {
    const face = round2(parseFloat(t.valor_face) || 0);
    const dias = daysBetween(startDate, t.vencimento);
    const despesa = round2(parseFloat(t.outras_despesas) || 0);
    const informada = parseFloat(t.valor_liquido);
    // Registro sem amortização gravada: reconstrói o valor presente do período.
    const amortizacao = informada > 0
      ? round2(informada)
      : round2(face / (1 + taxaDoPeriodo(taxaMensalPct, dias, interestType)) - despesa);
    return {
      numero: k + 1,
      vencimento: t.vencimento,
      dias,
      face,
      juros: round2(face - amortizacao - despesa),
      amortizacao,
      despesa,
      liquido: amortizacao,
    };
  });

  const totalAmortizacao = round2(linhas.reduce((s, l) => s + l.amortizacao, 0));
  // Saldo devedor da tabela de amortização: o que ainda falta amortizar.
  let acumulado = 0;
  linhas.forEach((l) => {
    acumulado = round2(acumulado + l.amortizacao);
    l.saldo = round2(totalAmortizacao - acumulado);
  });

  return {
    linhas,
    totais: totaisDeLinhas(linhas),
    repasse: totalAmortizacao,
    parcela: linhas[0]?.face || 0,
  };
}

function totaisVazios() {
  return { face: 0, juros: 0, amortizacao: 0, despesa: 0, liquido: 0, quantidade: 0 };
}

function totaisDeLinhas(linhas) {
  return {
    face: round2(linhas.reduce((s, l) => s + l.face, 0)),
    juros: round2(linhas.reduce((s, l) => s + l.juros, 0)),
    amortizacao: round2(linhas.reduce((s, l) => s + l.amortizacao, 0)),
    despesa: round2(linhas.reduce((s, l) => s + l.despesa, 0)),
    liquido: round2(linhas.reduce((s, l) => s + l.liquido, 0)),
    quantidade: linhas.length,
  };
}