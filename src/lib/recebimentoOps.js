/**
 * M3 — ADAPTADOR DO FRONTEND PARA A FUNÇÃO DE SERVIDOR `recebimentoManual`.
 *
 * O navegador NÃO soma nem grava mais `amount_paid`, `total_receivable`,
 * `balance_due` ou `realized_profit`. Antes, a tela da operação e a baixa do
 * extrato liam o valor, somavam em memória e regravavam — perdiam incremento
 * concorrente e podiam baixar mais que o saldo.
 *
 * Aqui só se monta o pedido: qual operação, qual valor, qual data e QUAL a
 * identidade do evento. Papel, e-mail, obrigação, saldo e lucro são decididos
 * pelo servidor, que autentica pelo token.
 *
 * ── A CHAVE DO EVENTO ──────────────────────────────────────────────────────
 * `novaChaveRecebimento` gera a identidade UMA vez por tentativa. Guarde a
 * chave e reenvie a MESMA em cada retry: é isso que impede que uma falha de
 * rede no meio do caminho some o recebimento duas vezes.
 */
import { base44 } from '@/api/base44Client';

/** Identidade estável de um evento de recebimento. */
export function novaChaveRecebimento(origem) {
  const aleatorio = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${origem}:${aleatorio}`;
}

/**
 * Registra um recebimento no servidor.
 *
 * @param {Object} payload
 * @param {string} payload.operationId
 * @param {number} payload.valor          valor efetivamente recebido
 * @param {string} payload.data           AAAA-MM-DD
 * @param {string} payload.metodo         pix | dinheiro | transferencia | cheque | outro
 * @param {string} payload.observacao
 * @param {string} payload.origem         manual | baixa_manual
 * @param {string} payload.chave          identidade do evento (reusar no retry)
 * @param {number} [payload.jurosMora]    mora declarada (opcional)
 * @param {number} [payload.taxaMora]     taxa mensal % usada no cálculo
 * @param {number} [payload.diasAtraso]
 */
export async function registrarRecebimento(payload) {
  let resposta;
  try {
    resposta = await base44.functions.invoke('recebimentoManual', payload);
  } catch (e) {
    const doServidor = e && e.response && e.response.data && e.response.data.erro;
    throw new Error(doServidor || (e && e.message) || 'Não foi possível falar com o servidor.');
  }
  const dados = (resposta && resposta.data) || {};
  if (dados.ok === false) throw new Error(dados.erro || 'Recebimento recusado pelo servidor.');
  return dados.resultado || {};
}