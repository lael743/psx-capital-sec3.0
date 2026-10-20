/**
 * Regras de categorias de CashFlow — compartilhadas entre frontend e backend.
 *
 * MANTENHA EM SINCRONIA com src/lib/cashFlowHelper.js
 *
 * Estas regras definem quais categorias exigem operation_id e quais exigem bank_id.
 * O objetivo e garantir que todo CashFlow operacional tenha rastreabilidade
 * ate a Operation e ate o Banco.
 */

/**
 * Categorias operacionais — SEMPRE relacionadas a uma Operation.
 * CashFlows dessas categorias DEVEM ter operation_id preenchido.
 */
export const OPERATIONAL_CATEGORIES: Set<string> = new Set([
  'compensacao_cheque',
  'estorno_compensacao',
  'recebimento_operacao',
  'recebimento_cheque_devolvido',
  'repasse_cliente',
  'cheque_devolvido',
  'taxa_devolucao_cheque',
  'estorno_resolucao_cheque',
  'lucro_prorrogacao',
  'lucro_prorrogacao_cheque',
]);

/**
 * Categorias bancarias — SEMPRE relacionadas a um Banco.
 * CashFlows dessas categorias DEVEM ter bank_id preenchido.
 */
export const BANK_CATEGORIES: Set<string> = new Set([
  'compensacao_cheque',
  'estorno_compensacao',
  'recebimento_cheque_devolvido',
  'estorno_resolucao_cheque',
  'lucro_prorrogacao_cheque',
  'lancamento_avulso',
  'transferencia_interna',
]);

export function requiresOperationId(category: string): boolean {
  return OPERATIONAL_CATEGORIES.has(category);
}

export function requiresBankId(category: string): boolean {
  return BANK_CATEGORIES.has(category);
}