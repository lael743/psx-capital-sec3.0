/**
 * FASE D1.2 — Fluxo de recebimento Asaas: atômico, idempotente e recuperável.
 *
 * ⚠️ Este arquivo existe em DUAS cópias IDÊNTICAS:
 *      base44/shared/asaasReceiptFlow.js  (backend — usado pelo webhook Asaas)
 *      src/lib/asaasReceiptFlow.js        (frontend — exercitado pelos testes)
 *    O teste D1.2.0b compara os dois blocos @sync byte a byte e falha se
 *    divergirem — mesma convenção já usada em operationAccounting.js.
 *
 *    O módulo é PURO: recebe o cliente `base44` por parâmetro e não importa
 *    nada da plataforma. Por isso pode viver nos dois lados da fronteira e ser
 *    testado diretamente, em vez de reimplementado nos testes.
 *
 * ── O QUE MUDOU EM RELAÇÃO À D1.1 ───────────────────────────────────────────
 *
 * A D1.1 reivindicava o evento e DEPOIS somava o valor, em duas escritas
 * separadas. Isso deixava duas brechas:
 *
 *   (a) JANELA ENTRE REIVINDICAR E SOMAR — se o processo morresse no meio, o
 *       evento ficava marcado como processado sem ter sido somado (subcontagem
 *       silenciosa, indetectável pelo marcador).
 *
 *   (b) PERDA DE ATUALIZAÇÃO — `amount_paid` era lido, somado em memória e
 *       regravado. Dois eventos DIFERENTES simultâneos liam o mesmo valor e um
 *       sobrescrevia o outro. Medido no ambiente: 6 recebimentos concorrentes
 *       de R$100 resultaram em R$100 em vez de R$600.
 *
 * Agora a reivindicação da identidade e o incremento do valor são UMA ÚNICA
 * escrita (updateMany com guarda + $inc + $push). O banco aplica atualizações
 * por documento de forma atômica, então:
 *
 *   updated === 1  →  o valor foi somado exatamente uma vez
 *   updated === 0  →  o evento já havia sido contabilizado
 *
 * Não existe mais janela, e não existe mais perda de atualização. A brecha (a)
 * desaparece por construção: o marcador e o valor são o MESMO fato.
 *
 * ── TRÊS EFEITOS, TRÊS REIVINDICAÇÕES ATÔMICAS ──────────────────────────────
 *
 * Efeito 1 — amount_paid da Operation, reivindicado em `asaas_eventos_processados`.
 * Efeito 2 — LancamentoContaCorrente no extrato do CLIENTE, reivindicado em
 *            `asaas_lancamentos_gerados` e identificado por `asaas_event_key`.
 *            Conferir-e-criar NÃO é atômico: sob entregas simultâneas do mesmo
 *            evento dois processos criariam o lançamento. Por isso a criação é
 *            precedida de uma reivindicação atômica, e o perdedor apenas relê.
 *
 * Os campos DERIVADOS (balance_due, status) são recalculados a partir do
 * amount_paid autoritativo. Não são atômicos, mas convergem e nunca perdem
 * dinheiro — ver limitações no relatório.
 *
 * ── SEPARAÇÃO EXTRATO × CAIXA ───────────────────────────────────────────────
 *
 * O extrato do cliente (LancamentoContaCorrente) e o caixa da empresa
 * (CashFlow) são livros distintos. Este módulo só toca o extrato. O caminho
 * `parcela:` NÃO amortiza a Operation (operationId = null): o extrato é
 * registrado, mas amount_paid não é tocado — exatamente como antes.
 */
import { asaasEventKey, alreadyProcessed } from './operationAccounting.js';
import { EVENTO_STATUS, newEventoRecord, planRecovery } from './asaasEventJournal.js';

/* @sync:start — bloco idêntico em base44/shared/asaasReceiptFlow.js */

/* ── Efeito 1: valor na operação (atômico) ─────────────────────────────────── */

/**
 * Reivindica a identidade do evento E soma o valor na MESMA escrita.
 * É esta atomicidade que garante exatamente-uma-vez e impede a perda de
 * atualização entre eventos distintos.
 */
export async function applyReceiptAtomically(base44, operationId, key, value) {
  if (!operationId || !key) return { applied: false, reason: 'sem-alvo' };

  const res = await base44.asServiceRole.entities.Operation.updateMany(
    { id: operationId, asaas_eventos_processados: { $ne: key } },
    {
      $inc: { amount_paid: Number(value) || 0 },
      $push: { asaas_eventos_processados: key },
    }
  );

  return { applied: !!res && res.updated === 1 };
}

