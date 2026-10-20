/**
 * Diário de eventos de recebimento Asaas — CÓPIA FRONTEND.
 *
 * ⚠️ O bloco entre os marcadores @sync é IDÊNTICO ao de
 * base44/shared/asaasEventJournal.js (backend). O teste D1.3.0 compara os dois
 * blocos byte a byte e falha se divergirem — mesma convenção da D1.1/D1.2.
 *
 * Um recebimento Asaas atravessa estados OBSERVÁVEIS:
 *   reivindicado      — evento recebido, efeitos ainda não confirmados
 *   em_recuperacao    — a recuperação detém o evento (reivindicação atômica)
 *   contabilizado     — todos os efeitos confirmados no banco
 *   falha             — erro transitório; recuperável automaticamente
 *   falha_definitiva  — esgotou as tentativas; exige intervenção manual
 *
 * O diário é OBSERVABILIDADE e ponto de entrada da recuperação. A verdade
 * sobre os efeitos NUNCA vem do diário: vem das próprias entidades — o
 * marcador atômico em Operation.asaas_eventos_processados (gravado na MESMA
 * escrita do $inc) e o asaas_event_key do LancamentoContaCorrente.
 *
 * ── D1.3: por que existe `em_recuperacao` ───────────────────────────────────
 *
 * A D1.2 decidia recuperar apenas por IDADE (`claimed_at` antigo). Idade não
 * é exclusividade: duas execuções simultâneas da recuperação viam o mesmo
 * evento elegível e ambas o processavam. A D1.3 troca "está antigo" por uma
 * REIVINDICAÇÃO ATÔMICA — quem vence o compare-and-swap é o único que age.
 */

/* @sync:start — bloco idêntico em base44/shared/asaasEventJournal.js */
export const EVENTO_STATUS = {
  REIVINDICADO: 'reivindicado',
  EM_RECUPERACAO: 'em_recuperacao',
  CONTABILIZADO: 'contabilizado',
  FALHA: 'falha',
  FALHA_DEFINITIVA: 'falha_definitiva',
};

/** Tolerância antes de um evento ativo ser considerado abandonado. */
export const STALE_SECONDS = 120;

/** Tentativas de recuperação antes de a falha ser considerada definitiva. */
export const MAX_TENTATIVAS = 5;

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
    recovery_started_at: '',
    error: '',
    attempts: 0,
    effects: {},
    lancamento_payload: i.lancamentoPayload || {},
  };
}

/** Instante ISO `staleSeconds` atrás — o corte de abandono. */
export function staleCutoff(nowMs, staleSeconds) {
  return new Date(nowMs - (staleSeconds || STALE_SECONDS) * 1000).toISOString();
}

function maisAntigoQue(iso, cutoffIso) {
  const t = Date.parse(iso || '');
  // Sem carimbo válido não há como provar abandono — trata como abandonado,
  // porque um registro sem instante é órfão de uma escrita interrompida.
  if (Number.isNaN(t)) return true;
  return Date.parse(cutoffIso) - t > 0;
}

/**
 * Reivindicação atômica do evento para recuperação.
 *
 * A consulta casa SOMENTE eventos elegíveis:
 *   · `falha`            — erro transitório registrado
 *   · `reivindicado`     — abandonado (mais antigo que a tolerância)
 *   · `em_recuperacao`   — recuperação anterior abandonada
 *
 * `contabilizado` e `falha_definitiva` NUNCA casam: eventos concluídos não
 * voltam a ser processados, e falhas definitivas exigem intervenção manual.
 *
 * É chaveada por `event_key`, não por id: uma reentrega cria mais de um
 * registro para o mesmo evento, e a exclusividade precisa valer para o
 * EVENTO, não para a linha do diário.
 */
export function recoveryClaimFilter(eventKey, staleIso) {
  return {
    event_key: eventKey,
    $or: [
      { status: EVENTO_STATUS.FALHA },
      { status: EVENTO_STATUS.REIVINDICADO, claimed_at: { $lt: staleIso } },
      { status: EVENTO_STATUS.EM_RECUPERACAO, recovery_started_at: { $lt: staleIso } },
    ],
  };
}

export function isEmProcessamento(record, nowMs, staleSeconds) {
  if (!record) return false;
  if (record.status !== EVENTO_STATUS.REIVINDICADO) return false;
  return maisAntigoQue(record.claimed_at, staleCutoff(nowMs, staleSeconds));
}

export function isRecuperacaoAbandonada(record, nowMs, staleSeconds) {
  if (!record) return false;
  if (record.status !== EVENTO_STATUS.EM_RECUPERACAO) return false;
  return maisAntigoQue(record.recovery_started_at, staleCutoff(nowMs, staleSeconds));
}

export function classifyEvento(record, nowMs, staleSeconds) {
  if (!record) return 'inexistente';
  switch (record.status) {
    case EVENTO_STATUS.CONTABILIZADO:
      return 'contabilizado';
    case EVENTO_STATUS.FALHA_DEFINITIVA:
      return 'falha_definitiva';
    case EVENTO_STATUS.FALHA:
      return 'falha_recuperavel';
    case EVENTO_STATUS.EM_RECUPERACAO:
      return isRecuperacaoAbandonada(record, nowMs, staleSeconds)
        ? 'recuperacao_abandonada'
        : 'em_recuperacao';
    default:
      return isEmProcessamento(record, nowMs, staleSeconds) ? 'abandonado' : 'reivindicado';
  }
}

/**
 * Elegibilidade para a recuperação automática.
 * Falha definitiva NÃO é elegível — precisa de intervenção manual.
 */
export function needsRecovery(record, nowMs, staleSeconds) {
  if (!record) return false;
  if (record.status === EVENTO_STATUS.CONTABILIZADO) return false;
  if (record.status === EVENTO_STATUS.FALHA_DEFINITIVA) return false;
  if (record.status === EVENTO_STATUS.FALHA) return true;
  if (record.status === EVENTO_STATUS.EM_RECUPERACAO) {
    return isRecuperacaoAbandonada(record, nowMs, staleSeconds);
  }
  return isEmProcessamento(record, nowMs, staleSeconds);
}

export function temLancamentoPendente(record) {
  const p = record && record.lancamento_payload;
  return !!p && typeof p === 'object' && Object.keys(p).length > 0;
}

/** Próximo estado de falha: transitória enquanto houver tentativas. */
export function proximoEstadoFalha(attempts) {
  return (Number(attempts) || 0) >= MAX_TENTATIVAS
    ? EVENTO_STATUS.FALHA_DEFINITIVA
    : EVENTO_STATUS.FALHA;
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