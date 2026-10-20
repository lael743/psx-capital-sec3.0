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
  STATUS_DEVOLVIDO,
  STATUS_RESOLVIDO,
  STATUS_POR_MODALIDADE,
  makeEventToken,
  chequeEventKeys,
  compensationTokenOf,
  claimCheque,
  resolucaoEventKey,
  taxaDevolucaoEventKey,
  taxaDevolucaoPendente,
  calcJurosResolucao,
  diasEntreDatas,
  round2,
  baseTaxaCongelada,
  calcTaxaDevolucao,
  inicioJurosResolucao,
  chaveDevolucaoFisica,
  valorRecebivelResolucao,
  taxaIncorporadaEventKey,
  diagnosticarTaxa,
  ESTADOS_TAXA,
} from './chequeCore.js';
import { applyBankDelta, LEDGER_KEYS_FIELD } from './bankLedger.js';

/** Motivos de NÃO aplicação — nenhum deles produz efeito. */
export const MOTIVOS = Object.freeze({
  ESTADO_JA_ALTERADO: 'estado_ja_alterado',
  NAO_COMPENSADO: 'nao_compensado',
  SEM_CREDITO_COMPROVADO: 'sem_credito_comprovado',
  SEM_CONTA: 'sem_conta',
  // M2 — resolução de cheque devolvido.
  MODALIDADE_INVALIDA: 'modalidade_invalida',
  DADOS_INVALIDOS: 'dados_invalidos',
  OPERACAO_AUSENTE: 'operacao_ausente',
  NAO_QUITADO: 'nao_quitado',
  TAXA_EM_ABERTO: 'taxa_em_aberto',
  TAXA_INCORPORADA: 'taxa_incorporada',
  DEVOLUCAO_JA_REGISTRADA: 'devolucao_ja_registrada',
  NAO_RESOLVIDO_PAGO: 'nao_resolvido_pago',
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

/* ────────────────────────────────────────────────────────────────────────────
 * M2 — RESOLUÇÃO DE CHEQUE DEVOLVIDO
 *
 * ── O QUE MUDOU ────────────────────────────────────────────────────────────
 * Antes da M2 a resolução vivia no navegador: a taxa entrava no caixa no ato da
 * COBRANÇA, o banco era creditado, `balance_due` era sobrescrito à mão e a
 * obrigação podia receber a taxa duas vezes. Agora a resolução roda aqui, com
 * privilégio de serviço, e obedece a três regras:
 *
 *   1. COBRANÇA NÃO É RECEBIMENTO. A resolução que não é pagamento não cria
 *      lançamento de caixa nem crédito bancário.
 *   2. A TAXA ENTRA NA OBRIGAÇÃO UMA ÚNICA VEZ — e só quando a modalidade
 *      escolhida no evento manda incorporá-la.
 *   3. O RECEBIMENTO É UM FATO ÚNICO: crédito bancário, lançamento de caixa e
 *      incremento de `amount_paid` carregam a MESMA chave de evento.
 *
 * ── ORDEM DAS ESCRITAS ─────────────────────────────────────────────────────
 *   1. compare-and-swap no cheque (status + resolucao_evento)  ← não-retorno
 *   2. taxa incorporada → incremento do total a receber
 *   3. lançamento de caixa com chave de origem
 *   4. incremento atômico do saldo bancário com a mesma chave
 *   5. incremento de `amount_paid` e recomposição de `balance_due`
 *
 * Só o vencedor do passo 1 prossegue. Uma falha depois dele deixa resíduo
 * DETECTÁVEL, nunca uma segunda movimentação: ver inspecionarResolucao.
 * ──────────────────────────────────────────────────────────────────────────── */

function moeda(valor) {
  return (Number(valor) || 0).toFixed(2);
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/** I/O adicional exigido pela resolução (além do contrato da M1). */
function exigirIoResolucao(io) {
  const faltando = [
    'getOperacao',
    'ajustarTotalReceivable',
    'registrarRecebimento',
    'marcarTaxaRecebida',
    'lerCheques',
    'criarCheque',
  ].filter((nome) => typeof io[nome] !== 'function');
  if (faltando.length > 0) {
    throw new Error(`[chequeEventFlow] I/O de resolução incompleto: ${faltando.join(', ')}`);
  }
  return io;
}

/**
 * Resolve um cheque devolvido: substituição, prorrogação ou pagamento.
 *
 * `taxaPercentual` incide sobre a FACE ORIGINAL congelada; `taxaValor` só é
 * usado quando o operador informa um valor fixo explicitamente. Não existe
 * taxa implícita: sem parâmetro, a taxa é zero.
 *
 * @returns {Promise<{status:'aplicado'|'nao_aplicado', motivo?:string, ...}>}
 */
export async function resolverChequeDevolvido({
  cheque,
  modalidade,
  data,
  taxaPercentual,
  taxaValor,
  taxaIncorporada,
  novaData,
  novoBanco,
  novoNumero,
  taxaMensal,
  bankId,
  bankName,
  metodo,
  observacao,
  io,
}) {
  const { chequeStore, bancoStore, criarLancamento } = exigirIo(io);
  exigirIoResolucao(io || {});

  const statusFinal = STATUS_POR_MODALIDADE[modalidade];
  if (!statusFinal) return { status: 'nao_aplicado', motivo: MOTIVOS.MODALIDADE_INVALIDA };

  const base = baseTaxaCongelada(cheque);
  const percentual = Number(taxaPercentual) || 0;
  const taxa = percentual > 0 ? calcTaxaDevolucao(base, percentual) : round2(taxaValor);
  if (!Number.isFinite(taxa) || taxa < 0) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.DADOS_INVALIDOS };
  }

  const incorporada = taxa > 0 && taxaIncorporada === true;
  const principal = round2(cheque.value);
  const dia = data || hoje();

  if ((modalidade === 'pagamento' || incorporada) && !cheque.operation_id) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.OPERACAO_AUSENTE };
  }
  if (modalidade === 'pagamento' && !bankId) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.SEM_CONTA };
  }

  // ── Prorrogação: juros do período NÃO coberto, desde o vencimento ────────
  let juros = 0;
  let vencimentoNovo = '';
  if (modalidade === 'prorrogacao') {
    vencimentoNovo = String(novaData || '');
    if (!vencimentoNovo) return { status: 'nao_aplicado', motivo: MOTIVOS.DADOS_INVALIDOS };
    const inicio = inicioJurosResolucao(cheque);
    juros = calcJurosResolucao(principal, taxaMensal, diasEntreDatas(inicio, vencimentoNovo));
  }
  if (modalidade === 'novo_cheque' && (!novoBanco || !novoNumero || !novaData)) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.DADOS_INVALIDOS };
  }

  // A chave é a identidade do evento. Uma resolução já ESTORNADA não pode
  // reusá-la: o crédito antigo continua gravado no banco e a chave repetida
  // faria a nova cobrança parecer já aplicada.
  const chave = cheque.resolucao_estorno_evento
    ? `${resolucaoEventKey(cheque.id)}#${makeEventToken()}`
    : resolucaoEventKey(cheque.id);
  // M2.1 — a incorporação da taxa tem chave PRÓPRIA, derivada da resolução.
  const chaveTaxaIncorporada = taxaIncorporadaEventKey(chave);

  const historico = `[RESOLVIDO em ${dia}] ${modalidade} | Taxa: ${percentual}% de ${moeda(base)} = ${moeda(taxa)} (${incorporada ? 'incorporada' : 'separada'})`
    + (juros > 0 ? ` | Juros: ${moeda(juros)} | Nova data: ${vencimentoNovo}` : '')
    + (observacao ? ` | Obs: ${observacao}` : '');

  const patch = {
    status: statusFinal,
    resolucao_evento: chave,
    resolvido_em: dia,
    return_reason: cheque.return_reason || `Devolvido e resolvido (${modalidade}) em ${dia}`,
    notes: cheque.notes ? `${cheque.notes}\n${historico}` : historico,
    taxa_base_valor: base,
    taxa_percentual: percentual,
    taxa_devolucao: taxa,
    taxa_incorporada: incorporada,
    taxa_incorporada_evento: incorporada ? chaveTaxaIncorporada : '',
    // M2.1 — espelho, NÃO prova: só vira true depois que a chave entra na
    // operação (passo 2). Uma flag isolada nunca autoriza repetir incremento.
    taxa_aplicada: false,
    taxa_recebida: Number(cheque.taxa_recebida) || 0,
  };
  if (modalidade === 'prorrogacao') {
    // O valor de FACE não muda: só o vencimento e a fronteira dos juros.
    patch.compensation_date = vencimentoNovo;
    patch.juros_cobrados_ate = vencimentoNovo;
  }
  if (modalidade === 'pagamento') {
    patch.resolucao_bank_id = bankId;
    patch.deposited_bank_id = bankId;
    patch.deposited_bank_name = bankName || '';
    patch.custody_status = 'financeiro';
  }

  const claim = await claimCheque(chequeStore, cheque.id, STATUS_DEVOLVIDO, patch, chave);
  if (!claim.claimed) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.ESTADO_JA_ALTERADO, claim };
  }

  // ── 2. Taxa incorporada: entra na obrigação UMA vez.
  // O CAS do passo 1 registra a INTENÇÃO; a prova é a chave gravada no próprio
  // documento da operação, na MESMA escrita do $inc. Um processo morto entre os
  // dois deixa estado PENDENTE (recuperável por recuperarTaxaDevolucao) — nunca
  // uma segunda soma, porque o $inc é guardado pela chave.
  if (incorporada) {
    const incremento = await io.ajustarTotalReceivable(cheque.operation_id, taxa, chaveTaxaIncorporada);
    if (incremento && incremento.aplicado === true) {
      await chequeStore.updateWhere(
        { id: cheque.id, taxa_incorporada_evento: chaveTaxaIncorporada },
        { $set: { taxa_aplicada: true } }
      );
    }
  }

  let recebido = 0;

  if (modalidade === 'pagamento') {
    recebido = valorRecebivelResolucao({ ...cheque, taxa_devolucao: taxa, taxa_incorporada: incorporada });

    await criarLancamento({
      source_type: 'recebimento_cheque_devolvido',
      source_id: chave,
      category: 'recebimento_cheque_devolvido',
      amount: recebido,
      date: dia,
      description: `Recebimento de cheque devolvido #${cheque.check_number} — ${cheque.client_name} (Banco: ${bankName || bankId})`
        + (incorporada ? ` inclui taxa ${moeda(taxa)}` : '')
        + (observacao ? ` — ${observacao}` : ''),
      type: 'entrada',
      method: metodo || 'outro',
      bank_id: bankId,
      operation_id: cheque.operation_id,
    });

    await applyBankDelta({ store: bancoStore, bankId, delta: recebido, eventKey: chave });

    await io.registrarRecebimento(cheque.operation_id, recebido);

    if (incorporada && taxa > 0) {
      await io.marcarTaxaRecebida(cheque.id, taxa, taxaDevolucaoEventKey(cheque.id));
    }
  } else if (modalidade === 'novo_cheque') {
    // Idempotência da emissão: um substituto por cheque devolvido.
    const existentes = (await io.lerCheques({ substitui_cheque_id: cheque.id })) || [];
    if (existentes.length === 0) {
      await io.criarCheque({
        operation_id: cheque.operation_id,
        client_id: cheque.client_id,
        client_name: cheque.client_name,
        tipo: cheque.tipo || 'cheque',
        bank_name: String(novoBanco || '').toUpperCase(),
        check_number: String(novoNumero || ''),
        value: principal,
        valor_face: principal,
        compensation_date: novaData,
        status: 'pendente',
        custody_status: 'em_maos',
        substitui_cheque_id: cheque.id,
        notes: `Substitui o cheque #${cheque.check_number} devolvido. Principal mantido; taxa conforme resolução ${chave}.`,
      });
    }
  }

  return {
    status: 'aplicado',
    modalidade,
    taxa,
    taxa_incorporada: incorporada,
    juros,
    valor_recebido: recebido,
    chave,
  };
}

