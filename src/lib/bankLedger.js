/**
 * D3 — PRIMITIVAS ATÔMICAS DE SALDO BANCÁRIO.
 *
 * Este módulo é PURO quanto a transporte: não importa o SDK. Recebe um `store`
 * com `updateWhere(query, update)` e devolve o resultado. Assim as mesmas
 * garantias são exercitadas por teste (store falso, concorrência real em
 * memória) e usadas em produção (store base44) sem reescrever a regra.
 *
 * ── O QUE A PLATAFORMA REALMENTE OFERECE ───────────────────────────────────
 *
 * NÃO existe transação entre documentos. O que existe é
 * `updateMany(query, update)`: atômico POR DOCUMENTO, com operadores do
 * MongoDB. É esse primitivo que serve de compare-and-swap.
 *
 * Por isso a idempotência do saldo vive NO PRÓPRIO DOCUMENTO DO BANCO — a
 * guarda, o incremento e o marcador viajam na MESMA escrita:
 *
 *   updateMany(
 *     { id: bankId, applied_ledger_keys: { $ne: eventKey } },
 *     { $inc: { current_balance: delta },
 *       $push: { applied_ledger_keys: eventKey } }
 *   )
 *
 * Consequências REAIS (verificadas, não presumidas):
 *  · dois incrementos concorrentes na MESMA conta não se perdem — `$inc` é
 *    aplicado pelo servidor sobre o valor vigente, não sobre uma leitura
 *    antiga do cliente;
 *  · o mesmo evento aplicado duas vezes não credita duas vezes — a segunda
 *    chamada não casa a guarda e devolve `ja_aplicado`;
 *  · NÃO há atomicidade ENTRE documentos: o lançamento em `CashFlow` e o
 *    saldo em `Banco` são duas escritas distintas. Quem fecha essa janela é a
 *    detecção + recuperação em `transferFlow.js` — nunca a suposição de
 *    transação.
 *
 * LIMITAÇÃO CONHECIDA: `applied_ledger_keys` cresce com o número de eventos
 * por conta. Purgar chaves antigas quebra a garantia do evento correspondente,
 * então a poda só pode remover eventos comprovadamente fora de qualquer janela
 * de reprocessamento.
 */

/** Campo do Banco que guarda as chaves de evento já aplicadas. */
export const LEDGER_KEYS_FIELD = 'applied_ledger_keys';

/** Janela de validade de uma reivindicação de lançamento (ms). */
export const TTL_REIVINDICACAO_MS = 5 * 60 * 1000;

/** Categoria de caixa das pernas de transferência. */
export const CATEGORIA_TRANSFERENCIA = 'transferencia_interna';

/** Origem declarada em CashFlow para as pernas de transferência. */
export const SOURCE_TRANSFERENCIA = 'transferencia_bancaria';

// ───────────────────────────── chaves de evento ────────────────────────────

/** `transfer:<id>:<perna>` — chave do efeito de saldo da perna. */
export function chavePerna(transferId, leg) {
  return `transfer:${transferId}:${leg}`;
}

/** Chave do evento de ESTORNO da perna. Distinta da original de propósito. */
export function chaveEstornoPerna(transferId, leg) {
  return `transfer:${transferId}:estorno:${leg}`;
}

/** Origem gravada em `CashFlow.source_id` — identifica a perna sem ambiguidade. */
export function origemPerna(transferId, leg) {
  return `${transferId}:${leg}`;
}

/** `kind:<id>` — chave genérica para eventos de operação (recebimento, repasse). */
export function chaveEvento(kind, id) {
  return `${kind}:${id}`;
}

