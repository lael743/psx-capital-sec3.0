/**
 * Consulta dados de CNPJ via BrasilAPI (https://brasilapi.com.br).
 * API pública, sem necessidade de chave.
 *
 * Endpoint: https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 */

/**
 * Remove máscara do CNPJ, mantendo apenas dígitos.
 * @param {string} cnpj
 * @returns {string} 14 dígitos
 */
export function unmaskCnpj(cnpj) {
  return (cnpj || '').replace(/\D/g, '');
}

/**
 * Verifica se o CNPJ (com ou sem máscara) possui 14 dígitos.
 * @param {string} cnpj
 * @returns {boolean}
 */
export function isCnpjComplete(cnpj) {
  return unmaskCnpj(cnpj).length === 14;
}

/**
 * Consulta a BrasilAPI e retorna os dados do CNPJ normalizados.
 * Retorna null se o CNPJ for inválido ou não encontrado.
 *
 * @param {string} cnpj CNPJ com ou sem máscara
 * @returns {Promise<object|null>} Dados normalizados da empresa
 */
export async function fetchCnpjData(cnpj) {
  const clean = unmaskCnpj(cnpj);
  if (clean.length !== 14) return null;

  const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
  if (!resp.ok) {
    if (resp.status === 404) return null;
    throw new Error(`BrasilAPI retornou status ${resp.status}`);
  }
  const data = await resp.json();

  const logradouro = [data.logradouro, data.numero].filter(Boolean).join(', ').trim();
  const enderecoCompleto = [
    logradouro,
    data.bairro,
    data.municipio,
    data.uf,
  ].filter(Boolean).join(' — ').trim();

  return {
    razao_social: data.razao_social || '',
    nome_fantasia: data.nome_fantasia || '',
    cep: data.cep || '',
    logradouro: data.logradouro || '',
    numero: data.numero || '',
    complemento: data.complemento || '',
    bairro: data.bairro || '',
    municipio: data.municipio || '',
    uf: data.uf || '',
    endereco_completo: enderecoCompleto,
    email: data.email || '',
    telefone: data.telefone || '',
    capital_social: data.capital_social || 0,
    cnae_fiscal: data.cnae_fiscal || '',
    cnae_fiscal_descricao: data.cnae_fiscal_descricao || '',
    data_inicio_atividade: data.data_inicio_atividade || '',
    natureza_juridica: data.natureza_juridica || '',
    porte: data.porte || '',
  };
}