/**
 * Recebe a taxa de devolução cobrada SEPARADAMENTE da obrigação.
 *
 * Modalidade separada não toca `Operation`: a taxa não foi incorporada ao total
 * a receber, então somá-la ali criaria um saldo sem lastro. O dinheiro entra no
 * banco e no caixa com identidade própria — receber duas vezes é impossível.
 */
export async function receberTaxaDevolucao({ cheque, bankId, bankName, data, metodo, observacao, io }) {
  const { chequeStore, bancoStore, criarLancamento } = exigirIo(io);
  const current = await chequeStore.read(cheque.id || cheque);
  if (!current) return { status: 'nao_aplicado', motivo: MOTIVOS.ESTADO_JA_ALTERADO };

  const taxa = round2(current.taxa_devolucao);
  if (taxa <= 0) return { status: 'nao_aplicado', motivo: MOTIVOS.DADOS_INVALIDOS };
  if (current.taxa_incorporada === true) return { status: 'nao_aplicado', motivo: MOTIVOS.TAXA_INCORPORADA };
  if (!current.operation_id) return { status: 'nao_aplicado', motivo: MOTIVOS.OPERACAO_AUSENTE };
  if (!bankId) return { status: 'nao_aplicado', motivo: MOTIVOS.SEM_CONTA };

  const chave = taxaDevolucaoEventKey(current.id);
  // A conta é gravada NA MESMA escrita da reivindicação: sem ela, uma execução
  // interrompida não teria onde conferir `applied_ledger_keys`.
  const claim = await chequeStore.updateWhere(
    { id: current.id, taxa_eventos: { $ne: chave } },
    { $push: { taxa_eventos: chave }, $set: { taxa_bank_id: bankId } }
  );
  if ((Number(claim && claim.updated) || 0) === 0) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.ESTADO_JA_ALTERADO };
  }

  const dia = data || hoje();
  await criarLancamento({
    source_type: 'taxa_devolucao_cheque',
    source_id: chave,
    category: 'taxa_devolucao_cheque',
    amount: taxa,
    date: dia,
    description: `Taxa de devolução — cheque #${current.check_number} (${current.client_name})`
      + (bankName ? ` (Banco: ${bankName})` : '')
      + (observacao ? ` — ${observacao}` : ''),
    type: 'entrada',
    method: metodo || 'outro',
    bank_id: bankId,
    operation_id: current.operation_id,
  });

  await applyBankDelta({ store: bancoStore, bankId, delta: taxa, eventKey: chave });
  await chequeStore.updateWhere({ id: current.id }, { $inc: { taxa_recebida: taxa } });

  return { status: 'aplicado', taxa, chave };
}

