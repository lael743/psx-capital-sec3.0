/**
 * Carrega os dados completos de uma operação (operação, cliente, cheques, sacado)
 * e retorna o objeto estruturado usado pelos previews de documento.
 * Também garante que as settings da empresa estejam no localStorage.
 */
import { base44 } from '@/api/base44Client';
import { buildDadosContrato } from '@/lib/buildDadosContrato';

const STORAGE_KEY = 'psx_company_settings';

export async function loadDadosForOperacao(operationId) {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (!existing || existing === '{}') {
    const configs = await base44.entities.ConfiguracaoEmpresa.list().catch(() => []);
    if (configs.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configs[0]));
    }
  }
  const op = await base44.entities.Operation.get(operationId);
  let client = null;
  let sacado = null;
  if (op?.client_id) client = await base44.entities.Client.get(op.client_id).catch(() => null);
  if (op?.type === 'boleto' && op?.sacado_id) sacado = await base44.entities.Sacado.get(op.sacado_id).catch(() => null);
  let cheques = [];
  if (op?.type === 'cheque') cheques = await base44.entities.Cheque.filter({ operation_id: op.id }, 'compensation_date', 50).catch(() => []);
  return buildDadosContrato(op, client, cheques, sacado);
}