/**
 * M1 — COMPENSAÇÃO E ESTORNO DE CHEQUE AUTORIZADOS NO SERVIDOR.
 *
 * Antes desta função a compensação de cheque era orquestrada pelo navegador
 * (`src/lib/chequeOps.js`): qualquer usuário autenticado podia creditar saldo
 * chamando o SDK direto, sem tela, sem papel e sem página liberada.
 *
 * ── ORDEM OBRIGATÓRIA ──────────────────────────────────────────────────────
 *   identidade (token) → autorização (papel + página) → validação →
 *   LEITURA DO CHEQUE E DA CONTA PELO SERVIDOR → orquestração.
 * O corpo escolhe apenas QUAL ação, QUAL cheque, QUAL conta e QUAL data.
 * Valor, status, dono, operação vinculada e nome da conta vêm do banco de
 * dados — nunca do corpo.
 *
 * ── O QUE NÃO MUDOU ────────────────────────────────────────────────────────
 * A ordem das escritas, a identidade dos eventos, o compare-and-swap do
 * cheque, o incremento atômico do saldo e a alocação cheque↔parcela são
 * exatamente os mesmos (`base44/shared/chequeEventFlow.js`, espelho testado em
 * `src/lib/chequeEventFlow.js`). Nenhuma fórmula, juros ou critério de baixa
 * foi alterado.
 *
 * ── A ÚNICA REGRA NOVA ─────────────────────────────────────────────────────
 * Estorno exige que a chave do evento de compensação esteja em
 * `applied_ledger_keys` da conta debitada. Cheque marcado como compensado só
 * por quitação de operação não tem essa chave e não gera débito.
 *
 * ── RECUSAS SEM EFEITO ─────────────────────────────────────────────────────
 * `estado_ja_alterado` e `sem_credito_comprovado` respondem HTTP 200 com
 * `status: 'nao_aplicado'`, preservando o contrato que as telas já tratam.
 * Erros de autorização (403), validação (400) e alvo inexistente (404) são
 * HTTP de erro. A plataforma recusa ids fora do formato de registro com erro
 * interno, por isso o formato é validado ANTES de qualquer consulta.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import {
  autorizarMovimentacaoBancaria,
  ACOES_BANCARIAS,
} from '../../shared/bankAuthorization.js';
import {
  compensarCheque,
  estornarCheque,
  recuperarLancamento,
  inspecionarCheque,
  resolverChequeDevolvido,
  receberTaxaDevolucao,
  devolverChequeFisicamente,
  estornarResolucao,
  recuperarResolucao,
  inspecionarResolucao,
  recuperarTaxaDevolucao,
  MOTIVOS,
} from '../../shared/chequeEventFlow.js';
import { criarIoChequeEvento } from '../../shared/chequeEventIo.js';

const ID_REGEX = /^[a-f0-9]{24}$/i;
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Ação da função → ação da política de autorização. */
const ACOES: Record<string, string> = {
  compensar: ACOES_BANCARIAS.COMPENSAR_CHEQUE,
  estornar: ACOES_BANCARIAS.ESTORNAR_CHEQUE,
  inspecionar: ACOES_BANCARIAS.INSPECIONAR_CHEQUE,
  recuperar_lancamento: ACOES_BANCARIAS.RECUPERAR_CHEQUE,
  // M2 — resolução do cheque devolvido.
  resolver: ACOES_BANCARIAS.RESOLVER_CHEQUE,
  receber_taxa: ACOES_BANCARIAS.RECEBER_TAXA_CHEQUE,
  devolver_fisica: ACOES_BANCARIAS.DEVOLVER_CHEQUE,
  estornar_resolucao: ACOES_BANCARIAS.ESTORNAR_RESOLUCAO,
  recuperar_resolucao: ACOES_BANCARIAS.RECUPERAR_CHEQUE,
  inspecionar_resolucao: ACOES_BANCARIAS.INSPECIONAR_CHEQUE,
  // M2.1 — retomada da taxa de devolução: pode somar valor à obrigação.
  recuperar_taxa: ACOES_BANCARIAS.RECUPERAR_TAXA_CHEQUE,
};

