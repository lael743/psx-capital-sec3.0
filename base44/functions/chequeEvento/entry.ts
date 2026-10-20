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
  MOTIVOS,
} from '../../shared/chequeEventFlow.js';
import { createChequeCashFlow } from '../../shared/cashFlowHelper.ts';
import { sincronizarOperacao } from '../../shared/chequeWrite.ts';

const ID_REGEX = /^[a-f0-9]{24}$/i;
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Ação da função → ação da política de autorização. */
const ACOES: Record<string, string> = {
  compensar: ACOES_BANCARIAS.COMPENSAR_CHEQUE,
  estornar: ACOES_BANCARIAS.ESTORNAR_CHEQUE,
  inspecionar: ACOES_BANCARIAS.INSPECIONAR_CHEQUE,
  recuperar_lancamento: ACOES_BANCARIAS.RECUPERAR_CHEQUE,
};

const falha = (erro: string, status = 400, extra: Record<string, unknown> = {}) =>
  Response.json({ ok: false, erro, ...extra }, { status });

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
  const acaoPolitica = ACOES[acao];
  if (!acaoPolitica) return falha('Ação de cheque desconhecida.', 403);

  const politica = autorizarMovimentacaoBancaria(user, acaoPolitica);
  if (!politica.autorizado) {
    return falha(politica.motivo || 'Não autorizado.', 403, { papel: politica.papel });
  }

  const chequeId = String(body.chequeId || '');
  if (!ID_REGEX.test(chequeId)) return falha('Cheque inválido.', 400);

  const servico = base44.asServiceRole;
  const cheque = await servico.entities.Cheque.get(chequeId).catch(() => null);
  if (!cheque) return falha('Cheque não encontrado.', 404);

  // ── NORMALIZAÇÃO DE TRANSPORTE ─────────────────────────────────────────
  // O cliente de SERVIÇO devolve página (`{ items, next_cursor }`) em `filter`;
  // o do navegador devolve array. O núcleo financeiro foi escrito para array e
  // precisa continuar idêntico nos dois lados — então a diferença de transporte
  // é resolvida AQUI, não no módulo financeiro.
  const lista = (r: any) => (Array.isArray(r) ? r : (r && r.items) || []);
  const apiSync: any = {
    entities: new Proxy({}, {
      get(_alvo, nome) {
        const colecao: any = (servico.entities as any)[nome as string];
        return {
          get: (id: string) => colecao.get(id),
          filter: async (query: any) => lista(await colecao.filter(query)),
          create: (doc: any) => colecao.create(doc),
          update: (id: string, patch: any) => colecao.update(id, patch),
          updateMany: (query: any, update: any) => colecao.updateMany(query, update),
        };
      },
    }),
  };
  // `createOperationalCashFlow` acessa `base44.asServiceRole.entities` — o
  // cliente normalizado precisa expor essa mesma superfície.
  apiSync.asServiceRole = apiSync;

  // ── I/O real injetado na orquestração compartilhada ────────────────────
  const io = {
    chequeStore: {
      updateWhere: (query: any, update: any) => servico.entities.Cheque.updateMany(query, update),
      read: (id: string) => servico.entities.Cheque.get(id).catch(() => null),
    },
    bancoStore: {
      updateWhere: (query: any, update: any) => servico.entities.Banco.updateMany(query, update),
      get: (id: string) => servico.entities.Banco.get(id).catch(() => null),
    },
    criarLancamento: (params: any) => createChequeCashFlow(apiSync, params),
    sincronizar: (operationId?: string, excluir?: string) =>
      sincronizarOperacao(apiSync, operationId, excluir),
    lerLancamentos: async (query: any) => lista(await servico.entities.CashFlow.filter(query).catch(() => [])),
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