/**
 * Recalcula os campos DERIVADOS a partir do amount_paid autoritativo.
 * amount_paid nunca é escrito aqui — apenas lido.
 */
export async function recomputeDerived(base44, operationId) {
  const op = await base44.asServiceRole.entities.Operation.get(operationId);
  if (!op) return null;

  const totalRec = op.total_receivable || 0;
  const balanceDue = totalRec > 0 ? Math.max(0, totalRec - (op.amount_paid || 0)) : 0;

  const patch = { balance_due: balanceDue };
  if (totalRec > 0 && balanceDue <= 0.01 && op.status !== 'quitado') patch.status = 'quitado';

  await base44.asServiceRole.entities.Operation.update(operationId, patch);
  return { ...op, ...patch };
}

/* ── Efeito 2: extrato do cliente (uma vez por evento) ─────────────────────── */

/**
 * Reivindica o direito de CRIAR o lançamento deste evento. Atômico: sob
 * entregas simultâneas do mesmo evento, exatamente um processo vence.
 */
export async function claimLancamento(base44, key, targetId) {
  if (!key || !targetId) return false;
  const res = await base44.asServiceRole.entities.Operation.updateMany(
    { id: targetId, asaas_lancamentos_gerados: { $ne: key } },
    { $push: { asaas_lancamentos_gerados: key } }
  );
  return !!res && res.updated === 1;
}

/** Devolve a reivindicação quando a criação falha, para permitir nova tentativa. */
export async function releaseLancamento(base44, key, targetId) {
  if (!key || !targetId) return;
  await base44.asServiceRole.entities.Operation.updateMany(
    { id: targetId, asaas_lancamentos_gerados: key },
    { $pull: { asaas_lancamentos_gerados: key } }
  );
}

/**
 * Cria o lançamento no extrato do cliente no máximo UMA vez por evento.
 *
 * @param opts.targetId  operação que guarda a reivindicação (claim)
 * @param opts.force     recuperação: cria sem reivindicar. Só é usado em
 *                       eventos comprovadamente mortos (falha/travado), onde
 *                       nenhum processo vivo pode estar criando o mesmo
 *                       lançamento — por isso é seguro.
 */
export async function ensureLancamento(base44, key, payload, opts) {
  const o = opts || {};
  if (!key || !payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
    return { created: false, lancamento: null };
  }

  const ler = async () => {
    const l = await base44.asServiceRole.entities.LancamentoContaCorrente.filter({
      asaas_event_key: key,
    });
    return l && l.length > 0 ? l[0] : null;
  };

  const existente = await ler();
  if (existente) return { created: false, lancamento: existente };

  // Conferir-e-criar não é atômico: reivindica o direito de criar.
  if (o.targetId && !o.force) {
    const venceu = await claimLancamento(base44, key, o.targetId);
    if (!venceu) return { created: false, lancamento: await ler() };
  }

  try {
    const created = await base44.asServiceRole.entities.LancamentoContaCorrente.create({
      ...payload,
      asaas_event_key: key,
    });
    return { created: true, lancamento: created };
  } catch (e) {
    // Falhou depois de reivindicar: devolve a reivindicação para que a
    // recuperação (ou uma reentrega) possa tentar de novo.
    if (o.targetId) {
      try {
        await releaseLancamento(base44, key, o.targetId);
      } catch (_) {
        /* a recuperação ainda pode intervir com force */
      }
    }
    throw e;
  }
}

/* ── Diário do evento ──────────────────────────────────────────────────────── */

export async function openEvento(base44, record) {
  return base44.asServiceRole.entities.AsaasEvento.create(record);
}

export async function closeEvento(base44, id, effects) {
  await base44.asServiceRole.entities.AsaasEvento.update(id, {
    status: EVENTO_STATUS.CONTABILIZADO,
    accounted_at: new Date().toISOString(),
    error: '',
    effects: effects || {},
  });
}

export async function failEvento(base44, id, error, attempts) {
  await base44.asServiceRole.entities.AsaasEvento.update(id, {
    status: EVENTO_STATUS.FALHA,
    error: String((error && error.message) || error || '').slice(0, 500),
    attempts: (attempts || 0) + 1,
  });
}

/* ── Fluxo completo ────────────────────────────────────────────────────────── */

