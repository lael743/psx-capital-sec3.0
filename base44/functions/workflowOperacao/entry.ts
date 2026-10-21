/**
 * M5 — TRANSIÇÕES DO WORKFLOW DE OPERAÇÕES, AUTORIZADAS NO SERVIDOR.
 *
 * Antes desta função, mudar de etapa era um `Operation.update({ etapa })`
 * disparado pelo botão da tela: sem pré-requisito, sem autorização real e sem
 * registro que sobrevivesse ao navegador. Rejeitar cancelava títulos mesmo com
 * dinheiro recebido; reabrir devolvia títulos cancelados a "pendente" sem olhar
 * o histórico deles.
 *
 * ── ORDEM OBRIGATÓRIA ──────────────────────────────────────────────────────
 *   identidade (token) → política de papel → leitura das entidades pelo
 *   SERVIDOR → decisão da regra pura → compare-and-swap da etapa → efeitos nos
 *   títulos → registro em AuditLog.
 *
 * Nada de papel, e-mail ou etapa vem do corpo: o corpo só escolhe `acao`,
 * `operacaoId` e `motivo`.
 *
 * ── CONCORRÊNCIA ───────────────────────────────────────────────────────────
 * A gravação da etapa é condicional à etapa observada (`etapa` no filtro do
 * `updateMany`). Duas execuções simultâneas não somam etapas: a segunda não
 * encontra o documento no estado esperado e recebe 409. O CAS foi verificado
 * pelo teste M5.6/M5.7 e por execução real contra a plataforma.
 *
 * ── O QUE ESTA FUNÇÃO NÃO FAZ ──────────────────────────────────────────────
 * Não estorna recebimento, não cancela cobrança do Asaas, não apaga lançamento
 * e não recria títulos. Rejeitar apenas cancela títulos PENDENTES; reabrir
 * apenas devolve a "pendente" títulos cancelados sem nenhuma evidência de efeito.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import {
  avaliarTransicao,
  ACOES,
} from '../../shared/operationWorkflow.js';

const falha = (erro, status = 400, extra = {}) => Response.json({ ok: false, erro, ...extra }, { status });

const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function paginar(entidade, query, limitePaginas = 10) {
  const todos = [];
  let cursor = null;
  for (let i = 0; i < limitePaginas; i += 1) {
    const pagina = await entidade.filter(query, { sort: '-created_date', limit: 200, cursor });
    const itens = (pagina && pagina.items) || [];
    todos.push(...itens);
    if (!pagina || !pagina.has_more || !pagina.next_cursor || itens.length === 0) break;
    cursor = pagina.next_cursor;
  }
  return todos;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Identidade SEMPRE do token da plataforma.
    const usuario = await base44.auth.me().catch(() => null);
    if (!usuario || !usuario.email) return falha('Não autenticado.', 401);

    let body = {};
    try { body = (await req.json()) || {}; } catch (_) { body = {}; }

    const operacaoId = String(body.operacaoId || '');
    const acao = String(body.acao || '');
    const motivo = typeof body.motivo === 'string' ? body.motivo : '';

    if (!operacaoId) return falha('operacaoId é obrigatório.', 400);
    if (!Object.values(ACOES).includes(acao)) {
      return falha('Ação de workflow desconhecida.', 403);
    }

    const servico = base44.asServiceRole;
    const operacao = await servico.entities.Operation.get(operacaoId).catch(() => null);
    if (!operacao) return falha('Operação não encontrada.', 404);

    // 2. Dados que a regra precisa — lidos pelo servidor, nunca do corpo.
    const [titulos, cliente, configs] = await Promise.all([
      paginar(servico.entities.Cheque, { operation_id: operacaoId }),
      operacao.client_id ? servico.entities.Client.get(operacao.client_id).catch(() => null) : Promise.resolve(null),
      servico.entities.ConfiguracaoEmpresa.list({ limit: 1 }).catch(() => []),
    ]);

    const config = (Array.isArray(configs) ? configs : (configs && configs.items) || [])[0] || {};

    let exposicao = 0;
    if (cliente && acao === ACOES.AVANCAR && (operacao.etapa || 'nova') === 'analise_credito') {
      const outras = await paginar(servico.entities.Operation, { client_id: operacao.client_id }, 5);
      exposicao = outras
        .filter((o) => o.id !== operacaoId
          && o.status !== 'quitado'
          && !['rejeitada', 'rascunho', 'finalizada'].includes(o.etapa || ''))
        .reduce((s, o) => s + numero(o.balance_due || o.total_receivable), 0);
    }

    let temContrato = false;
    if (acao === ACOES.AVANCAR && (operacao.etapa || 'nova') === 'formalizacao' && operacao.needs_contract === true) {
      const docs = await paginar(servico.entities.Document, { operation_id: operacaoId }, 2);
      temContrato = docs.some((d) => d.doc_type === 'contrato' || !!d.file_url);
    }

    let temVinculoAssinatura = false;
    if (acao === ACOES.AVANCAR && (operacao.etapa || 'nova') === 'pagamento' && (operacao.produto || operacao.type) === 'assinatura') {
      const vinculos = await paginar(servico.entities.AssinaturaVinculo, { operation_id: operacaoId }, 2);
      temVinculoAssinatura = vinculos.length > 0;
    }

    // 3. Decisão da regra pura (mesma cópia usada pela interface).
    const decisao = avaliarTransicao({
      operacao,
      titulos,
      contexto: { cliente, config, exposicao, temContrato, temVinculoAssinatura },
      usuario,
      acao,
      motivo,
    });

    if (!decisao.permitida) {
      return falha(decisao.motivo || 'Transição não permitida.', decisao.status || 409, {
        papel: decisao.papel,
        etapa: decisao.etapaAtual,
        bloqueios: decisao.bloqueios || [],
        exige_admin: decisao.exige_admin === true,
      });
    }

    // 4. Compare-and-swap da etapa: só aplica se a etapa observada continuar sendo a atual.
    const etapaAtual = decisao.etapaAtual;
    const filtro = { id: operacaoId, $or: [{ etapa: etapaAtual }] };
    if (etapaAtual === 'nova') filtro.$or.push({ etapa: { $exists: false } });

    const aplicacao = await servico.entities.Operation.updateMany(filtro, {
      $set: { etapa: decisao.destino },
    });
    const aplicadas = Number((aplicacao && aplicacao.updated) || 0);
    if (aplicadas === 0) {
      return falha('A operação mudou de etapa durante a solicitação. Recarregue e tente novamente.', 409, {
        etapa: etapaAtual,
      });
    }

    // 5. Efeitos nos títulos — somente os permitidos pela decisão.
    const cancelados = decisao.cancelar || [];
    const restaurados = decisao.restaurar || [];
    if (cancelados.length > 0) {
      await servico.entities.Cheque.updateMany(
        { id: { $in: cancelados }, status: 'pendente' },
        { $set: { status: 'cancelado' } },
      );
    }
    if (restaurados.length > 0) {
      await servico.entities.Cheque.updateMany(
        { id: { $in: restaurados }, status: 'cancelado' },
        { $set: { status: 'pendente' } },
      );
    }

    // 6. Histórico da decisão, com identidade do token e correlação.
    const correlacao = crypto.randomUUID();
    await servico.entities.AuditLog.create({
      user_email: usuario.email,
      user_name: usuario.full_name || usuario.email,
      action: `workflow_${acao}`,
      entity: 'Operation',
      entity_id: operacaoId,
      description: `Operação #${String(operacao.numero_operacao || operacaoId.slice(-6)).padStart(6, '0')}: ${etapaAtual} → ${decisao.destino}${decisao.motivo ? ` — motivo: ${decisao.motivo}` : ''}${cancelados.length ? ` — ${cancelados.length} título(s) cancelado(s)` : ''}${restaurados.length ? ` — ${restaurados.length} título(s) reaberto(s)` : ''} [${correlacao}]`,
      before: { etapa: etapaAtual },
      after: { etapa: decisao.destino, motivo: decisao.motivo || null, correlacao },
    });

    return Response.json({
      ok: true,
      etapa: decisao.destino,
      etapa_anterior: etapaAtual,
      avisos: decisao.avisos || [],
      titulos_cancelados: cancelados.length,
      titulos_restaurados: restaurados.length,
      correlacao,
    });
  } catch (error) {
    return Response.json({ ok: false, erro: error.message }, { status: 500 });
  }
}