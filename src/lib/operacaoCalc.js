/**
 * M4 — CÁLCULO PURO DA OPERAÇÃO (formulário, resumo e persistência).
 *
 * Por que este arquivo existe: o wizard calculava os valores em um lugar
 * (`OperacaoForm`), exibia em outro (`StepResumo`, `StepParcelas`) e gravava um
 * terceiro conjunto — `installment_value` era `totalFace / n` enquanto
 * `total_receivable` somava tarifas e outras despesas. Resultado: a soma das
 * parcelas não fechava com a obrigação gravada.
 *
 * Aqui existe UMA regra de composição, usada pelos três pontos:
 *
 *   valor de face        → soma dos nominais dos títulos (`totalFace`)
 *   valor líquido        → efetivamente liberado ao cedente (`valorLiquido`)
 *   total a receber      → obrigação do cliente (`totalReceivable`)
 *   lucro projetado      → totalReceivable − valorLiquido
 *   total distribuído    → parte da obrigação atribuída a CADA título
 *
 * `gross_value` da Operation guarda o LÍQUIDO liberado (nome herdado do
 * contrato antigo; ver docs/PSX_M3_SEMANTICA_FINANCEIRA.md). Não confundir com
 * face: o consumidor (Dashboard/realized_profit) já lê esse campo como líquido.
 */

import { daysBetween } from './finance.js';
import { DESAGIO_FACE, FACE_POR_REPASSE, PRICE, normalizarCalcMode } from './formatosCalculo.js';

function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

/**
 * Calcula deságio de um título usando desconto comercial.
 * deságio = valor_face × (taxa/100) × (dias/30)
 *
 * O parâmetro `arredondarTaxaDiaria` existe só por compatibilidade de assinatura:
 * o arredondamento da taxa diária é um artifício da ENTRADA do cálculo inverso
 * (ver calcTituloRow), nunca do deságio sobre a face. No sentido padrão a conta
 * é a mesma com o arredondamento ligado ou desligado — face 1.000 a 4% por 30
 * dias continua líquido 960,00.
 */
export function calcDesagioTitulo(valorFace, taxaMensal, dias, interestType, _arredondarTaxaDiaria) {
  if (!valorFace || !taxaMensal || !dias || dias <= 0) return 0;
  if (interestType === 'composto') {
    const dailyR = taxaMensal / 100 / 30;
    return round2(valorFace * (Math.pow(1 + dailyR, dias) - 1));
  }
  return round2(valorFace * (taxaMensal / 100) * (dias / 30));
}

/**
 * Calcula um título conforme o calcMode.
 * O campo `valor_face` do título armazena o valor DIGITADO pelo usuário; o
 * retorno traz `valorFace` (face real) e `liquido` (líquido real).
 */
