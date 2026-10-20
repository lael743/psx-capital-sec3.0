/**
 * M1 — COMPENSAÇÃO E ESTORNO DE CHEQUE: ORQUESTRAÇÃO ÚNICA.
 *
 * Antes da M1 esta orquestração vivia no navegador (`chequeOps.js`) e qualquer
 * usuário autenticado podia executá-la chamando o SDK direto. Agora ela roda na
 * função `chequeEvento`, com privilégio de serviço e autorização verificada.
 *
 * ── INJEÇÃO DE I/O ─────────────────────────────────────────────────────────
 * O módulo NÃO importa o cliente da plataforma nem o helper de caixa: recebe
 * `io` pronto de quem chama (a função de servidor monta com os módulos reais;
 * o teste monta com o simulador). Assim a MESMA orquestração é exercitada nos
 * dois ambientes, sem cópia adaptada.
 *
 *   io = {
 *     chequeStore,      // { updateWhere(query,update), read(id) }  — CAS
 *     bancoStore,       // { updateWhere(query,update), get(id) }   — saldo
 *     criarLancamento,  // (params) => { status:'created'|'duplicate' }
 *     sincronizar,      // (operationId, excludeChequeId?) => void
 *     lerLancamentos,   // (query) => Array  (somente diagnóstico)
 *   }
 *
 * ── CÓPIA DUPLICADA (obrigatória) ──────────────────────────────────────────
 * Existe em `src/lib/chequeEventFlow.js` (testes, roda em node) e
 * `base44/shared/chequeEventFlow.js` (função de servidor). Diferem APENAS pela
 * extensão dos imports. O teste M1.1 falha se qualquer outra linha divergir.
 *
 * ── ORDEM DAS ESCRITAS (idêntica à anterior — nada foi reordenado) ─────────
 *   1. compare-and-swap no cheque (status + token)   ← ponto de não-retorno
 *   2. lançamento de caixa com chave de origem
 *   3. incremento atômico do saldo, guardado pela chave do evento
 *   4. sincronização cheque → operação → parcelas
 *
 * Só o vencedor do passo 1 prossegue. É essa guarda — não uma transação — que
 * impede crédito duplo.
 *
 * ── ÚNICA REGRA FINANCEIRA NOVA (aprovada em M1, item 6) ───────────────────
 * O estorno exige EVIDÊNCIA do crédito original: a chave do evento de
 * compensação precisa estar gravada em `applied_ledger_keys` da conta que
 * será debitada. Cheques marcados como `compensado` apenas por quitação de
 * operação (`syncTitulosByOperacaoStatus`) não têm essa chave e portanto não
 * podem gerar débito bancário. Isso não altera nenhuma fórmula, alocação ou
 * critério de baixa: apenas impede debitar conta que nunca recebeu.
 */

import {
  STATUS_COMPENSADO,
  makeEventToken,
  chequeEventKeys,
  compensationTokenOf,
  claimCheque,
} from './chequeCore.ts';
import { applyBankDelta, LEDGER_KEYS_FIELD } from './bankLedger.ts';

/** Motivos de NÃO aplicação — nenhum deles produz efeito. */
export const MOTIVOS = Object.freeze({
  ESTADO_JA_ALTERADO: 'estado_ja_alterado',
  NAO_COMPENSADO: 'nao_compensado',
  SEM_CREDITO_COMPROVADO: 'sem_credito_comprovado',
  SEM_CONTA: 'sem_conta',
});

/** Chave do evento de crédito — a mesma gravada em `applied_ledger_keys`. */
export function chaveDoCredito(chequeId, compensationToken) {
  const keys = chequeEventKeys(chequeId, compensationToken);
  return `${keys.compensation.source_type}:${keys.compensation.source_id}`;
}

function exigirIo(io) {
  if (!io || !io.chequeStore || !io.bancoStore) {
    throw new Error('[chequeEventFlow] I/O não injetado.');
  }
  return io;
}