const falha = (erro: string, status = 400, extra: Record<string, unknown> = {}) =>
  Response.json({ ok: false, erro, ...extra }, { status });

/** Recompõe `balance_due` a partir do total e do recebido, com CAS. */
async function recalcularSaldo(servico: any, operacaoId: string) {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const op = await servico.entities.Operation.get(operacaoId).catch(() => null);
    if (!op) return;
    const total = Number(op.total_receivable) || 0;
    const recebido = Number(op.amount_paid) || 0;
    const saldo = Math.max(0, total - recebido);
    const status = saldo <= 0.01 && total > 0 ? 'quitado' : op.status;
    const res = await servico.entities.Operation.updateMany(
      { id: operacaoId, total_receivable: total, amount_paid: recebido },
      { $set: { balance_due: saldo, status } }
    );
    if ((Number(res && res.updated) || 0) > 0) return;
  }
}

/**
 * Soma a taxa ao total a receber, UMA vez por chave de evento (M2.1).
 *
 * O `$inc` e o registro da chave ocorrem na MESMA escrita sobre UM documento:
 * a execução que vencer o compare-and-swap aplica; a concorrente não casa o
 * filtro e recebe `aplicado: false`. Essa chave é a PROVA de aplicação — a flag
 * do cheque é apenas espelho. Sem chave, nada é escrito: somar sem identidade
 * seria justamente o buraco que a M2.1 fecha.
 */
async function ajustarTotalReceivable(
  servico: any,
  operacaoId: string,
  delta: number,
  chave: string
): Promise<{ aplicado: boolean }> {
  if (!operacaoId || !delta || !chave) return { aplicado: false };
  const res = await servico.entities.Operation.updateMany(
    { id: operacaoId, taxa_incorporada_eventos: { $ne: chave } },
    { $inc: { total_receivable: delta }, $push: { taxa_incorporada_eventos: chave } }
  );
  const aplicado = (Number(res && res.updated) || 0) > 0;
  if (aplicado) await recalcularSaldo(servico, operacaoId);
  return { aplicado };
}

/**
 * Aplica o recebimento ao agregado da operação.
 * Crédito entra por `$inc` (nunca sobrescreve recebimento concorrente); estorno
 * entra condicionado ao valor observado e nunca deixa `amount_paid` negativo.
 */