export function calcTituloRow(titulo, startDate, rate, interestType, floatDias, arredondarTaxaDiaria, calcMode = DESAGIO_FACE) {
  const inputValor = parseFloat(titulo.valor_face) || 0;
  const outrasDespesas = parseFloat(titulo.outras_despesas) || 0;
  const dias = titulo.vencimento ? daysBetween(startDate, titulo.vencimento) + (floatDias || 0) : 0;
  const modo = normalizarCalcMode(calcMode);

  let valorFace, desagio, liquido;

  if (modo === FACE_POR_REPASSE) {
    // Inverso — o valor digitado é o REPASSE desejado; a face é calculada.
    liquido = inputValor;
    if (arredondarTaxaDiaria) {
      // Arredondamento da taxa: o cálculo inverso NÃO fraciona a taxa diária.
      // 4% ÷ 30 = 0,1333…%/dia → 0,14%/dia, então
      // face = repasse × (1 + 0,14% × dias) = 1.000 × 1,042 = 1.042,00.
      const taxaDiaria = Math.ceil((rate / 30) * 100) / 100 / 100;
      valorFace = round2(liquido * (1 + taxaDiaria * dias));
    } else {
      const taxaProp = (rate / 100) * (dias / 30);
      const fator = 1 - taxaProp;
      valorFace = fator > 0 ? round2(liquido / fator) : liquido;
    }
    desagio = round2(valorFace - liquido);
  } else if (modo === PRICE) {
    // Parcelado — a linha já traz a parcela (face) e a amortização calculadas
    // pela Tabela Price em formatosCalculo.cronogramaPrice. A tarifa da parcela
    // vem embutida na face e destacada em outras_despesas: o deságio é o juro.
    valorFace = inputValor;
    const amortizacao = parseFloat(titulo.valor_liquido) || 0;
    if (amortizacao > 0) {
      liquido = round2(amortizacao);
      desagio = round2(valorFace - liquido - outrasDespesas);
    } else {
      desagio = calcDesagioTitulo(valorFace, rate, dias, interestType, arredondarTaxaDiaria);
      liquido = round2(valorFace - desagio - outrasDespesas);
    }
  } else if (modo === 'desconto_direto') {
    liquido = inputValor;
    const taxaProp = (rate / 100) * (dias / 30);
    desagio = round2(liquido * taxaProp);
    valorFace = round2(liquido + desagio);
  } else if (modo === 'emprestimo') {
    valorFace = inputValor;
    liquido = parseFloat(titulo.valor_liquido) || 0;
    desagio = round2(valorFace - liquido);
  } else {
    valorFace = inputValor;
    desagio = calcDesagioTitulo(valorFace, rate, dias, interestType, arredondarTaxaDiaria);
    liquido = round2(valorFace - desagio - outrasDespesas);
  }

  return { dias, desagio, liquido, valorFace };
}

export function calcTitulosTotais(titulos, startDate, rate, interestType, floatDias, arredondarTaxaDiaria, calcMode = DESAGIO_FACE) {
  let totalFace = 0, totalDesagio = 0, totalOutras = 0, totalLiquido = 0, pesoDias = 0;
  (titulos || []).forEach((t) => {
    const { dias, desagio, liquido, valorFace } = calcTituloRow(t, startDate, rate, interestType, floatDias, arredondarTaxaDiaria, calcMode);
    totalFace += valorFace;
    totalDesagio += desagio;
    totalOutras += parseFloat(t.outras_despesas) || 0;
    totalLiquido += liquido;
    pesoDias += dias * valorFace;
  });
  const prazoMedio = totalFace > 0 ? pesoDias / totalFace : 0;
  const desagioPeriodo = totalFace > 0 ? (totalDesagio / totalFace) * 100 : 0;
  return {
    totalFace: round2(totalFace),
    totalDesagio: round2(totalDesagio),
    totalOutras: round2(totalOutras),
    totalLiquido: round2(totalLiquido),
    prazoMedio,
    desagioPeriodo,
  };
}

/** Título que entra na operação: precisa de vencimento e valor positivo. */
export function isTituloValido(t) {
  return !!(t && t.vencimento && parseFloat(t.valor_face) > 0);
}

/**
 * Distribui um total entre N pesos de forma EXATA: a soma do resultado é
 * exatamente `total` (a última parcela absorve o resíduo do arredondamento).
 * Sem isso, 1.000 em 3 parcelas virava 333,33 × 3 = 999,99 gravado.
 */
export function distribuirPorPeso(total, pesos) {
  const lista = Array.isArray(pesos) ? pesos : [];
  const n = lista.length;
  const alvo = round2(total);
  if (n === 0) return [];

  const somaPesos = lista.reduce((s, p) => s + (Number(p) || 0), 0);
  const uteis = somaPesos > 0 ? lista.map((p) => Number(p) || 0) : lista.map(() => 1);
  const base = uteis.reduce((s, p) => s + p, 0);

  const out = [];
  let acumulado = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out.push(round2(alvo - acumulado));
    } else {
      const parte = round2((alvo * uteis[i]) / base);
      acumulado = round2(acumulado + parte);
      out.push(parte);
    }
  }
  return out;
}

