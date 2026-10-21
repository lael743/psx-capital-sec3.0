/**
 * D4.2 — ADAPTADOR do navegador para os eventos de caixa no servidor.
 *
 * O navegador NÃO decide saldo, conta, dono nem autorização: monta a intenção e
 * entrega ao servidor. Não há caminho alternativo — se a função recusar, nada
 * é movimentado.
 */
import { base44 } from '@/api/base44Client';

async function chamar(acao, payload) {
  try {
    const resposta = await base44.functions.invoke('eventoBancario', { acao, ...payload });
    return resposta.data;
  } catch (e) {
    const mensagem = e?.response?.data?.erro || e?.message || 'Falha ao registrar a movimentação.';
    const erro = new Error(mensagem);
    erro.status = e?.response?.status;
    throw erro;
  }
}

/** Lançamento avulso. `eventId` estável por tentativa: repetir não duplica. */
export function registrarLancamentoAvulso({ bankId, tipo, valor, motivo, data, eventId }) {
  return chamar('lancamento_avulso', { bankId, tipo, valor, motivo, data, eventId });
}

/** Recebimento do lucro de uma prorrogação. */
export function registrarLucroProrrogacao({ chequeId, bankId, valor, data, forma }) {
  return chamar('lucro_prorrogacao', { chequeId, bankId, valor, data, forma });
}

/** Remessa de lote de cheques ao banco (custódia, sem efeito de saldo). */
export function registrarRemessa({ bankId, chequeIds, data, observacoes, eventId }) {
  return chamar('remessa_banco', { bankId, chequeIds, data, observacoes, eventId });
}

/** Retorno de lote de cheques devolvidos (custódia, sem efeito de saldo). */
export function registrarRetorno({ bankId, chequeIds, data, destino, observacoes, eventId }) {
  return chamar('retorno_banco', { bankId, chequeIds, data, destino, observacoes, eventId });
}

/**
 * M6.3 — Ajuste de saldo. `eventId` estável por tentativa: repetir não duplica.
 * O servidor exige administrador, valida o valor e grava a chave do evento.
 */
export function ajustarSaldoConta({ bankId, tipo, valor, motivo, data, eventId }) {
  return chamar('ajuste_saldo', { bankId, tipo, valor, motivo, data, eventId });
}

/** M6.3 — Exclusão de conta: o servidor recusa quando há histórico. */
export function excluirContaBancaria(bankId) {
  return chamar('excluir_conta', { bankId });
}

/** Diagnóstico de um evento: saldo aplicado? lançamento existe? */
export function inspecionarEvento({ bankId, eventKey }) {
  return chamar('inspecionar', { bankId, eventKey });
}