/**
 * Registra a DEVOLUÇÃO FÍSICA do cheque ao cliente.
 *
 * Não é quitação: nenhum saldo, lançamento ou valor da operação é tocado. Por
 * padrão exige que não reste nada exigível (taxa recebida e operação sem saldo);
 * a exceção administrativa registra quem autorizou e por quê, sem baixar dívida.
 */
export async function devolverChequeFisicamente({
  cheque,
  data,
  justificativa,
  excecao,
  autorizadoPor,
  io,
}) {
  const { chequeStore } = exigirIo(io);
  exigirIoResolucao(io || {});

  const current = await chequeStore.read(cheque.id || cheque);
  if (!current) return { status: 'nao_aplicado', motivo: MOTIVOS.ESTADO_JA_ALTERADO };
  if (current.devolucao_fisica_evento) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.DEVOLUCAO_JA_REGISTRADA };
  }

  const comExcecao = excecao === true;
  if (comExcecao && !String(justificativa || '').trim()) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.DADOS_INVALIDOS };
  }

  if (!comExcecao) {
    if (taxaDevolucaoPendente(current) > 0.01) {
      return { status: 'nao_aplicado', motivo: MOTIVOS.TAXA_EM_ABERTO };
    }
    if (!current.operation_id) return { status: 'nao_aplicado', motivo: MOTIVOS.OPERACAO_AUSENTE };
    const op = await io.getOperacao(current.operation_id);
    if (!op) return { status: 'nao_aplicado', motivo: MOTIVOS.OPERACAO_AUSENTE };
    if ((Number(op.balance_due) || 0) > 0.01) {
      return { status: 'nao_aplicado', motivo: MOTIVOS.NAO_QUITADO };
    }
  }

  const chave = chaveDevolucaoFisica(current.id);
  const res = await chequeStore.updateWhere(
    { id: current.id, devolucao_fisica_evento: { $exists: false } },
    {
      $set: {
        devolucao_fisica_evento: chave,
        devolucao_fisica_em: data || hoje(),
        devolucao_fisica_por: autorizadoPor || 'desconhecido',
        devolucao_fisica_excecao: comExcecao,
        devolucao_fisica_justificativa: justificativa || '',
        custody_status: 'em_maos',
      },
    }
  );
  if ((Number(res && res.updated) || 0) === 0) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.DEVOLUCAO_JA_REGISTRADA };
  }

  return { status: 'aplicado', chave, excecao: comExcecao };
}

