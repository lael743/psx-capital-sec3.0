/**
 * Helper centralizado para criacao de CashFlow operacional (BACKEND).
 *
 * Usa base44.asServiceRole para operacoes de entidade.
 * Importa regras de cashFlowRules.ts.
 *
 * MANTENHA EM SINCRONIA com src/lib/cashFlowHelper.js (frontend).
 */
import { requiresOperationId, requiresBankId } from './cashFlowRules.ts';

/**
 * Cria o lancamento de caixa de um evento de CHEQUE com origem estavel.
 *
 * M1 — espelho EXATO de `createChequeCashFlow` de src/lib/cashFlowHelper.js.
 * Categorias de cheque sao operacionais (exigem operation_id) E bancarias
 * (exigem bank_id); cheque sem operacao vinculada nao pode satisfazer a
 * exigencia de operation_id, entao o caminho e separado — mas com a MESMA
 * chave de idempotencia, garantindo o mesmo resultado nos dois casos.
 */
export async function createChequeCashFlow(base44: any, params: {
  category: string;
  amount: number;
  date: string;
  description: string;
  type?: string;
  method?: string;
  operation_id?: string;
  bank_id?: string;
  source_type?: string;
  source_id?: string;
  payment_id?: string;
  balance_after?: number;
}) {
  if (params.operation_id) {
    return createOperationalCashFlow(base44, params);
  }

  const existing = await base44.entities.CashFlow.filter({
    source_type: params.source_type,
    source_id: params.source_id,
  });
  if (existing && existing.length > 0) {
    return { status: 'duplicate', existing: existing[0] };
  }

  const { type = 'entrada', operation_id, ...rest } = params;
  const created = await base44.entities.CashFlow.create({ type, ...rest });
  return { status: 'created', cashflow: created };
}

/**
 * Cria um CashFlow operacional com validacao de integridade e idempotencia.
 *
 * @param base44 - Instancia do client base44 (createClientFromRequest)
 * @param params - Parametros do CashFlow
 * @returns { status: 'created' | 'duplicate', cashflow? existing? }
 * @throws Error se validacao falhar — nunca esconde excecoes
 */
export async function createOperationalCashFlow(base44: any, params: {
  category: string;
  amount: number;
  date: string;
  description: string;
  type?: string;
  method?: string;
  operation_id?: string;
  bank_id?: string;
  source_type?: string;
  source_id?: string;
  payment_id?: string;
  balance_after?: number;
}) {
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
    const existing = await base44.asServiceRole.entities.CashFlow.filter({ source_type, source_id });
    if (existing && existing.length > 0) {
      return { status: 'duplicate', existing: existing[0] };
    }
  }

  // Criar CashFlow
  const data: Record<string, any> = {
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

  const created = await base44.asServiceRole.entities.CashFlow.create(data);
  return { status: 'created', cashflow: created };
}