/**
 * Aplica um recebimento Asaas. Idempotente: reprocessar o mesmo evento não
 * duplica nem o valor nem o lançamento.
 *
 * @param input.operationId  alvo do efeito monetário (null no caminho parcela)
 * @param input.lancamentoPayload  payload do extrato, ou null para não lançar
 */
export async function processReceipt(base44, input) {
  const i = input || {};
  const key = asaasEventKey(i.paymentId);
  const now = i.now || new Date().toISOString();

  // O extrato é reivindicado na operação indicada pelo próprio payload — vale
  // para todos os caminhos, inclusive o de parcela (que não amortiza a op).
  const targetId = (i.lancamentoPayload && i.lancamentoPayload.operation_id) || i.operationId || null;

  // O diário é observabilidade e ponto de entrada da recuperação. Sua falha
  // NUNCA impede a contabilização — por isso o try/catch isolado.
  let journal = null;
  try {
    journal = await openEvento(base44, newEventoRecord({ ...i, key, now }));
  } catch (_) {
    journal = null;
  }

  try {
    // Efeito 1 — atômico e idempotente
    const r = i.operationId
      ? await applyReceiptAtomically(base44, i.operationId, key, i.value)
      : { applied: false };

    // Derivados (nunca tocam amount_paid)
    let op = null;
    if (i.operationId && r.applied) op = await recomputeDerived(base44, i.operationId);

    // Efeito 2 — no máximo um lançamento por evento
    const lanc = await ensureLancamento(base44, key, i.lancamentoPayload, { targetId });

    const effects = {
      amount_paid: r.applied,
      lancamento_id: lanc.lancamento ? lanc.lancamento.id : '',
    };
    if (journal) await closeEvento(base44, journal.id, effects);

    return {
      applied: r.applied,
      lancamento: lanc.lancamento,
      op,
      evento_id: journal ? journal.id : '',
    };
  } catch (e) {
    if (journal) {
      try {
        await failEvento(base44, journal.id, e, 0);
      } catch (_) {
        /* o diário é best-effort — nunca mascara o erro original */
      }
    }
    throw e;
  }
}

/* ── Recuperação ───────────────────────────────────────────────────────────── */

/**
 * Recupera um evento parcialmente processado.
 *
 * O ponto central: os efeitos são OBSERVADOS nas próprias entidades, nunca
 * presumidos a partir do diário. Assim, recuperar um evento cujo diário ficou
 * desatualizado (ou cujo fechamento falhou) não duplica nada.
 */
export async function recoverEvento(base44, record, now) {
  const nowIso = now || new Date().toISOString();
  const key = record.event_key;

  // Observa o efeito 1 no marcador atômico. Sem operação alvo não há efeito
  // monetário a verificar (caminho parcela).
  const op = record.operation_id
    ? await base44.asServiceRole.entities.Operation.get(record.operation_id)
    : null;
  const amountPaidAplicado = record.operation_id ? alreadyProcessed(op, key) : true;

  // Observa o efeito 2 na própria entidade.
  const lancamentos = await base44.asServiceRole.entities.LancamentoContaCorrente.filter({
    asaas_event_key: key,
  });
  const lancamentoExiste = !!(lancamentos && lancamentos.length > 0);

  const plan = planRecovery(record, { amountPaidAplicado, lancamentoExiste });

  const effects = {
    amount_paid: amountPaidAplicado,
    lancamento_id: lancamentoExiste ? lancamentos[0].id : '',
  };

  if (plan.needsAmountPaid && record.operation_id) {
    const r = await applyReceiptAtomically(base44, record.operation_id, key, record.value);
    effects.amount_paid = amountPaidAplicado || r.applied;
    if (r.applied) await recomputeDerived(base44, record.operation_id);
  }

  if (plan.needsLancamento) {
    // force: a recuperação só age sobre eventos mortos (falha/travado), então
    // nenhum processo vivo pode estar criando este lançamento agora.
    const l = await ensureLancamento(base44, key, record.lancamento_payload, { force: true });
    effects.lancamento_id = l.lancamento ? l.lancamento.id : '';
  }

  await base44.asServiceRole.entities.AsaasEvento.update(record.id, {
    status: EVENTO_STATUS.CONTABILIZADO,
    accounted_at: nowIso,
    error: '',
    effects,
  });

  return {
    event_key: key,
    recuperado: plan.needsAmountPaid || plan.needsLancamento,
    effects,
  };
}
/* @sync:end */