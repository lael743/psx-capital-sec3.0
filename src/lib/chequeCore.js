/**
 * Núcleo determinístico do fluxo de cheques.
 *
 * LÓGICA PURA — sem acesso a banco, sem imports de app. Testável isoladamente
 * (ver src/lib/chequeCore.test.js e src/lib/chequeCore.c4.test.js).
 *
 * ─── REGRA OFICIAL DAS DATAS (entidade Cheque) ───────────────────────────────
 *  compensation_date → VENCIMENTO previsto do título. NUNCA a data efetiva.
 *  compensated_at    → data EFETIVA da compensação (vazio quando não compensado).
 *  due_date          → vencimento; é campo da Operation, não existe no Cheque.
 *
 * Qualquer tela que exiba ou compare vencimento deve usar `chequeDueDate()`.
 * Qualquer tela que exiba data efetiva deve usar `chequeCompensatedAt()`.
 *
 * ─── IDENTIDADE DE EVENTO (C4) ───────────────────────────────────────────────
 * Cada evento financeiro (compensação, estorno) carrega um `compensation_token`
 * único, gravado no próprio cheque. A chave de idempotência do caixa deriva
 * desse token — NUNCA da data. Ver `chequeEventKeys()`.
 */

export const STATUS_COMPENSADO = 'compensado';

export function isCompensado(c) {
  return !!c && c.status === STATUS_COMPENSADO;
}

/** Vencimento do cheque (campo legado `compensation_date`). */
export function chequeDueDate(c) {
  return (c && c.compensation_date) || '';
}

/** Data efetiva da compensação. Nunca usar como vencimento. */
export function chequeCompensatedAt(c) {
  return (c && c.compensated_at) || '';
}

/**
 * Chave de ordenação determinística: data de referência + id.
 * O id como desempate garante que a ordem não dependa da ordem do array.
 */
export function chequeSortKey(c) {
  const ref = chequeCompensatedAt(c) || chequeDueDate(c);
  return `${ref}|${(c && c.id) || ''}`;
}

/**
 * Um cheque só deve ser compensado se NÃO estiver já compensado.
 * Leitura falha (null) → permite prosseguir, como no comportamento anterior.
 */
export function shouldCompensate(fresh) {
  return !(fresh && fresh.status === STATUS_COMPENSADO);
}

/** Um cheque só deve ser estornado se estiver de fato compensado. */
export function shouldRevert(fresh) {
  return !!fresh && fresh.status === STATUS_COMPENSADO;
}

/* ────────────────────────────────────────────────────────────────────────────
 * IDENTIDADE DE EVENTO
 * ──────────────────────────────────────────────────────────────────────────── */

/** Token único por evento. Injetável nos testes. */
export function makeEventToken() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Chaves de origem (source_type + source_id) dos eventos de um cheque.
 * ÚNICA definição dessas chaves no sistema — nenhuma tela deve montá-las.
 *
 * Por que NÃO usar a data na chave:
 *   compensar → estornar → compensar no MESMO DIA produziria a mesma chave e o
 *   segundo lançamento seria descartado como duplicado, deixando o banco
 *   creditado sem contrapartida no caixa. O token é único por evento, então
 *   cada compensação tem identidade própria e o mesmo dia nunca colide.
 *
 * @param {string} chequeId
 * @param {string} compensationToken - token da compensação sendo tratada.
 *        Na compensação é o token NOVO; no estorno é o token da compensação
 *        que está sendo revertida.
 */
export function chequeEventKeys(chequeId, compensationToken) {
  const base = `${chequeId}#${compensationToken}`;
  return {
    compensation: { source_type: 'cheque_compensacao', source_id: base },
    reversal: { source_type: 'cheque_estorno_compensacao', source_id: `${base}#estorno` },
  };
}

/**
 * Token que identifica a compensação a ser estornada.
 * Cheques legados (compensados antes da C4) não têm token: cai para a data
 * efetiva, que ainda é estável por evento.
 */
