/**
 * Diário de eventos de recebimento Asaas — CÓPIA BACKEND.
 *
 * ⚠️ O bloco entre os marcadores @sync é IDÊNTICO ao de
 * src/lib/asaasEventJournal.js (frontend). O teste D1.2.0 compara os dois
 * blocos byte a byte e falha se divergirem — mesma convenção da D1.1.
 *
 * Um recebimento Asaas atravessa quatro estados OBSERVÁVEIS:
 *   reivindicado      — evento recebido, efeitos ainda não confirmados
 *   em_processamento  — reivindicado além do limite de tolerância (travado)
 *   contabilizado     — todos os efeitos confirmados no banco
 *   falha_recuperavel — erro durante a aplicação; recuperável
 *
 * O diário é OBSERVABILIDADE e ponto de entrada da recuperação. A verdade
 * sobre os efeitos NUNCA vem do diário: vem das próprias entidades — o
 * marcador atômico em Operation.asaas_eventos_processados (gravado na MESMA
 * escrita do $inc) e o asaas_event_key do LancamentoContaCorrente.
 */

/* @sync:start — bloco idêntico em base44/shared/asaasEventJournal.js */
export const EVENTO_STATUS = {
  REIVINDICADO: 'reivindicado',
  CONTABILIZADO: 'contabilizado',
  FALHA: 'falha',
};

/** Tolerância antes de um evento reivindicado ser considerado travado. */
export const STALE_SECONDS = 120;

export function newEventoRecord(input) {
  const i = input || {};
  return {
    event_key: String(i.key || ''),
    status: EVENTO_STATUS.REIVINDICADO,
    operation_id: i.operationId || '',
    parcela_id: i.parcelaId || '',
    payment_id: i.paymentId || '',
    external_reference: i.externalReference || '',
    value: Number(i.value) || 0,
    claimed_at: i.now || '',
    accounted_at: '',
    error: '',
    attempts: 0,
    effects: {},
    lancamento_payload: i.lancamentoPayload || {},
  };
}

export function isEmProcessamento(record, nowMs, staleSeconds) {
  if (!record || record.status !== EVENTO_STATUS.REIVINDICADO) return false;
  const t = Date.parse(record.claimed_at || '');
  if (Number.isNaN(t)) return true;
  return nowMs - t > (staleSeconds || STALE_SECONDS) * 1000;
}

export function classifyEvento(record, nowMs, staleSeconds) {
  if (!record) return 'inexistente';
  if (record.status === EVENTO_STATUS.CONTABILIZADO) return 'contabilizado';
  if (record.status === EVENTO_STATUS.FALHA) return 'falha_recuperavel';
  if (isEmProcessamento(record, nowMs, staleSeconds)) return 'em_processamento';
  return 'reivindicado';
}

export function needsRecovery(record, nowMs, staleSeconds) {
  if (!record) return false;
  if (record.status === EVENTO_STATUS.CONTABILIZADO) return false;
  if (record.status === EVENTO_STATUS.FALHA) return true;
  return isEmProcessamento(record, nowMs, staleSeconds);
}

export function temLancamentoPendente(record) {
  const p = record && record.lancamento_payload;
  return !!p && typeof p === 'object' && Object.keys(p).length > 0;
}

/**
 * Decide o que ainda falta aplicar a partir do que foi OBSERVADO no banco.
 * Não confia no que o registro afirma ter feito — por isso a recuperação é
 * segura mesmo quando o diário ficou desatualizado por uma falha.
 */
export function planRecovery(record, observed) {
  const obs = observed || {};
  return {
    needsAmountPaid: !obs.amountPaidAplicado,
    needsLancamento: temLancamentoPendente(record) && !obs.lancamentoExiste,
  };
}
/* @sync:end */