/**
 * Estorna a resolução PAGA de um cheque devolvido.
 *
 * Só existe com EVIDÊNCIA do recebimento original: a chave do evento precisa
 * estar em `applied_ledger_keys` da conta que será debitada. É a mesma regra do
 * estorno de compensação (M1) — nunca debitar conta que não recebeu.
 */
export async function estornarResolucao({ cheque, bankId, data, io }) {
  const { chequeStore, bancoStore, criarLancamento } = exigirIo(io);
  exigirIoResolucao(io || {});

  const current = await chequeStore.read(cheque.id || cheque);
  if (!current) return { status: 'nao_aplicado', motivo: MOTIVOS.ESTADO_JA_ALTERADO };
  if (current.status !== 'resolvido_pago') {
    return { status: 'nao_aplicado', motivo: MOTIVOS.NAO_RESOLVIDO_PAGO };
  }

  const chaveRecebimento = current.resolucao_evento || resolucaoEventKey(current.id);
  const contaId = bankId || current.resolucao_bank_id || current.deposited_bank_id;
  if (!contaId) return { status: 'nao_aplicado', motivo: MOTIVOS.SEM_CONTA };

  const banco = await bancoStore.get(contaId);
  const aplicadas = (banco && banco[LEDGER_KEYS_FIELD]) || [];
  if (!aplicadas.includes(chaveRecebimento)) {
    return {
      status: 'nao_aplicado',
      motivo: MOTIVOS.SEM_CREDITO_COMPROVADO,
      credito_key: chaveRecebimento,
    };
  }

  const valor = valorRecebivelResolucao(current);
  const chaveEstorno = `${chaveRecebimento}:estorno`;
  const dia = data || hoje();

  const claim = await claimCheque(
    chequeStore,
    current.id,
    'resolvido_pago',
    { status: STATUS_DEVOLVIDO, resolucao_estorno_evento: chaveEstorno, resolvido_em: null },
    chaveEstorno
  );
  if (!claim.claimed) {
    return { status: 'nao_aplicado', motivo: MOTIVOS.ESTADO_JA_ALTERADO, claim };
  }

  await criarLancamento({
    source_type: 'resolucao_cheque_estorno',
    source_id: chaveEstorno,
    category: 'estorno_resolucao_cheque',
    type: 'saida',
    amount: valor,
    date: dia,
    description: `Estorno da resolução do cheque #${current.check_number} — ${current.client_name}`,
    method: 'outro',
    bank_id: contaId,
    operation_id: current.operation_id,
  });

  await applyBankDelta({ store: bancoStore, bankId: contaId, delta: -valor, eventKey: chaveEstorno });

  if (current.operation_id) {
    await io.registrarRecebimento(current.operation_id, -valor);
  }

  const taxa = round2(current.taxa_devolucao);
  if (current.taxa_incorporada === true && taxa > 0) {
    const chaveTaxa = taxaDevolucaoEventKey(current.id);
    await chequeStore.updateWhere(
      { id: current.id, taxa_eventos: chaveTaxa },
      { $inc: { taxa_recebida: -taxa }, $pull: { taxa_eventos: chaveTaxa } }
    );
  }

  return { status: 'aplicado', valor, chave_estorno: chaveEstorno };
}