/**
 * Compensa um cheque. Idempotente e à prova de concorrência.
 *
 * @returns {Promise<{status:'aplicado'|'nao_aplicado', motivo?:string, claim?:object}>}
 */
export async function compensarCheque({ cheque, bankId, bankName, data, io }) {
  const { chequeStore, bancoStore, criarLancamento, sincronizar } = exigirIo(io);
  const token = makeEventToken();
  const patch = {
    status: STATUS_COMPENSADO,
    compensation_token: token,
    compensated_at: data,
    custody_status: 'financeiro',
    deposited_bank_id: bankId || cheque.deposited_bank_id || '',
    deposited_bank_name: bankName || cheque.deposited_bank_name || '',
  };

  // ── Ponto de não-retorno: só o vencedor do CAS segue daqui para baixo ──
  const claim = await claimCheque(chequeStore, cheque.id, 'pendente', patch, token);
  if (!claim.claimed) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.ESTADO_JA_ALTERADO, claim };
  }

  const keys = chequeEventKeys(cheque.id, token);
  await criarLancamento({
    ...keys.compensation,
    category: 'compensacao_cheque',
    amount: cheque.value,
    date: data,
    description: `Compensação cheque #${cheque.check_number} — ${cheque.client_name} (Banco: ${bankName})`,
    method: 'cheque',
    bank_id: bankId,
    operation_id: cheque.operation_id,
  });

  await applyBankDelta({
    store: bancoStore,
    bankId,
    delta: cheque.value || 0,
    eventKey: `${keys.compensation.source_type}:${keys.compensation.source_id}`,
  });
  if (sincronizar) await sincronizar(cheque.operation_id);

  return { status: 'aplicado', claim, event_key: chaveDoCredito(cheque.id, token) };
}

/**
 * Estorna a compensação de um cheque. Idempotente e à prova de concorrência.
 *
 * O estorno restaura SOMENTE os efeitos deste cheque:
 *  · o lançamento de caixa do estorno é identificado pela compensação revertida;
 *  · a operação é recalculada por DIFERENÇA (ver computeAmountPaid), então
 *    pagamentos independentes e lucro já apurado não são apagados.
 */
export async function estornarCheque({ cheque, bankId, bankName, data, io }) {
  const { chequeStore, bancoStore, criarLancamento, sincronizar } = exigirIo(io);
  const current = await chequeStore.read(cheque.id || cheque);
  if (!current || current.status !== STATUS_COMPENSADO) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.NAO_COMPENSADO };
  }

  const contaId = bankId || current.deposited_bank_id;
  if (!contaId) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.SEM_CONTA };
  }

  // ── EVIDÊNCIA DO CRÉDITO (M1, item 6) ───────────────────────────────────
  // O débito só existe se este cheque realmente creditou ESTA conta. Um cheque
  // marcado compensado por quitação de operação não tem a chave — e debitar
  // por ele tiraria dinheiro que nunca entrou.
  const tokenCompensacao = compensationTokenOf(current);
  const creditoKey = chaveDoCredito(current.id, tokenCompensacao);
  const banco = await bancoStore.get(contaId);
  const aplicadas = (banco && banco[LEDGER_KEYS_FIELD]) || [];
  if (!aplicadas.includes(creditoKey)) {
    return {
      status: 'nao_aplicado',
      motivo: MOTIVOS.SEM_CREDITO_COMPROVADO,
      credito_key: creditoKey,
    };
  }

  const reversalToken = makeEventToken();
  const patch = {
    status: 'pendente',
    compensated_at: null,
    compensation_token: reversalToken,
    custody_status: 'financeiro',
  };

  const claim = await claimCheque(chequeStore, current.id, STATUS_COMPENSADO, patch, reversalToken);
  if (!claim.claimed) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.ESTADO_JA_ALTERADO, claim };
  }

  const keys = chequeEventKeys(current.id, tokenCompensacao);
  await criarLancamento({
    ...keys.reversal,
    category: 'estorno_compensacao',
    type: 'saida',
    amount: current.value,
    date: data,
    description: `Estorno compensação cheque #${current.check_number} — ${current.client_name} (Banco: ${bankName})`,
    method: 'cheque',
    bank_id: contaId,
    operation_id: current.operation_id,
  });

  await applyBankDelta({
    store: bancoStore,
    bankId: contaId,
    delta: -(current.value || 0),
    eventKey: `${keys.reversal.source_type}:${keys.reversal.source_id}`,
  });
  if (sincronizar) await sincronizar(current.operation_id, current.id);

  return { status: 'aplicado', claim };
}

