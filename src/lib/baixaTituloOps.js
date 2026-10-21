/**
 * M6.4 — ADAPTADOR DO FRONTEND PARA A FUNÇÃO DE SERVIDOR `baixaTitulo`.
 *
 * O navegador NÃO movimenta saldo, não grava `Payment`, não cria lançamento e
 * não altera o título. Ele escolhe apenas QUAL título, QUAL conta e QUAL data;
 * o servidor autentica pelo token, confere a página, valida a elegibilidade e
 * aplica o núcleo financeiro existente (compensação de cheque).
 */
import { base44 } from '@/api/base44Client';

/**
 * @param {Object} payload
 * @param {string} payload.tituloId  id do título (registro de Cheque)
 * @param {string} payload.bankId    conta de destino do crédito
 * @param {string} payload.data      AAAA-MM-DD
 */
export async function registrarBaixaTitulo({ tituloId, bankId, data }) {
  let resposta;
  try {
    resposta = await base44.functions.invoke('baixaTitulo', { tituloId, bankId, data });
  } catch (e) {
    const doServidor = e && e.response && e.response.data && e.response.data.erro;
    throw new Error(doServidor || (e && e.message) || 'Não foi possível falar com o servidor.');
  }
  const dados = (resposta && resposta.data) || {};
  if (dados.ok === false) throw new Error(dados.erro || 'Baixa recusada pelo servidor.');
  return dados;
}