/**
 * Diagnóstico da resolução (somente leitura).
 *
 * Distingue o que está efetivamente aplicado do que ficou pela metade. Não
 * corrige nada e não usa registro de auditoria como prova de movimentação.
 */
export async function inspecionarResolucao({ cheque, io }) {
  const { chequeStore, bancoStore, lerLancamentos } = exigirIo(io);
  exigirIoResolucao(io || {});

  const current = await chequeStore.read(cheque.id || cheque);
  if (!current) return { status: 'nao_encontrado' };

  const chave = current.resolucao_evento || '';
  const contaId = current.resolucao_bank_id || current.deposited_bank_id || '';
  const banco = contaId ? await bancoStore.get(contaId) : null;
  const aplicadas = (banco && banco[LEDGER_KEYS_FIELD]) || [];
  const saldoAplicado = Boolean(chave) && aplicadas.includes(chave);

  const lancamentos = chave && lerLancamentos ? await lerLancamentos({ source_id: chave }) : [];
  const lancamentoExiste = (lancamentos || []).length > 0;

  const substitutos = await io.lerCheques({ substitui_cheque_id: current.id });

  let estado = 'pendente';
  if (current.status === 'resolvido_pago') {
    if (saldoAplicado && lancamentoExiste) estado = 'completo';
    else if (saldoAplicado && !lancamentoExiste) estado = 'saldo_sem_lancamento';
    else if (!saldoAplicado && lancamentoExiste) estado = 'lancamento_sem_saldo';
    else estado = 'nada_aplicado';
  } else if (current.status === 'resolvido_substituido') {
    estado = (substitutos || []).length > 0 ? 'completo' : 'substituto_ausente';
  } else if (current.status === 'resolvido_prorrogado') {
    estado = 'completo';
  }

  return {
    status: current.status,
    estado,
    chave_resolucao: chave,
    conta_id: contaId,
    saldo_aplicado: saldoAplicado,
    lancamento_existe: lancamentoExiste,
    substituto_id: (substitutos || [])[0]?.id || '',
    taxa_pendente: taxaDevolucaoPendente(current),
    devolucao_fisica: current.devolucao_fisica_evento || '',
    taxa: await inspecionarTaxa({ cheque: current, io }),
  };
}