/**
 * Completa o lançamento de caixa ausente de um cheque já compensado.
 *
 * RECUPERAÇÃO PARCIAL — só a parte idempotente e segura:
 *  · o lançamento de caixa é recriado (a chave de origem impede duplicar);
 *  · o saldo bancário NÃO é recreditado — sem transação não há como saber se o
 *    crédito já foi aplicado, e recreditar arriscaria crédito duplo.
 */
export async function recuperarLancamento({ cheque, io }) {
  const { chequeStore, criarLancamento } = exigirIo(io);
  const current = await chequeStore.read(cheque.id || cheque);
  if (!current || current.status !== STATUS_COMPENSADO || !current.compensation_token) {
    return { status: 'nao_aplicavel' };
  }
  const keys = chequeEventKeys(current.id, current.compensation_token);
  const res = await criarLancamento({
    ...keys.compensation,
    category: 'compensacao_cheque',
    amount: current.value,
    date: current.compensated_at || current.compensation_date,
    description: `Compensação cheque #${current.check_number} — ${current.client_name} (lançamento recuperado)`,
    method: 'cheque',
    bank_id: current.deposited_bank_id,
    operation_id: current.operation_id,
  });
  return { status: res.status === 'created' ? 'reparado' : 'ja_existia' };
}

/**
 * Diagnóstico (somente leitura): o cheque tem crédito aplicado? O lançamento
 * existe? Serve para conferência manual — não corrige nada.
 */
export async function inspecionarCheque({ cheque, io }) {
  const { chequeStore, bancoStore, lerLancamentos } = exigirIo(io);
  const current = await chequeStore.read(cheque.id || cheque);
  if (!current) return { status: 'nao_encontrado' };

  const compensado = current.status === STATUS_COMPENSADO;
  const token = compensationTokenOf(current);
  const temTokenProprio = Boolean(current.compensation_token);
  const creditoKey = compensado ? chaveDoCredito(current.id, token) : null;
  const banco = current.deposited_bank_id ? await bancoStore.get(current.deposited_bank_id) : null;
  const aplicadas = (banco && banco[LEDGER_KEYS_FIELD]) || [];
  const saldoAplicado = Boolean(creditoKey) && aplicadas.includes(creditoKey);

  const chaves = compensado ? chequeEventKeys(current.id, token) : null;
  const lancamentos = chaves && lerLancamentos
    ? await lerLancamentos({
      source_type: chaves.compensation.source_type,
      source_id: chaves.compensation.source_id,
    })
    : [];
  const temLancamento = (lancamentos || []).length > 0;

  let estado = 'pendente';
  if (compensado) {
    if (saldoAplicado && temLancamento) estado = 'completo';
    else if (!saldoAplicado && temLancamento) estado = 'lancamento_sem_saldo';
    else if (saldoAplicado && !temLancamento) estado = 'saldo_sem_lancamento';
    else estado = 'nada_aplicado';
  }

  return {
    status: current.status,
    estado,
    token_proprio: temTokenProprio,
    estorno_permitido: saldoAplicado,
    saldo_aplicado: saldoAplicado,
    lancamento_existe: temLancamento,
    credito_key: creditoKey,
  };
}