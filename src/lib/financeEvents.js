/**
 * D3.1 — ESCRITA DE EVENTO FINANCEIRO COM EFEITO SECUNDÁRIO CASADO.
 *
 * Problema recorrente nos escritores de saldo: aplicar o delta e criar o
 * lançamento em `CashFlow` são duas escritas. Repetir o clique criava DOIS
 * lançamentos e, no padrão antigo de leitura-modificação-escrita, também
 * perdia atualização de saldo.
 *
 * Aqui o lançamento só é criado pela execução que de fato aplicou o delta.
 * Quem chega depois recebe `ja_aplicado` e NÃO cria nada — o par
 * (saldo, lançamento) fica na proporção 1:1 por chave de evento.
 *
 * A chave é sempre determinística e derivada do evento de negócio (não do
 * instante), para que repetição e concorrência caiam no mesmo balde.
 */
import { applyBankDelta } from './bankLedger.js';

/**
 * @param {Object} p
 * @param {{updateWhere:Function}} p.store  store de Banco (updateMany)
 * @param {string} p.bankId
 * @param {number} p.delta                  positivo credita, negativo debita
 * @param {string} p.eventKey               identidade determinística do evento
 * @param {Function} [p.aoAplicar]          efeito secundário; roda uma única vez
 * @returns {Promise<{status:string, lancamento:boolean}>}
 */
export async function aplicarEventoBancario({ store, bankId, delta, eventKey, aoAplicar }) {
  const efeito = await applyBankDelta({ store, bankId, delta, eventKey });

  if (efeito.status !== 'aplicado') return { status: efeito.status, lancamento: false };

  if (typeof aoAplicar === 'function') await aoAplicar();
  return { status: efeito.status, lancamento: typeof aoAplicar === 'function' };
}