export function compensationTokenOf(cheque) {
  if (!cheque) return '';
  if (cheque.compensation_token) return cheque.compensation_token;
  const legado = chequeCompensatedAt(cheque) || chequeDueDate(cheque);
  return `legado:${legado}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * CONCORRÊNCIA — compare-and-swap
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Grava o novo estado do cheque SOMENTE se o status atual ainda for `fromStatus`.
 *
 * `store.updateWhere` deve devolver `{ updated: <n> }` — o nº de registros
 * efetivamente alterados (comportamento confirmado do updateMany da plataforma).
 *   updated === 1 → esta tentativa venceu
 *   updated === 0 → outra execução já mudou o estado; nada foi aplicado
 *
 * Isso é a proteção efetiva contra duas compensações simultâneas: a segunda
 * encontra o status já alterado e não altera nenhum registro.
 *
 * @returns {Promise<{claimed: boolean, updated: number|null, method: string}>}
 */
export async function claimCheque(store, chequeId, fromStatus, patch, token) {
  const res = await store.updateWhere(
    { id: chequeId, status: fromStatus },
    { $set: patch }
  );
  const updated = res && typeof res.updated === 'number' ? res.updated : null;

  if (updated !== null) {
    return { claimed: updated === 1, updated, method: 'contador' };
  }

  // Fallback defensivo: se a plataforma deixar de devolver o contador, confere
  // na releitura se foi o NOSSO token que ficou gravado.
  const back = await store.read(chequeId);
  const claimed = !!back && back.compensation_token === token && back.status === patch.status;
  return { claimed, updated: null, method: 'token' };
}

/* ────────────────────────────────────────────────────────────────────────────
 * PARCELAS — identidade persistente e vínculo explícito
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Identidade de uma parcela.
 * Usa `inst.id` quando a agenda já o possui. Agendas antigas (sem id) recebem
 * uma chave derivada de vencimento + valor + número — nunca da posição.
 */
export function installmentIdentity(inst) {
  if (inst && inst.id) return String(inst.id);
  const numero = (inst && (inst.number ?? inst.installment_number ?? inst.numero)) ?? '';
  return `legacy:${(inst && inst.due_date) || ''}|${(inst && inst.value) ?? ''}|${numero}`;
}

/**
 * Identidades de uma agenda inteira, desempatando parcelas TOTALMENTE
 * idênticas (mesma data, mesmo valor, mesmo número) com um ordinal.
 *
 * Parcelas indistinguíveis são intercambiáveis: o que se garante é a
 * QUANTIDADE de parcelas quitadas, não qual rótulo entre as idênticas ficou pago.
 */
export function buildInstallmentIdentities(installments) {
  const seen = new Map();
  return (installments || []).map((inst) => {
    const base = installmentIdentity(inst);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

/**
 * Chave estável de uma parcela: vencimento + valor + número.
 * NÃO usa a posição no array — assim o resultado não muda se a agenda de
 * parcelas for reordenada por uma edição.
 */
export function installmentSortKey(inst) {
  const numero = inst.number ?? inst.installment_number ?? inst.numero ?? '';
  return `${inst.due_date || ''}|${inst.value ?? ''}|${numero}`;
}

/** Soma dos valores de face dos cheques compensados (opcionalmente excluindo um). */
export function sumCompensated(cheques, excludeChequeId) {
  return (cheques || [])
    .filter((c) => isCompensado(c) && c.id !== excludeChequeId)
    .reduce((s, c) => s + (c.valor_face || c.value || 0), 0);
}

/**
 * Aloca cheques compensados às parcelas de uma operação — DETERMINÍSTICO.
 *
 * Regra: cada cheque compensado baixa no máximo UMA parcela, e cada parcela
 * é baixada por no máximo UM cheque (alocação um-a-um). O casamento usa o
 * vencimento da parcela (`due_date`) contra o vencimento do cheque
 * (`compensation_date`).
 *
 * Determinismo: ambos os lados são ordenados por chave estável antes do
 * casamento (data + id no lado dos cheques; vencimento + valor + número no
 * lado das parcelas). O resultado depende apenas do CONJUNTO de entradas —
 * nunca da ordem incidental dos arrays nem da posição da parcela.
 *
 * Vínculo explícito: cada parcela devolvida carrega `id` (identidade estável)
 * e `settled_by` (id do cheque que a quitou, ou null). O vínculo deixa de ser
 * apenas inferido a cada leitura.
 *
 * @param {Array} installments - installment_schedule da operação
 * @param {Array} compensatedCheques - todos os cheques da operação
 * @param {string} [excludeChequeId] - cheque a ignorar (usado no estorno)
 */
export function allocateInstallments(installments, compensatedCheques, excludeChequeId) {
  const list = Array.isArray(installments) ? installments : [];
  if (list.length === 0) return list;

  const identities = buildInstallmentIdentities(list);

  const cheques = (compensatedCheques || [])
    .filter((c) => isCompensado(c) && c.id !== excludeChequeId)
    .slice()
    .sort((a, b) => {
      const ka = chequeSortKey(a);
      const kb = chequeSortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

  const ordered = list
    .map((inst, i) => ({ inst, i }))
    .sort((x, y) => {
      const kx = installmentSortKey(x.inst);
      const ky = installmentSortKey(y.inst);
      if (kx !== ky) return kx < ky ? -1 : 1;
      // Parcelas totalmente idênticas: desempate final pelo índice original
      return x.i - y.i;
    });

  const settledByIdx = new Map();
  for (const ch of cheques) {
    const due = chequeDueDate(ch);
    const target = ordered.find(({ inst, i }) => !settledByIdx.has(i) && (inst.due_date || '') === due);
    if (target) settledByIdx.set(target.i, ch.id || null);
  }

  return list.map((inst, i) => {
    const isPaid = settledByIdx.has(i);
    // Uma parcela que deixa de estar paga volta a 'pendente';
    // status manuais (ex: 'atrasado') são preservados.
    const status = isPaid ? 'pago' : (inst.status === 'pago' ? 'pendente' : (inst.status || 'pendente'));
    return {
      ...inst,
      id: inst.id || identities[i],
      settled_by: isPaid ? settledByIdx.get(i) : null,
      paid: isPaid,
      status,
    };
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * MATEMÁTICA DA OPERAÇÃO
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `amount_paid` derivado SEM destruir componentes independentes.
 *
 * `amount_paid` acumula cheques compensados E pagamentos independentes
 * (registro manual, baixa de lançamento, Asaas). Recalcular o campo inteiro a
 * partir dos cheques APAGARIA esses pagamentos — era o defeito do estorno.
 *
 * Por isso o total de cheques é gravado em `op.cheques_compensados_total` e
 * apenas a DIFERENÇA é aplicada sobre o valor corrente.
 */
export function computeAmountPaid(op, totalChequesCompensados) {
  const total = totalChequesCompensados || 0;
  const amountPaid = (op && op.amount_paid) || 0;

  // Operação legada (sem marcador): assume que a parcela de cheques JÁ está
  // refletida em amount_paid — nunca infla na primeira execução. A partir daí o
  // marcador gravado assume o controle e a diferença passa a ser exata.
  const temMarcador = op && typeof op.cheques_compensados_total === 'number';
  const marcador = temMarcador ? op.cheques_compensados_total : Math.min(amountPaid, total);

  return amountPaid + (total - marcador);
}

/** Saldo devedor = total a receber − total recebido (nunca negativo). */
export function computeBalanceDue(totalReceivable, totalRecebido) {
  return Math.max(0, (totalReceivable || 0) - (totalRecebido || 0));
}

/**
 * Status da operação a partir do saldo e do atraso.
 * Não altera operações que ainda não foram ativadas (pendente_contrato).
 */
export function computeOperationStatus(op, isQuitado, overdueDays) {
  if (isQuitado) return 'quitado';
  if (op.status === 'pendente_contrato') return op.status;
  if (!overdueDays || overdueDays <= 0) return 'ativo';
  if (overdueDays <= 60) return 'atrasado';
  return 'inadimplente';
}

/**
 * Lucro realizado.
 * Só é recalculado quando a operação está quitada; caso contrário PRESERVA o
 * valor já registrado (um estorno parcial não zera o lucro da operação).
 */
export function computeRealizedProfit(op, totalRecebido, isQuitado) {
  if (!isQuitado) return (op && op.realized_profit) || 0;
  return totalRecebido - ((op && op.gross_value) || 0) - ((op && op.capital_cost) || 0);
}

/* ────────────────────────────────────────────────────────────────────────────
 * RECUPERAÇÃO — detecção de lacuna de lançamento
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Detecta se um cheque compensado ficou SEM o lançamento de caixa correspondente
 * (falha parcial entre a gravação do cheque e a do caixa).
 *
 * Só DETECTA — não corrige nem recredita o banco. O saldo bancário é um total
 * corrente e não pode ser reparado automaticamente sem arriscar crédito duplo.
 *
 * @returns {null|{reason: string, source_type?: string, source_id?: string}}
 */
export function detectLedgerGap(cheque, cashflows) {
  if (!isCompensado(cheque)) return null;
  if (!cheque.compensation_token) return { reason: 'sem_token' };

  const key = chequeEventKeys(cheque.id, cheque.compensation_token).compensation;
  const found = (cashflows || []).some(
    (cf) => cf.source_type === key.source_type && cf.source_id === key.source_id
  );
  if (found) return null;
  return { reason: 'lancamento_ausente', source_type: key.source_type, source_id: key.source_id };
}

/* ────────────────────────────────────────────────────────────────────────────
 * LOTE
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Executa uma operação idempotente item a item, tolerando FALHA PARCIAL.
 *
 * Não existe transação atômica no cliente. O mecanismo seguro adotado é:
 *  1. Cada item é independente — uma falha NÃO interrompe os demais.
 *  2. `isAlreadyDone` é a guarda de idempotência: um item já concluído é
 *     pulado (nunca creditado duas vezes).
 *  3. Cada efeito colateral deve ser idempotente por chave de origem
 *     (source_type + source_id), de modo que reprocessar o lote convirja.
 *  4. `failed` devolve os itens que falharam, para reprocessamento.
 *
 * @returns {{ ok: Array, skipped: Array, failed: Array<{item, error}> }}
 */
export async function runIdempotentBatch(items, { isAlreadyDone, run, onProgress }) {
  const list = Array.isArray(items) ? items : [];
  const ok = [];
  const skipped = [];
  const failed = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (onProgress) onProgress(i, list.length, item);
    try {
      if (isAlreadyDone && (await isAlreadyDone(item))) {
        skipped.push(item);
        continue;
      }
      await run(item);
      ok.push(item);
    } catch (e) {
      failed.push({ item, error: (e && e.message) || String(e) });
    }
  }

  if (onProgress) onProgress(list.length, list.length, null);
  return { ok, skipped, failed };
}

/* ────────────────────────────────────────────────────────────────────────────
 * M2 — RESOLUÇÃO DE CHEQUE DEVOLVIDO
 *
 * Um cheque devolvido se resolve de três formas: substituído por outro cheque,
 * prorrogado ou pago. As três compartilham o MESMO evento de resolução (uma
 * chave por cheque) e a taxa de devolução entra na operação UMA única vez —
 * ela já nasce incorporada a `total_receivable`, nunca somada de novo.
 * ──────────────────────────────────────────────────────────────────────────── */

export const STATUS_DEVOLVIDO = 'devolvido';

/** Estados que só existem DEPOIS de uma resolução. */
export const STATUS_RESOLVIDO = Object.freeze([
  'resolvido_pago',
  'resolvido_substituido',
  'resolvido_prorrogado',
]);

export const MODALIDADES_RESOLUCAO = Object.freeze(['novo_cheque', 'prorrogacao', 'pagamento']);

/** Modalidade → status final do cheque devolvido. */
export const STATUS_POR_MODALIDADE = Object.freeze({
  novo_cheque: 'resolvido_substituido',
  prorrogacao: 'resolvido_prorrogado',
  pagamento: 'resolvido_pago',
});

/**
 * Chave do evento de RESOLUÇÃO de um cheque.
 * É a MESMA string já usada antes da M2 como chave do recebimento
 * (`resolucao_cheque:<id>`) — nenhuma resolução antiga é recreditada.
 */
export function resolucaoEventKey(chequeId) {
  return `resolucao_cheque:${chequeId}`;
}

/**
 * Chave do evento de RECEBIMENTO DA TAXA — distinta da chave da resolução.
 * Efeitos financeiros diferentes nunca compartilham chave: receber a taxa não
 * pode ser confundido com receber o principal, inclusive quando vêm juntos.
 */
export function taxaDevolucaoEventKey(chequeId) {
  return `cheque_taxa_devolucao:${chequeId}`;
}

export function round2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

/** Dias inteiros entre duas datas; 0 quando a segunda não é posterior. */
export function diasEntreDatas(base, alvo) {
  if (!base || !alvo) return 0;
  const dias = Math.round((new Date(alvo) - new Date(base)) / 86400000);
  return Number.isFinite(dias) && dias > 0 ? dias : 0;
}

/**
 * Juros da prorrogação de um cheque devolvido.
 * FÓRMULA PRESERVADA do modal original: taxa diária arredondada PARA CIMA em
 * duas casas de percentual e depois convertida para fração.
 */
export function calcJurosResolucao(valor, taxaMensalPct, dias) {
  const taxa = Number(taxaMensalPct) || 0;
  const d = Number(dias) || 0;
  if (taxa <= 0 || d <= 0) return 0;
  const diaria = Math.ceil((taxa / 30) * 100) / 100 / 100;
  return round2((Number(valor) || 0) * diaria * d);
}

/** Parte da taxa de devolução que ainda NÃO foi recebida. */
export function taxaDevolucaoPendente(cheque) {
  const total = Number(cheque && cheque.taxa_devolucao) || 0;
  const recebida = Number(cheque && cheque.taxa_recebida) || 0;
  return Math.max(0, round2(total - recebida));
}

/* ────────────────────────────────────────────────────────────────────────────
 * M2 — BASE CONGELADA DA TAXA, PERÍODO DE JUROS E DEVOLUÇÃO FÍSICA
 *
 * A taxa é percentual sobre o valor de FACE ORIGINAL do cheque, congelado no
 * momento da cobrança (`taxa_base_valor`). Prorrogar não altera o valor de face
 * e substituir herda apenas o principal em aberto: nenhuma das duas pode mudar
 * a base de uma taxa já cobrada.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Base congelada da taxa: congelada > face > value (compatibilidade histórica). */
export function baseTaxaCongelada(cheque) {
  const congelada = Number(cheque && cheque.taxa_base_valor);
  if (Number.isFinite(congelada) && congelada > 0) return round2(congelada);
  const face = Number(cheque && cheque.valor_face);
  if (Number.isFinite(face) && face > 0) return round2(face);
  return round2(cheque && cheque.value);
}

/** Taxa devida = base congelada × percentual. Percentual 0 → sem taxa. */
export function calcTaxaDevolucao(base, percentual) {
  const b = Number(base) || 0;
  const p = Number(percentual) || 0;
  if (b <= 0 || p <= 0) return 0;
  return round2(b * (p / 100));
}

/**
 * Início do próximo período de juros.
 * Parte do VENCIMENTO ORIGINAL e nunca retrocede além do que já foi cobrado:
 * é essa comparação que impede dois períodos de juros sobrepostos.
 */
export function inicioJurosResolucao(cheque) {
  const cobradoAte = (cheque && cheque.juros_cobrados_ate) || '';
  const vencimento = chequeDueDate(cheque);
  if (!cobradoAte) return vencimento;
  if (!vencimento) return cobradoAte;
  return cobradoAte > vencimento ? cobradoAte : vencimento;
}

/** Chave do evento de DEVOLUÇÃO FÍSICA — registra o ato, não movimenta saldo. */
export function chaveDevolucaoFisica(chequeId) {
  return `devolucao_fisica_cheque:${chequeId}`;
}

/**
 * Valor recebível no ato da resolução: principal + taxa quando a taxa foi
 * INCORPORADA à obrigação. Taxa separada tem evento próprio de recebimento.
 */
export function valorRecebivelResolucao(cheque) {
  const principal = round2(cheque && cheque.value);
  const taxa = round2(cheque && cheque.taxa_devolucao);
  return round2(principal + (cheque && cheque.taxa_incorporada === true ? taxa : 0));
}