async function registrarRecebimento(servico: any, operacaoId: string, delta: number) {
  if (!operacaoId || !delta) return;
  if (delta > 0) {
    await servico.entities.Operation.updateMany({ id: operacaoId }, { $inc: { amount_paid: delta } });
  } else {
    const op = await servico.entities.Operation.get(operacaoId).catch(() => null);
    const atual = Number(op && op.amount_paid) || 0;
    const novo = Math.max(0, atual + delta);
    const res = await servico.entities.Operation.updateMany(
      { id: operacaoId, amount_paid: atual },
      { $set: { amount_paid: novo } }
    );
    if ((Number(res && res.updated) || 0) === 0) return;
  }
  await recalcularSaldo(servico, operacaoId);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user) return falha('Não autenticado.', 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }
  body = body || {};

  const acao = String(body.acao || '');
  let acaoPolitica = ACOES[acao];
  if (!acaoPolitica) return falha('Ação de cheque desconhecida.', 403);

  // M2 — devolução física SEM exceção é operacional; COM exceção é ato
  // administrativo, decidido aqui e nunca pelo corpo da requisição.
  if (acao === 'devolver_fisica' && body.excecao === true) {
    acaoPolitica = ACOES_BANCARIAS.DEVOLVER_CHEQUE_EXCECAO;
  }

  const politica = autorizarMovimentacaoBancaria(user, acaoPolitica);
  if (!politica.autorizado) {
    return falha(politica.motivo || 'Não autorizado.', 403, { papel: politica.papel });
  }

  const chequeId = String(body.chequeId || '');
  if (!ID_REGEX.test(chequeId)) return falha('Cheque inválido.', 400);

  const servico = base44.asServiceRole;
  const cheque = await servico.entities.Cheque.get(chequeId).catch(() => null);
  if (!cheque) return falha('Cheque não encontrado.', 404);

  // ── I/O real injetado na orquestração compartilhada ────────────────────
  // O transporte (cliente de serviço, normalização de página, caixa e
  // sincronização do cronograma) mora em `shared/chequeEventIo.js` porque a
  // baixa de título pela Central precisa do MESMO `io` para chamar o MESMO
  // núcleo — nada de regra financeira aqui, só o mesmo caminho.
  const { io, lista } = criarIoChequeEvento(servico) as any;

  // ── M2 — resolução: privilégio de serviço + escrita financeira ─────────
  const ioResolucao = {
    ...io,
    getOperacao: (id: string) => servico.entities.Operation.get(id).catch(() => null),
    ajustarTotalReceivable: (operacaoId: string, delta: number, chave: string) =>
      ajustarTotalReceivable(servico, operacaoId, delta, chave),
    registrarRecebimento: (operacaoId: string, delta: number) =>
      registrarRecebimento(servico, operacaoId, delta),
    marcarTaxaRecebida: async (id: string, taxa: number, chave: string) => {
      const res = await servico.entities.Cheque.updateMany(
        { id, taxa_eventos: { $ne: chave } },
        { $inc: { taxa_recebida: taxa }, $push: { taxa_eventos: chave } }
      );
      return (Number(res && res.updated) || 0) > 0;
    },
    lerCheques: async (query: any) => lista(await servico.entities.Cheque.filter(query).catch(() => [])),
    criarCheque: (doc: any) => servico.entities.Cheque.create(doc),
  };

  // ── Ações somente leitura / reparo idempotente ─────────────────────────
  if (acao === 'inspecionar') {
    const resultado = await inspecionarCheque({ cheque, io });
    return Response.json({ ok: true, acao, resultado });
  }

  if (acao === 'recuperar_lancamento') {
    const resultado = await recuperarLancamento({ cheque, io });
    return Response.json({ ok: true, acao, resultado });
  }

  // ══════════════════ M2 — resolução de cheque devolvido ══════════════════
  if (acao === 'inspecionar_resolucao') {
    const resultado = await inspecionarResolucao({ cheque, io: ioResolucao });
    return Response.json({ ok: true, acao, resultado });
  }

  if (acao === 'recuperar_resolucao') {
    const resultado = await recuperarResolucao({ cheque, io: ioResolucao });
    return Response.json({ ok: true, acao, resultado });
  }

  if (acao === 'recuperar_taxa') {
    const resultado = await recuperarTaxaDevolucao({ cheque, io: ioResolucao });
    return Response.json({ ok: true, acao, resultado });
  }

  if (acao === 'resolver') {
    const modalidade = String(body.modalidade || '');
    const dia = String(body.data || '').slice(0, 10);
    if (!DATA_REGEX.test(dia)) return falha('Data inválida.', 400);

    // A conta do recebimento é resolvida AQUI: o corpo escolhe qual, o servidor
    // confere que existe e usa o nome gravado, nunca o nome enviado.
    let contaRecebimento: any = null;
    if (modalidade === 'pagamento') {
      const contaId = String(body.bankId || '');
      if (!ID_REGEX.test(contaId)) return falha('Conta inválida.', 400);
      contaRecebimento = await servico.entities.Banco.get(contaId).catch(() => null);
      if (!contaRecebimento) return falha('Conta não encontrada.', 404);
    }

    const resultado = await resolverChequeDevolvido({
      cheque,
      modalidade,
      data: dia,
      taxaPercentual: Number(body.taxaPercentual) || 0,
      taxaValor: Number(body.taxaValor) || 0,
      taxaIncorporada: body.taxaIncorporada === true,
      novaData: body.novaData ? String(body.novaData).slice(0, 10) : '',
      novoBanco: body.novoBanco ? String(body.novoBanco) : '',
      novoNumero: body.novoNumero ? String(body.novoNumero) : '',
      taxaMensal: Number(body.taxaMensal) || 0,
      bankId: contaRecebimento ? contaRecebimento.id : '',
      bankName: contaRecebimento ? contaRecebimento.name : '',
      metodo: body.metodo ? String(body.metodo) : '',
      observacao: body.observacao ? String(body.observacao) : '',
      io: ioResolucao,
    });
    return Response.json({ ok: true, acao, resultado });
  }

  if (acao === 'receber_taxa') {
    const contaId = String(body.bankId || '');
    if (!ID_REGEX.test(contaId)) return falha('Conta inválida.', 400);
    const conta = await servico.entities.Banco.get(contaId).catch(() => null);
    if (!conta) return falha('Conta não encontrada.', 404);
    const dia = String(body.data || '').slice(0, 10);
    if (!DATA_REGEX.test(dia)) return falha('Data inválida.', 400);

    const resultado = await receberTaxaDevolucao({
      cheque,
      bankId: conta.id,
      bankName: conta.name,
      data: dia,
      metodo: body.metodo ? String(body.metodo) : '',
      observacao: body.observacao ? String(body.observacao) : '',
      io: ioResolucao,
    });
    return Response.json({ ok: true, acao, resultado });
  }

  if (acao === 'devolver_fisica') {
    const dia = String(body.data || '').slice(0, 10);
    if (!DATA_REGEX.test(dia)) return falha('Data inválida.', 400);

    const resultado = await devolverChequeFisicamente({
      cheque,
      data: dia,
      justificativa: body.justificativa ? String(body.justificativa) : '',
      excecao: body.excecao === true,
      // M2.1 — `usuario` não existe: a identidade vem do token resolvido acima.
      autorizadoPor: user.email,
      io: ioResolucao,
    });
    return Response.json({ ok: true, acao, resultado });
  }

  if (acao === 'estornar_resolucao') {
    const dia = String(body.data || '').slice(0, 10);
    if (!DATA_REGEX.test(dia)) return falha('Data inválida.', 400);

    let contaId = String(body.bankId || '');
    if (contaId && !ID_REGEX.test(contaId)) return falha('Conta inválida.', 400);
    if (!contaId) contaId = String(cheque.resolucao_bank_id || cheque.deposited_bank_id || '');
    if (!contaId) return falha('Conta do recebimento não identificada.', 400);

    const resultado = await estornarResolucao({ cheque, bankId: contaId, data: dia, io: ioResolucao });

    if (resultado.status === 'nao_aplicado' && resultado.motivo === MOTIVOS.SEM_CREDITO_COMPROVADO) {
      return Response.json({
        ok: true,
        acao,
        resultado,
        aviso: 'O recebimento original não foi localizado nesta conta. Nenhum débito foi aplicado.',
      });
    }
    return Response.json({ ok: true, acao, resultado });
  }

  // ── Ações com efeito de saldo ──────────────────────────────────────────
  const data = String(body.data || '').slice(0, 10);
  if (!DATA_REGEX.test(data)) return falha('Data inválida.', 400);

  let bankId = String(body.bankId || '');
  if (!bankId && acao === 'estornar') bankId = String(cheque.deposited_bank_id || '');
  if (!ID_REGEX.test(bankId)) return falha('Conta inválida.', 400);

  const banco = await servico.entities.Banco.get(bankId).catch(() => null);
  if (!banco) return falha('Conta não encontrada.', 404);

  if (acao === 'compensar' && (Number(cheque.value) || 0) <= 0) {
    return falha('Cheque sem valor não pode ser compensado.', 400);
  }

  const resultado = acao === 'compensar'
    ? await compensarCheque({ cheque, bankId, bankName: banco.name, data, io })
    : await estornarCheque({ cheque, bankId, bankName: banco.name, data, io });

  if (resultado.status === 'nao_aplicado' && resultado.motivo === MOTIVOS.SEM_CREDITO_COMPROVADO) {
    return Response.json({
      ok: true,
      acao,
      resultado,
      aviso: 'O crédito original desta compensação não foi localizado nesta conta. Nenhum débito foi aplicado.',
    });
  }

  return Response.json({ ok: true, acao, resultado });
});