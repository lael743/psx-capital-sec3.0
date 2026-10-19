/**
 * Helper centralizado para criacao de CashFlow operacional (FRONTEND).
 *
 * Todas as telas que criam CashFlow DEVEM usar este helper.
 * Nao espalhar regras de validacao por varias telas.
 *
 * MANTENHA EM SINCRONIA com base44/shared/cashFlowHelper.ts (backend).
 */
import { base44 } from '@/api/base44Client';

/**
 * Categorias operacionais — SEMPRE relacionadas a uma Operation.
 * CashFlows dessas categorias DEVEM ter operation_id preenchido.
 */
export const OPERATIONAL_CATEGORIES = new Set([
  'compensacao_cheque',
  'estorno_compensacao',
  'recebimento_operacao',
  'recebimento_cheque_devolvido',
  'repasse_cliente',
  'cheque_devolvido',
  'taxa_devolucao_cheque',
  'lucro_prorrogacao',
  'lucro_prorrogacao_cheque',
]);

/**
 * Categorias bancarias — SEMPRE relacionadas a um Banco.
 * CashFlows dessas categorias DEVEM ter bank_id preenchido.
 */
export const BANK_CATEGORIES = new Set([
  'compensacao_cheque',
  'estorno_compensacao',
  'recebimento_cheque_devolvido',
  'lucro_prorrogacao_cheque',
  'lancamento_avulso',
  'transferencia_interna',
]);

export function requiresOperationId(category) {
  return OPERATIONAL_CATEGORIES.has(category);
}

export function requiresBankId(category) {
  return BANK_CATEGORIES.has(category);
}

/**
 * Cria um CashFlow operacional com validacao de integridade e idempotencia.
 *
 * @param {Object} params
 * @param {string} params.category - Categoria do CashFlow
 * @param {number} params.amount - Valor (numero positivo)
 * @param {string} params.date - Data (ISO date)
 * @param {string} params.description - Descricao
 * @param {string} [params.type] - 'entrada' | 'saida' (default: 'entrada')
 * @param {string} [params.method] - Metodo de pagamento (default: 'outro')
 * @param {string} [params.operation_id] - ID da Operation (obrigatorio se categoria operacional)
 * @param {string} [params.bank_id] - ID do Banco (obrigatorio se categoria bancaria)
 * @param {string} [params.source_type] - Tipo da origem (ex: cheque_compensacao)
 * @param {string} [params.source_id] - ID da origem (ex: ID do cheque)
 * @param {string} [params.payment_id] - ID do Payment
 * @param {number} [params.balance_after] - Saldo apos lancamento
 * @returns {Promise<{status: 'created'|'duplicate', cashflow?: object, existing?: object}>}
 * @throws {Error} Se validacao falhar — nunca esconde excecoes
 */
export async function createOperationalCashFlow(params) {
  const {
    category,
    amount,
    date,
    description,
    type = 'entrada',
    method = 'outro',
    operation_id,
    bank_id,
    source_type,
    source_id,
    payment_id,
    balance_after,
  } = params;

  // Validacoes basicas
  if (!category) throw new Error('[CashFlow] category e obrigatorio');
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new Error(`[CashFlow] amount deve ser um numero positivo (recebido: ${amount})`);
  }
  if (!date) throw new Error('[CashFlow] date e obrigatorio');
  if (!description) throw new Error('[CashFlow] description e obrigatorio');
  if (!['entrada', 'saida'].includes(type)) {
    throw new Error(`[CashFlow] type deve ser 'entrada' ou 'saida' (recebido: ${type})`);
  }

  // Validar operation_id se categoria for operacional
  if (requiresOperationId(category) && !operation_id) {
    throw new Error(`[CashFlow] Categoria "${category}" exige operation_id`);
  }

  // Validar bank_id se categoria for bancaria
  if (requiresBankId(category) && !bank_id) {
    throw new Error(`[CashFlow] Categoria "${category}" exige bank_id`);
  }

  // Idempotencia: se source_type + source_id fornecidos, verificar duplicidade
  if (source_type && source_id) {
    const existing = await base44.entities.CashFlow.filter({ source_type, source_id });
    if (existing && existing.length > 0) {
      return { status: 'duplicate', existing: existing[0] };
    }
  }

  // Criar CashFlow
  const data = {
    type,
    category,
    amount,
    date,
    description,
    method,
  };
  if (operation_id) data.operation_id = operation_id;
  if (bank_id) data.bank_id = bank_id;
  if (source_type) data.source_type = source_type;
  if (source_id) data.source_id = source_id;
  if (payment_id) data.payment_id = payment_id;
  if (balance_after !== undefined) data.balance_after = balance_after;

  const created = await base44.entities.CashFlow.create(data);
  return { status: 'created', cashflow: created };
}