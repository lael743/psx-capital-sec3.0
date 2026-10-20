/**
 * Escrita do cronograma de parcelas pelos FORMULÁRIOS.
 *
 * ── O PROBLEMA ──────────────────────────────────────────────────────────────
 *
 * Um formulário altera TERMOS COMERCIAIS: vencimento, valor, número, principal,
 * juros, dias. Ele NÃO é dono do estado FINANCEIRO da parcela — recebimento
 * (`paid`, `paid_date`, `settled_by`), cobrança (`asaas_*`) e status. Esse
 * estado é escrito concorrentemente pelo webhook, pela conciliação, pelo
 * cancelamento e pela compensação de cheques.
 *
 * Um formulário aberto antes de um recebimento regravaria o array inteiro com a
 * versão velha e apagaria o recebimento — silenciosamente, sem erro nenhum.
 *
 * ── AS DUAS PROTEÇÕES ───────────────────────────────────────────────────────
 *
 * 1. MERGE: os campos financeiros da versão PERSISTIDA são carregados para a
 *    versão nova, casando pela identidade estável da parcela. O formulário
 *    nunca escreve por cima de dinheiro.
 *
 * 2. BLOQUEIO: se o formulário mudaria os termos de uma parcela que já tem
 *    recebimento ou cobrança ativa, a gravação é recusada com mensagem clara.
 *    Alterar as outras parcelas continua permitido.
 *
 * A associação é feita por `id` (identidade estável da parcela, ver
 * chequeCore.buildInstallmentIdentities) e, na falta dele, por
 * vencimento + valor + número.
 */

/** Campos que pertencem ao estado financeiro, não ao formulário. */
export const CAMPOS_FINANCEIROS = [
  'id',
  'paid',
  'paid_date',
  'settled_by',
  'status',
  'asaas_payment_id',
  'asaas_payment_status',
  'asaas_invoice_url',
  'asaas_boleto_line',
  'asaas_pix_qrcode',
  'asaas_billing_type',
];

/** Chave de casamento quando a parcela ainda não tem `id` persistido. */
function chaveComercial(p) {
  return [
    String(p?.due_date || ''),
    Number(p?.value || 0).toFixed(2),
    String(p?.number ?? ''),
  ].join('|');
}

/** Indexa o cronograma persistido por `id` e por chave comercial. */
function indexar(schedule) {
  const porId = new Map();
  const porChave = new Map();
  for (const p of Array.isArray(schedule) ? schedule : []) {
    if (p?.id) porId.set(p.id, p);
    porChave.set(chaveComercial(p), p);
  }
  return { porId, porChave };
}

/** A parcela persistida correspondente, se existir. */
export function parcelaPersistida(nova, indexado) {
  if (nova?.id && indexado.porId.has(nova.id)) return indexado.porId.get(nova.id);
  return indexado.porChave.get(chaveComercial(nova)) || null;
}

/**
 * A parcela tem vínculo financeiro? Recebimento, cheque ou cobrança ativa.
 * `status` sozinho não conta: uma parcela pode estar 'atrasado' sem dinheiro.
 */
export function temVinculoFinanceiro(p) {
  if (!p) return false;
  return (
    p.paid === true ||
    !!p.paid_date ||
    !!p.settled_by ||
    !!p.asaas_payment_id
  );
}

/**
 * Carrega os campos financeiros da versão persistida para a versão nova.
 * Parcelas novas (sem correspondência) ficam como o formulário as criou.
 */
export function mergeFinancialFields(novoSchedule, persistido) {
  const idx = indexar(persistido);
  return (Array.isArray(novoSchedule) ? novoSchedule : []).map((nova) => {
    const atual = parcelaPersistida(nova, idx);
    if (!atual) return { ...nova };
    const merged = { ...nova };
    for (const campo of CAMPOS_FINANCEIROS) {
      if (atual[campo] !== undefined) merged[campo] = atual[campo];
    }
    return merged;
  });
}

/**
 * Parcelas que o formulário vai REFAZER em termos comerciais apesar de já
 * terem dinheiro ou cobrança. Vazio = gravação liberada.
 *
 * @returns {Array<{numero:number, motivo:string}>}
 */
export function conflitosFinanceiros(novoSchedule, persistido) {
  const idx = indexar(persistido);
  const out = [];

  for (const nova of Array.isArray(novoSchedule) ? novoSchedule : []) {
    const atual = parcelaPersistida(nova, idx);
    if (!temVinculoFinanceiro(atual)) continue;

    const vencimentoMudou = String(nova?.due_date || '') !== String(atual?.due_date || '');
    const valorMudou = Number(nova?.value || 0).toFixed(2) !== Number(atual?.value || 0).toFixed(2);
    if (!vencimentoMudou && !valorMudou) continue;

    out.push({
      numero: atual.number ?? nova?.number ?? 0,
      motivo: atual?.asaas_payment_id
        ? 'cobrança Asaas ativa'
        : atual?.settled_by
          ? 'cheque compensado'
          : 'recebimento registrado',
    });
  }
  return out;
}

/** Mensagem única para o usuário quando há conflito. */
export function mensagemConflito(conflitos) {
  const lista = conflitos
    .slice(0, 3)
    .map((c) => `nº ${c.numero} (${c.motivo})`)
    .join(', ');
  const resto = conflitos.length > 3 ? ` e mais ${conflitos.length - 3}` : '';
  return `As parcelas ${lista}${resto} já têm recebimento ou cobrança e não podem ser refeitas por este formulário. Recarregue a página para ver o estado atual.`;
}

/**
 * Grava a operação condicionada ao `amount_paid` observado.
 * Impede que uma tela aberta antes de um recebimento grave por cima dele.
 *
 * @returns {Promise<boolean>} `true` = gravado; `false` = conflito
 */
export async function salvarCondicionado(base44, operacaoId, amountPaidObservado, payload) {
  const filtro = {
    id: operacaoId,
    amount_paid: Number(amountPaidObservado) || 0,
  };
  const res = await base44.entities.Operation.updateMany(filtro, { $set: payload });
  return !!res && res.updated === 1;
}

/**
 * A edição COMPLETA de uma operação (tela de operação) recria o cronograma e os
 * títulos e zera `amount_paid`. Isso é correto para um rascunho e DESTRUTIVO
 * para uma operação que já recebeu dinheiro ou emitiu cobrança.
 *
 * Não alteramos a regra de contabilização: recusamos a edição completa e
 * apontamos o caminho seguro, em vez de apagar recebimento em silêncio.
 *
 * @returns {Promise<string|null>} mensagem de bloqueio, ou null se liberado
 */
export async function bloqueioEdicaoCompleta(base44, operacaoId) {
  const op = await base44.entities.Operation.get(operacaoId);
  if (!op) return null;

  const recebido = Number(op.amount_paid) || 0;
  const comVinculo = (op.installment_schedule || []).filter(temVinculoFinanceiro);
  if (recebido <= 0 && comVinculo.length === 0) return null;

  return 'Esta operação já tem recebimento, cobrança ou cheque compensado. A edição completa recria o cronograma e zeraria o valor recebido — use "Editar condições" ou "Adicionar título" para alterar sem perder o estado financeiro.';
}