/**
 * Conclui SOMENTE etapas comprovadamente pendentes de uma resolução.
 *
 * O único reparo seguro é recriar o lançamento quando o saldo já está aplicado
 * e o lançamento não existe. Todo o resto — saldo não aplicado, substituição
 * interrompida — fica bloqueado para análise, porque presumir aplicação é o
 * caminho para pagar duas vezes. Nenhum `$inc` de saldo acontece aqui.
 */
export async function recuperarResolucao({ cheque, io }) {
  const { chequeStore, criarLancamento } = exigirIo(io);
  const diag = await inspecionarResolucao({ cheque, io });
  if (diag.status === 'nao_encontrado') return { status: 'nao_encontrado' };

  if (diag.estado === 'saldo_sem_lancamento') {
    const current = await chequeStore.read(cheque.id || cheque);
    const res = await criarLancamento({
      source_type: 'recebimento_cheque_devolvido',
      source_id: diag.chave_resolucao,
      category: 'recebimento_cheque_devolvido',
      amount: valorRecebivelResolucao(current),
      date: current.resolvido_em || current.compensation_date,
      description: `Recebimento de cheque devolvido #${current.check_number} — ${current.client_name} (lançamento recuperado)`,
      type: 'entrada',
      method: 'outro',
      bank_id: diag.conta_id,
      operation_id: current.operation_id,
    });
    return {
      status: res.status === 'created' ? 'lancamento_reparado' : 'ja_existia',
      estado_anterior: diag.estado,
      diagnostico: diag,
    };
  }

  return { status: 'requer_intervencao', estado_anterior: diag.estado, diagnostico: diag };
}

