/**
 * M3 — RECEBIMENTO MANUAL AUTORIZADO NO SERVIDOR.
 *
 * Substitui as duas escritas que o navegador fazia direto no agregado da
 * operação:
 *   · registro de pagamento na tela da operação (`OperacaoDetail`);
 *   · baixa manual do lançamento no extrato do cliente (`BaixaLancamentoModal`).
 *
 * Antes, cada tela lia `amount_paid`, somava em memória e regravava — perdia
 * incremento concorrente e permitia baixar mais que o saldo. Agora o navegador
 * escolhe apenas QUAL operação, o VALOR e a identidade do evento; papel,
 * identidade do usuário, obrigação, saldo e lucro são lidos e decididos aqui.
 *
 * ── ORDEM OBRIGATÓRIA ──────────────────────────────────────────────────────
 *   identidade (token) → autorização (papel + tela) → validação de entrada →
 *   leitura das entidades pelo SERVIDOR → aplicação atômica → derivados →
 *   registro do evento.
 * Nenhum campo de papel, e-mail, dono, saldo ou conta vem do corpo.
 *
 * ── IDEMPOTÊNCIA ───────────────────────────────────────────────────────────
 * A chave do evento (`chave`) é exigida e reusada em cada retry do cliente.
 * `receipt_keys` na operação é a prova da aplicação: reenviar a mesma chave não
 * soma de novo e apenas completa o registro que faltava. Ver
 * `base44/shared/receiptEvent.js`.
 *
 * ── O QUE NÃO ENTRA AQUI ───────────────────────────────────────────────────
 * Recebimento Asaas (webhook próprio), compensação de cheque (`chequeEvento`),
 * movimentação bancária (`transferenciaBancaria`/`eventoBancario`) e pagamentos
 * internos (`gestaoInternaPagamento`). Nenhum deles é chamado por esta função.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import { autorizarMovimentacaoBancaria, ACOES_BANCARIAS } from '../../shared/bankAuthorization.js';
import { registrarRecebimento, ORIGENS } from '../../shared/receiptEvent.js';

/** Origem do corpo → ação da política. Qualquer outra coisa é recusada. */
const ACAO_POR_ORIGEM: Record<string, string> = {
  [ORIGENS.MANUAL]: ACOES_BANCARIAS.RECEBER_PAGAMENTO,
  [ORIGENS.BAIXA_MANUAL]: ACOES_BANCARIAS.REGISTRAR_BAIXA,
};

const falha = (erro: string, status = 400, extra: Record<string, unknown> = {}) =>
  Response.json({ ok: false, erro, ...extra }, { status });

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // 1. Identidade vem SEMPRE do token da plataforma.
  const usuario = await base44.auth.me().catch(() => null);
  if (!usuario || !usuario.email) return falha('Não autenticado.', 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) || {};
  } catch (_) {
    body = {};
  }

  // 2. Autorização antes de qualquer leitura privilegiada ou escrita.
  const origem = String(body.origem || '');
  const acao = ACAO_POR_ORIGEM[origem];
  if (!acao) return falha('Origem de recebimento desconhecida.', 403);

  const decisao = autorizarMovimentacaoBancaria(usuario, acao);
  if (!decisao.autorizado) {
    return falha(decisao.motivo || 'Não autorizado.', 403, { papel: decisao.papel });
  }

  const operationId = String(body.operationId || '');
  const chave = String(body.chave || '');
  const data = String(body.data || '').slice(0, 10);

  const entrada = {
    operationId,
    chave,
    data,
    origem,
    valorRecebido: numero(body.valor),
    metodo: String(body.metodo || ''),
    observacao: typeof body.observacao === 'string' ? body.observacao : '',
    jurosMora: numero(body.jurosMora),
    taxaMora: numero(body.taxaMora),
    diasAtraso: numero(body.diasAtraso),
    usuario: usuario.email, // do token, nunca do corpo
  };

  // 3. Aplicação: autoridade de serviço, depois de autorizado.
  const servico = base44.asServiceRole;
  const resultado = await registrarRecebimento(servico, entrada);

  if (!resultado.ok) {
    return falha(resultado.erro || 'Recebimento recusado.', 409, {
      saldo_em_aberto: resultado.saldo_em_aberto,
    });
  }

  return Response.json({ ok: true, resultado });
});