import { base44 } from '@/api/base44Client';

/**
 * Busca todos os registros de uma entidade paginando automaticamente
 * até esgotar o resultado (lotes de 500).
 * @param {string} entity - Nome da entidade (ex: 'Operation', 'Cheque')
 * @param {string} sort - Ordenação (ex: '-created_date')
 * @param {object} query - Filtro opcional (ex: { deposited_bank_id: 'xxx' })
 * @returns {Promise<Array>}
 */
export async function fetchAll(entity, sort = '-created_date', query = {}) {
  const PAGE = 500;
  const all = [];
  let skip = 0;

  while (true) {
    const batch = await base44.entities[entity].filter(query, sort, PAGE, skip);
    all.push(...batch);
    if (batch.length < PAGE) break;
    skip += PAGE;
    // Safety valve: 50 pages = 25k records
    if (all.length >= 25000) break;
  }
  return all;
}