/**
 * Resumo financeiro ÚNICO do wizard — usado pelo formulário (para gravar) e
 * pelas telas de resumo/parcelas (para exibir). Se mudar aqui, muda nos três.
 *
 * Regras preservadas do produto:
 *  · Padrão e Empréstimo: tarifas e outras despesas são repassadas ao cedente,
 *    portanto somam ao total a receber e NÃO saem do líquido.
 *  · Inverso e Desconto Direto: tarifas saem do líquido; o total a receber é a
 *    face dos títulos.
 */
export function resumoFinanceiro({ titulos, form, calcMode }) {
  const validos = (titulos || []).filter(isTituloValido);
  const modo = normalizarCalcMode(calcMode);
  const rate = parseFloat(form?.rate) || 0;
  const floatDias = parseFloat(form?.float_dias) || 0;
  const tarifaOperacao = parseFloat(form?.tarifa_operacao) || 0;
  const tarifaPorTitulo = parseFloat(form?.tarifa_por_titulo) || 0;
  const arredondar = form?.arredondar_taxa_diaria || false;

  const totals = calcTitulosTotais(validos, form?.start_date, rate, form?.interest_type, floatDias, arredondar, modo);

  const n = validos.length;
  const tarifaTitulos = round2(tarifaPorTitulo * n);
  const totalTarifas = round2(tarifaTitulos + tarifaOperacao);
  // `repasseConhecido` = o usuário digita o repasse e o sistema calcula a face.
  // (era o antigo `isPadrao`, cujo nome estava invertido em relação à tela)
  const repasseConhecido = modo === FACE_POR_REPASSE;
  // Parcelado: as tarifas já estão EMBUTIDAS na face de cada parcela
  // (outras_despesas do título). Descontá-las de novo tiraria do cedente um
  // valor que ele não escolheu — o líquido é sempre o repasse solicitado.
  const tarifasNaFace = modo === PRICE;
  const isPadrao = repasseConhecido;
  const isEmprestimo = modo === 'emprestimo';

  const valorLiquido = (repasseConhecido || isEmprestimo || tarifasNaFace)
    ? totals.totalLiquido
    : round2(totals.totalLiquido - totalTarifas);
  const totalReceivable = repasseConhecido
    ? round2(totals.totalFace + totals.totalOutras + totalTarifas)
    : totals.totalFace;
  const projectedProfit = round2(totalReceivable - valorLiquido);

  // Peso de cada título na obrigação: face + despesas próprias + tarifa por
  // título. Só a tarifa fixa da operação (que não é de ninguém em particular)
  // é rateada por esse peso.
  const pesos = validos.map((t) => {
    const { valorFace } = calcTituloRow(t, form?.start_date, rate, form?.interest_type, floatDias, arredondar, modo);
    const outras = parseFloat(t.outras_despesas) || 0;
    const proprio = isPadrao ? round2(valorFace + outras + tarifaPorTitulo) : valorFace;
    return proprio > 0 ? proprio : 1;
  });
  const porTitulo = distribuirPorPeso(totalReceivable, pesos);

  const installmentValue = n > 0 ? round2(totalReceivable / n) : 0;

  // TAXA EFETIVA (a.m.): o juro realmente cobrado, concentrado no prazo médio
  // ponderado e convertido para 30 dias. É diferente do "deságio do período",
  // que é o total sobre a face no prazo inteiro — os dois indicadores são
  // derivados dos MESMOS títulos, nunca de um recálculo paralelo.
  const taxaEfetiva = (totals.prazoMedio > 0 && totals.totalLiquido > 0 && totals.totalDesagio > 0)
    ? round2((Math.pow(1 + totals.totalDesagio / totals.totalLiquido, 30 / totals.prazoMedio) - 1) * 100)
    : 0;

  return {
    titulos: validos,
    n,
    rate,
    floatDias,
    tarifaOperacao,
    tarifaPorTitulo,
    tarifaTitulos,
    totalTarifas,
    totals,
    valorLiquido,
    totalReceivable,
    projectedProfit,
    porTitulo,
    totalDistribuidoTotal: totalReceivable,
    installmentValue,
    taxaEfetiva,
    isPadrao,
    repasseConhecido,
    isEmprestimo,
    calcMode: modo,
    // Composição do resultado, sem confundir receita financeira com lucro:
    // deduções = receita financeira (juros) + despesas cobradas do cliente.
    deducoes: round2(totalReceivable - valorLiquido),
    receitaFinanceira: round2(totals.totalDesagio),
    // Parcelado: outras_despesas dos títulos É a tarifa embutida na face — somar
    // as duas contaria as mesmas tarifas duas vezes.
    despesas: tarifasNaFace ? totalTarifas : round2(totals.totalOutras + totalTarifas),
  };
}