/* ────────────────────────────────────────────────────────────────────────────
 * M2.1 — RECUPERAÇÃO DA TAXA DE DEVOLUÇÃO
 *
 * `taxa_aplicada` era gravado antes dos efeitos. Aqui a pergunta deixa de ser
 * "a flag está ligada?" e passa a ser "QUAL efeito existe no documento que
 * deveria tê-lo recebido?" — a única evidência que não mente.
 *
 * Estados e retomadas permitidas:
 *   · incorporada_concluida ......... chave em Operation.taxa_incorporada_eventos
 *                                     → só espelha a flag; nenhum valor se move
 *   · incorporada_pendente .......... intenção registrada, chave AUSENTE na operação
 *                                     → retoma o $inc pela mesma chave (no máximo 1x)
 *   · incorporada_ambigua ........... sem chave (legado) ou operação ilegível
 *                                     → NUNCA reaplica; divergência registrada
 *   · separada_nada_aplicado ........ reivindicada, sem crédito e sem lançamento
 *                                     → libera a reivindicação (o operador pode repetir)
 *   · separada_saldo_sem_lancamento . crédito comprovado, lançamento ausente
 *                                     → recria SÓ o lançamento; não credita de novo
 *   · separada_lancamento_sem_saldo . lançamento sem crédito (ou conta ilegível)
 *                                     → intervenção; presumir seria inventar
 *   · separada_recebida_defasada .... efeitos completos, taxa_recebida atrás
 *                                     → corrige o espelho
 *
 * Nenhum caminho cria lançamento compensatório nem "ajusta" saldo para bater.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Diagnóstico da taxa de devolução (somente leitura). */
export async function inspecionarTaxa({ cheque, io }) {
  const { chequeStore, bancoStore } = exigirIo(io);
  exigirIoResolucao(io || {});

  const current = await chequeStore.read(cheque.id || cheque);
  if (!current) return { status: 'nao_encontrado' };

  const evidencia = {};

  if (current.taxa_incorporada === true) {
    const chave = current.taxa_incorporada_evento || '';
    if (chave && current.operation_id) {
      const op = await io.getOperacao(current.operation_id);
      if (op) {
        const chaves = Array.isArray(op.taxa_incorporada_eventos) ? op.taxa_incorporada_eventos : [];
        evidencia.chaveNaOperacao = chaves.includes(chave);
      }
    }
  } else {
    const chave = taxaDevolucaoEventKey(current.id);
    const contaId = current.taxa_bank_id || current.resolucao_bank_id || current.deposited_bank_id || '';
    evidencia.conta_id = contaId;
    if (contaId) {
      const banco = await bancoStore.get(contaId);
      if (banco) {
        evidencia.creditoNoBanco = (banco[LEDGER_KEYS_FIELD] || []).includes(chave);
      }
    }
    const lancamentos = (await io.lerLancamentos({ source_id: chave })) || [];
    evidencia.lancamentoExiste = lancamentos.length > 0;
  }

  const diag = diagnosticarTaxa(current, evidencia);
  return {
    status: current.status,
    ...diag,
    valor: round2(current.taxa_devolucao),
    recebido: Number(current.taxa_recebida) || 0,
    chave_incorporada: current.taxa_incorporada_evento || '',
    evidencia,
  };
}

