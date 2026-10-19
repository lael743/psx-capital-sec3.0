import { daysBetween } from './finance';

/**
 * Valor Líquido de um cheque pré-datado (desconto proporcional).
 * VL = VB × (1 - i × t), onde i = taxa_mensal/100/30 e t = dias até o vencimento.
 */
export function calcValorLiquidoCheque(valorBruto, taxaMensal, dias) {
  const i = (taxaMensal / 100) / 30;
  return valorBruto * (1 - i * dias);
}

/**
 * Saldo devedor corrigido até a data de referência.
 * Saldo Corrigido = Saldo Remanescente × (1 + i × t),
 * onde i = taxa_mensal/100/30 e t = dias desde o início.
 */
export function calcSaldoCorrigido(saldoRemanescente, taxaMensal, dias) {
  const i = (taxaMensal / 100) / 30;
  return saldoRemanescente * (1 + i * dias);
}

/**
 * Dias entre duas datas (para cálculo de prazo do cheque).
 */
export function diasAteVencimento(dataEmissao, dataVencimento) {
  return daysBetween(dataEmissao, dataVencimento);
}