/** Id estável para uma nova transferência. */
export function novoTransferId() {
  const g = globalThis.crypto;
  if (g && typeof g.randomUUID === 'function') return g.randomUUID();
  return `tr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ───────────────────────────── aplicação atômica ───────────────────────────

/**
 * Aplica `delta` ao saldo de UMA conta, exatamente uma vez por `eventKey`.
 *
 * @param {Object} p
 * @param {{updateWhere:(q:object,u:object)=>Promise<{updated:number}>}} p.store
 * @param {string} p.bankId
 * @param {number} p.delta    positivo credita, negativo debita
 * @param {string} p.eventKey identidade do evento financeiro
 * @returns {Promise<{status:'aplicado'|'ja_aplicado'|'sem_conta'|'sem_efeito'}>}
 */
export async function applyBankDelta({ store, bankId, delta, eventKey }) {
  if (!bankId) return { status: 'sem_conta' };
  const valor = Number(delta);
  if (!Number.isFinite(valor) || valor === 0) return { status: 'sem_efeito' };
  if (!eventKey) throw new Error('[BankLedger] eventKey é obrigatório — sem ele não há idempotência');

  const res = await store.updateWhere(
    { id: bankId, [LEDGER_KEYS_FIELD]: { $ne: eventKey } },
    { $inc: { current_balance: valor }, $push: { [LEDGER_KEYS_FIELD]: eventKey } }
  );

  const updated = Number(res && res.updated) || 0;
  return { status: updated > 0 ? 'aplicado' : 'ja_aplicado' };
}

// ─────────────────────────── regra de transferência ────────────────────────

/** Validação da solicitação. Devolve mensagem ou null. */
export function validarTransferencia({ fromBankId, toBankId, amount }) {
  if (!fromBankId) return 'Conta de origem é obrigatória';
  if (!toBankId) return 'Conta de destino é obrigatória';
  if (fromBankId === toBankId) return 'Origem e destino devem ser contas diferentes';
  const valor = Number(amount);
  if (!Number.isFinite(valor) || valor <= 0) return 'Valor deve ser maior que zero';
  return null;
}

/**
 * Plano das duas pernas. Ambas carregam `bankId` — é o que corrige o defeito
 * histórico de pernas sem conta.
 */
export function planoDePernas({ transferId, fromBankId, toBankId, amount }) {
  const valor = Number(amount);
  return [
    {
      leg: 'saida',
      bankId: fromBankId,
      delta: -valor,
      type: 'saida',
      key: chavePerna(transferId, 'saida'),
      sourceId: origemPerna(transferId, 'saida'),
    },
    {
      leg: 'entrada',
      bankId: toBankId,
      delta: valor,
      type: 'entrada',
      key: chavePerna(transferId, 'entrada'),
      sourceId: origemPerna(transferId, 'entrada'),
    },
  ];
}

/** Plano do estorno: inverte sinal e conta, com chaves próprias. */
export function planoDeEstorno({ transferId, fromBankId, toBankId, amount }) {
  const valor = Number(amount);
  return [
    {
      leg: 'entrada',
      bankId: fromBankId,
      delta: valor,
      type: 'entrada',
      key: chaveEstornoPerna(transferId, 'entrada'),
      sourceId: `${transferId}:estorno:entrada`,
    },
    {
      leg: 'saida',
      bankId: toBankId,
      delta: -valor,
      type: 'saida',
      key: chaveEstornoPerna(transferId, 'saida'),
      sourceId: `${transferId}:estorno:saida`,
    },
  ];
}

/**
 * Diagnóstico do diário — o que está aplicado, o que ficou pela metade.
 * Puro: recebe o registro e devolve o estado. Não corrige nada.
 */
export function diagnosticarTransferencia(doc) {
  if (!doc) return { status: 'ausente', completo: false, parcial: false, pernas: [] };

  const legs = doc.legs || {};
  const pernas = ['saida', 'entrada'].map((leg) => {
    const l = legs[leg] || {};
    const saldoAplicado = l.banco === 'aplicado' || l.banco === 'ja_aplicado';
    const lancamentoPresente = Boolean(l.cashflow_id);
    return {
      leg,
      saldo_aplicado: saldoAplicado,
      lancamento_presente: lancamentoPresente,
      // Efeito pela metade: o saldo mudou e o lançamento não existe.
      incompleta: saldoAplicado && !lancamentoPresente,
    };
  });

  const aplicadas = pernas.filter((p) => p.saldo_aplicado).length;
  return {
    status: doc.status || 'pendente',
    pernas,
    aplicadas,
    completo: aplicadas === 2 && pernas.every((p) => p.lancamento_presente),
    parcial: aplicadas > 0 && aplicadas < 2,
    recuperavel: pernas.some((p) => p.incompleta),
  };
}