/**
 * Retoma SOMENTE etapas comprovadamente pendentes da taxa de devolução.
 * Nunca credita conta, nunca repete lançamento, nunca reescreve valor por
 * estimativa. O que não é provado volta como `requer_intervencao`.
 */
export async function recuperarTaxaDevolucao({ cheque, io }) {
  const { chequeStore, criarLancamento } = exigirIo(io);
  exigirIoResolucao(io || {});

  const diag = await inspecionarTaxa({ cheque, io });
  if (diag.status === 'nao_encontrado') return { status: 'nao_encontrado' };

  const current = await chequeStore.read(cheque.id || cheque);
  const base = { estado_anterior: diag.estado, divergencias: diag.divergencias || [], diagnostico: diag };

  if (diag.acao === 'retomar_incremento') {
    const r = await io.ajustarTotalReceivable(current.operation_id, diag.valor, diag.chave_incorporada);
    const aplicado = Boolean(r && r.aplicado === true);
    if (aplicado) {
      await chequeStore.updateWhere(
        { id: current.id, taxa_incorporada_evento: diag.chave_incorporada },
        { $set: { taxa_aplicada: true } }
      );
    }
    return { status: aplicado ? 'taxa_incorporada' : 'ja_aplicada', ...base };
  }

  if (diag.acao === 'espelhar_flag') {
    const res = await chequeStore.updateWhere(
      { id: current.id, taxa_aplicada: { $ne: true } },
      { $set: { taxa_aplicada: true } }
    );
    const ok = (Number(res && res.updated) || 0) > 0;
    return { status: ok ? 'espelho_corrigido' : 'ja_espelhado', ...base };
  }

  if (diag.acao === 'liberar_reivindicacao') {
    const chave = taxaDevolucaoEventKey(current.id);
    const res = await chequeStore.updateWhere(
      { id: current.id, taxa_eventos: chave },
      { $pull: { taxa_eventos: chave } }
    );
    const ok = (Number(res && res.updated) || 0) > 0;
    return { status: ok ? 'reivindicacao_liberada' : 'ja_liberada', ...base };
  }

  if (diag.acao === 'recriar_lancamento') {
    const res = await criarLancamento({
      source_type: 'taxa_devolucao_cheque',
      source_id: taxaDevolucaoEventKey(current.id),
      category: 'taxa_devolucao_cheque',
      amount: diag.valor,
      date: current.resolvido_em || current.compensation_date,
      description: `Taxa de devolução — cheque #${current.check_number} (${current.client_name}) (lançamento recuperado)`,
      type: 'entrada',
      method: 'outro',
      bank_id: diag.evidencia.conta_id,
      operation_id: current.operation_id,
    });
    return { status: res.status === 'created' ? 'lancamento_reparado' : 'ja_existia', ...base };
  }

  if (diag.acao === 'espelhar_recebida') {
    const res = await chequeStore.updateWhere(
      { id: current.id, taxa_recebida: Number(current.taxa_recebida) || 0 },
      { $set: { taxa_recebida: diag.valor, taxa_aplicada: true } }
    );
    const ok = (Number(res && res.updated) || 0) > 0;
    return { status: ok ? 'recebida_corrigida' : 'recebida_ja_corrigida', ...base };
  }

  const concluida = diag.estado === ESTADOS_TAXA.INCORPORADA_CONCLUIDA
    || diag.estado === ESTADOS_TAXA.SEPARADA_CONCLUIDA;
  return { status: concluida ? 'sem_acao' : 'requer_intervencao', ...base };
}