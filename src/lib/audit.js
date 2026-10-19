import { base44 } from '@/api/base44Client';

// Mapa de rótulos legíveis por entidade/ação
export const ACTION_LABELS = {
  create: 'Criação',
  update: 'Alteração',
  delete: 'Exclusão',
  payment: 'Pagamento',
  compensar: 'Compensação',
  devolver: 'Devolução',
  prorrogar: 'Prorrogação',
  custody_change: 'Mudança de Custódia',
  status_change: 'Mudança de Status',
  disbursement: 'Repasse',
  login: 'Login',
  export: 'Exportação',
  upload: 'Upload',
  view: 'Visualização',
  cancel: 'Cancelamento',
  baixado: 'Baixa de bem',
  vendido: 'Venda de bem',
};

export const ENTITY_LABELS = {
  Client: 'Cliente',
  Operation: 'Operação',
  Cheque: 'Cheque',
  Payment: 'Pagamento',
  CashFlow: 'Fluxo de Caixa',
  Banco: 'Banco',
  Assessor: 'Assessor',
  Document: 'Documento',
  AuditLog: 'Log',
  CategoriaInterna: 'Categoria interna',
  ContaInterna: 'Conta interna',
  LancamentoInterno: 'Lançamento interno',
  ObrigacaoInterna: 'Parcela (contas a pagar)',
  PagamentoInterno: 'Pagamento interno',
  PatrimonioInterno: 'Patrimônio',
};

/**
 * Registra uma ação no log de auditoria.
 * @param {object} opts
 * @param {string} opts.action - tipo da ação (create, update, delete, compensar, etc.)
 * @param {string} opts.entity - entidade afetada
 * @param {string} [opts.entityId] - id do registro afetado
 * @param {string} opts.description - descrição legível da ação
 * @param {object} [opts.before] - estado anterior (para updates)
 * @param {object} [opts.after] - estado posterior
 */
export async function logAction({ action, entity, entityId, description, before, after }) {
  try {
    const user = await base44.auth.me();
    await base44.entities.AuditLog.create({
      user_email: user?.email || 'system',
      user_name: user?.full_name || 'Sistema',
      action,
      entity,
      entity_id: entityId || '',
      description,
      before: before || null,
      after: after || null,
    });
  } catch (e) {
    console.warn('Audit log failed:', e);
  }
}

/**
 * Gera um diff legível entre dois objetos (before/after).
 * Retorna array de strings descrevendo as mudanças.
 */
export function diffObjects(before, after, fieldLabels = {}) {
  if (!before || !after) return [];
  const changes = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const oldVal = before[key];
    const newVal = after[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      const label = fieldLabels[key] || key;
      changes.push({ field: label, from: oldVal, to: newVal });
    }
  }
  return changes;
}