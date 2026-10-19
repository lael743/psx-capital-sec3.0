// Cálculo da antecipação para operações de assinatura (factoring recorrente).
// O valor antecipado ao cedente é o valor presente (líquido) da soma dos pagamentos
// recorrentes, descontado pela taxa mensal conforme o prazo de cada ciclo, e ainda
// deduzido das tarifas (operação + por assinante) e do float.

export const CICLO_DIAS = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 15,
  MONTHLY: 30,
  QUARTERLY: 90,
  SEMIANNUALLY: 180,
  YEARLY: 360,
};

export const CICLO_LABEL = {
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quinzenal',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUALLY: 'Semestral',
  YEARLY: 'Anual',
};

function round2(v) { return Math.round(v * 100) / 100; }

/**
 * Deságio de um pagamento futuro (desconto comercial), alinhado ao calcDesagioTitulo.
 * - simples: desagio = valor × (taxa/100) × (dias/30)
 * - composto: desagio = valor × ((1 + taxa/30/100)^dias − 1)
 */
function calcDesagio(valor, taxaMensal, dias, interestType, arredondarTaxaDiaria) {
  if (!valor || !taxaMensal || !dias || dias <= 0) return 0;
  if (interestType === 'composto') {
    const dailyR = arredondarTaxaDiaria
      ? Math.ceil((taxaMensal / 30) * 100) / 100 / 100
      : taxaMensal / 100 / 30;
    return round2(valor * (Math.pow(1 + dailyR, dias) - 1));
  }
  if (arredondarTaxaDiaria) {
    const dailyRatePct = Math.ceil((taxaMensal / 30) * 100) / 100;
    return round2(valor * (dailyRatePct / 100) * dias);
  }
  return round2(valor * (taxaMensal / 100) * (dias / 30));
}

/**
 * Calcula o valor antecipado (valor presente) de uma assinatura recorrente.
 * @param {object} p
 * @param {number} p.totalPorCiclo Soma dos valores de todos os assinantes em um ciclo.
 * @param {number} p.numCiclos Período (quantidade de ciclos) para o cálculo.
 * @param {string} p.ciclo Um de CICLO_DIAS.
 * @param {number} p.rate Taxa mensal em %.
 * @param {string} p.interestType 'simples' | 'composto'.
 * @param {boolean} p.arredondarTaxaDiaria
 * @param {number} p.tarifaOperacao Tarifa fixa da operação (R$), descontada do líquido.
 * @param {number} p.tarifaPorTitulo Tarifa por assinante (R$), descontada do líquido.
 * @param {number} p.numAssinantes Quantidade de assinantes (para tarifa por título).
 * @param {number} p.floatDias Dias de float adicionados ao prazo de cada ciclo.
 * @returns {{ valorAntecipacao, totalReceivable, totalDesagio, totalTarifas, totalLiquidoBruto }}
 */
export function calcAntecipacaoAssinatura({
  totalPorCiclo, numCiclos, ciclo, rate, interestType = 'simples',
  arredondarTaxaDiaria = false,
  tarifaOperacao = 0, tarifaPorTitulo = 0, numAssinantes = 0, floatDias = 0,
}) {
  const n = parseInt(numCiclos) || 0;
  const totalCiclo = parseFloat(totalPorCiclo) || 0;
  const taxa = parseFloat(rate) || 0;
  const diasCiclo = CICLO_DIAS[ciclo] || 30;
  const float = parseFloat(floatDias) || 0;
  const tOperacao = parseFloat(tarifaOperacao) || 0;
  const tPorTitulo = parseFloat(tarifaPorTitulo) || 0;
  const numAss = parseInt(numAssinantes) || 0;

  const totalReceivable = round2(totalCiclo * n);
  // Tarifa por título é cobrada por assinante e por ciclo (ex.: 10 assinantes × 10 ciclos × R$ 3,00).
  const totalTarifas = round2(tOperacao + tPorTitulo * numAss * n);

  let pv = 0;
  if (totalCiclo && n && taxa) {
    for (let t = 1; t <= n; t++) {
      const dias = diasCiclo * t + float;
      const desagio = calcDesagio(totalCiclo, taxa, dias, interestType, arredondarTaxaDiaria);
      pv += totalCiclo - desagio;
    }
  } else {
    pv = totalReceivable;
  }
  pv = round2(pv);
  const totalDesagio = round2(totalReceivable - pv);
  const valorAntecipacao = round2(pv - totalTarifas);
  return { valorAntecipacao, totalReceivable, totalDesagio, totalTarifas, totalLiquidoBruto: pv };
}