/**
 * Cronograma persistido (`installment_schedule`).
 *
 * Cada parcela recebe um `id` ESTÁVEL, derivado da chave do título — nunca do
 * vencimento, do valor nem da posição. Era isso que fazia uma simples mudança
 * de data religar a parcela a outro título (a associação caía em
 * `legacy:vencimento|valor|numero`).
 */
export function montarCronograma(resumo, { startDate, interestType, arredondar, calcMode }) {
  const { titulos, porTitulo } = resumo;
  // Taxa e float vêm do RESUMO (fonte do cálculo exibido), não do contexto:
  // era assim que a parcela gravada podia sair com taxa diferente da tela.
  return titulos.map((t, i) => {
    const { dias, desagio, liquido, valorFace } = calcTituloRow(t, startDate, resumo.rate, interestType, resumo.floatDias, arredondar, calcMode);
    return {
      id: chaveDoTitulo(t, i),
      number: i + 1,
      value: valorFace,
      principal: liquido,
      interest: desagio,
      days: dias,
      due_date: t.vencimento,
      total_distribuido: porTitulo[i],
      status: 'pendente',
      paid: false,
    };
  });
}

/** Chave estável de um título do formulário (definida na digitação). */
export function chaveDoTitulo(titulo, indice = 0) {
  if (titulo && titulo.chave) return String(titulo.chave);
  return `titulo-${indice + 1}`;
}

/**
 * Validação de entrada do wizard. Devolve a lista de erros (vazia = ok).
 * Não substitui as validações de tela: impede gravar estado inconsistente.
 */
export function validarOperacao({ resumo, form }) {
  const erros = [];
  if (!form?.start_date) erros.push('Informe a data de início da operação.');
  if (!(parseFloat(form?.rate) > 0)) erros.push('Informe uma taxa mensal maior que zero.');
  if (!resumo || resumo.n === 0) erros.push('Inclua ao menos um título com vencimento e valor.');

  (resumo?.titulos || []).forEach((t, i) => {
    if (!t.vencimento) erros.push(`Título ${i + 1}: informe o vencimento.`);
    if (!(parseFloat(t.valor_face) > 0)) erros.push(`Título ${i + 1}: valor deve ser maior que zero.`);
    if (form?.start_date && t.vencimento && daysBetween(form.start_date, t.vencimento) <= 0) {
      erros.push(`Título ${i + 1}: o vencimento precisa ser posterior à data de início.`);
    }
  });

  if (resumo && resumo.totalReceivable <= 0) erros.push('O total a receber precisa ser maior que zero.');
  return erros;
}

/** Números de título determinísticos (nada de `TIT-${Date.now()}`). */
export function numeroDoTitulo(titulo, indice) {
  const informado = String(titulo?.numero || '').trim();
  return informado || `TIT-${indice + 1}`;
}