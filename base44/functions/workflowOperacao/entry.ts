/**
 * M5 — TRANSIÇÕES DO WORKFLOW DE OPERAÇÕES, AUTORIZADAS NO SERVIDOR.
 *
 * ── ORDEM OBRIGATÓRIA ──────────────────────────────────────────────────────
 *   identidade (token) → política de papel → leitura das entidades pelo
 *   SERVIDOR → decisão da regra pura → DIÁRIO da transição → compare-and-swap
 *   da etapa → efeitos nos títulos → auditoria → diário concluído.
 *
 * Nada de papel, e-mail ou etapa vem do corpo: o corpo só escolhe `acao`,
 * `operacaoId`, `motivo` e a `etapaObservada` (a etapa que a TELA viu).
 *
 * ── FALHA PARCIAL (M5.1) ───────────────────────────────────────────────────
 * A plataforma NÃO é transacional entre documentos: trocar a etapa, cancelar
 * títulos e gravar auditoria são três escritas distintas. Por isso existe o
 * diário `WorkflowTransicao`, gravado ANTES do compare-and-swap:
 *
 *   iniciada  → diário existe, etapa ainda não confirmada
 *   abortada  → o CAS não venceu; nada foi aplicado
 *   aplicada  → etapa trocada, efeitos (títulos/auditoria) pendentes
 *   concluida → títulos e auditoria confirmados
 *
 * Se a resposta se perder ou um efeito falhar, a próxima chamada ENCONTRA o
 * diário pendente, CONCLUI o que falta (títulos condicionados ao status atual,
 * auditoria deduplicada pela correlação) e responde sem aplicar transição nova.
 * Nenhum efeito é inventado para "consertar": só se repete o que a transição
 * registrada já previa.
 *
 * ── IDEMPOTÊNCIA DO RETRY ──────────────────────────────────────────────────
 * A tela envia `etapaObservada`. Se a operação já não estiver nessa etapa, a
 * resposta é 409 com a etapa atual — repetir a mesma solicitação NÃO avança uma
 * segunda etapa. Se a transição pedida é exatamente a que está no diário
 * concluído, a resposta é o mesmo resultado (200, `ja_aplicada: true`).
 *
 * ── CONCORRÊNCIA ───────────────────────────────────────────────────────────
 * A gravação da etapa é condicional à etapa observada. Duas execuções
 * simultâneas: só uma vence; a outra recebe 409 e seu diário vira "abortada".
 *
 * ── O QUE ESTA FUNÇÃO NÃO FAZ ──────────────────────────────────────────────
 * Não estorna recebimento, não cancela cobrança do Asaas, não apaga lançamento
 * e não recria títulos. Rejeitar apenas cancela títulos PENDENTES; reabrir
 * apenas devolve a "pendente" títulos cancelados sem nenhuma evidência de efeito.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import {
  avaliarTransicao,
  normalizarEtapa,
  ACOES,
} from '../../shared/operationWorkflow.js';

const falha = (erro, status = 400, extra = {}) => Response.json({ ok: false, erro, ...extra }, { status });

const ACOES_VALIDAS = [...Object.values(ACOES), 'recuperar'];

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

async function diariosDaOperacao(servico, operacaoId) {
  const pagina = await servico.entities.WorkflowTransicao.filter(
    { operation_id: operacaoId },
    { sort: '-created_date', limit: 20 },
  );
  return (pagina && pagina.items) || (Array.isArray(pagina) ? pagina : []);
}

async function jaAuditado(servico, operacaoId, correlacao) {
  const auditorias = await paginar(servico.entities.AuditLog, { entity_id: operacaoId }, 2);
  return auditorias.some((a) => String(a.description || '').includes(correlacao));
}

/**
 * Conclui os efeitos de um diário. É IDEMPOTENTE: títulos são tocados com
 * condição de status, a auditoria é deduplicada pela correlação.
 * @returns {Promise<{aplicada:boolean, etapa:string, criouAuditoria:boolean}>}
 */
async function concluirEfeitos(servico, usuario, diario) {
  const operacaoId = diario.operation_id;
  const operacao = await servico.entities.Operation.get(operacaoId).catch(() => null);
  if (!operacao) throw new Error('Operação do diário não encontrada.');

  const etapaAtual = normalizarEtapa(operacao.etapa);

  // Diário gravado antes do CAS: é preciso descobrir se a etapa chegou a trocar.
  if (diario.estado === 'iniciada') {
    if (etapaAtual === diario.para) {
      await servico.entities.WorkflowTransicao.update(diario.id, { estado: 'aplicada', etapa_apos: etapaAtual });
      diario.estado = 'aplicada';
    } else {
      await servico.entities.WorkflowTransicao.update(diario.id, {
        estado: 'abortada',
        etapa_apos: etapaAtual,
        erro: 'Compare-and-swap não venceu: a etapa não mudou.',
      });
      return { aplicada: false, etapa: etapaAtual, criouAuditoria: false };
    }
  }

  if (diario.estado === 'aplicada') {
    if (etapaAtual !== diario.para) {
      await servico.entities.WorkflowTransicao.update(diario.id, {
        estado: 'abortada',
        etapa_apos: etapaAtual,
        erro: `Etapa divergente (${etapaAtual}) da registrada (${diario.para}).`,
      });
      return { aplicada: false, etapa: etapaAtual, criouAuditoria: false };
    }

    const cancelar = Array.isArray(diario.cancelar) ? diario.cancelar : [];
    const restaurar = Array.isArray(diario.restaurar) ? diario.restaurar : [];
    if (cancelar.length > 0) {
      await servico.entities.Cheque.updateMany(
        { id: { $in: cancelar }, status: 'pendente' },
        { $set: { status: 'cancelado' } },
      );
    }
    if (restaurar.length > 0) {
      await servico.entities.Cheque.updateMany(
        { id: { $in: restaurar }, status: 'cancelado' },
        { $set: { status: 'pendente' } },
      );
    }

    let criouAuditoria = false;
    if (!(await jaAuditado(servico, operacaoId, diario.correlacao))) {
      await servico.entities.AuditLog.create({
        user_email: usuario.email,
        user_name: usuario.full_name || usuario.email,
        action: `workflow_${diario.acao}`,
        entity: 'Operation',
        entity_id: operacaoId,
        description: `Operação #${String(operacao.numero_operacao || operacaoId.slice(-6)).padStart(6, '0')}: ${diario.de} → ${diario.para}${diario.motivo ? ` — motivo: ${diario.motivo}` : ''}${cancelar.length ? ` — ${cancelar.length} título(s) cancelado(s)` : ''}${restaurar.length ? ` — ${restaurar.length} título(s) reaberto(s)` : ''} [${diario.correlacao}]`,
        before: { etapa: diario.de },
        after: { etapa: diario.para, motivo: diario.motivo || null, correlacao: diario.correlacao },
      });
      criouAuditoria = true;
    }

    await servico.entities.WorkflowTransicao.update(diario.id, {
      estado: 'concluida',
      etapa_apos: etapaAtual,
    });
    return { aplicada: true, etapa: etapaAtual, criouAuditoria };
  }

  return { aplicada: diario.estado === 'concluida', etapa: etapaAtual, criouAuditoria: false };
}

export default async function (req) {
  let correlacaoAtual = null;
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
    const etapaObservada = body.etapaObservada ? normalizarEtapa(String(body.etapaObservada)) : null;

    if (!operacaoId) return falha('operacaoId é obrigatório.', 400);
    if (!ACOES_VALIDAS.includes(acao)) {
      return falha('Ação de workflow desconhecida.', 403);
    }

    const servico = base44.asServiceRole;
    const operacao = await servico.entities.Operation.get(operacaoId).catch(() => null);
    if (!operacao) return falha('Operação não encontrada.', 404);

    // 2. Diário pendente? Concluir ANTES de decidir qualquer coisa nova.
    const diarios = await diariosDaOperacao(servico, operacaoId);
    const pendente = diarios.find((d) => d.estado === 'iniciada' || d.estado === 'aplicada');

    if (pendente) {
      const conclusao = await concluirEfeitos(servico, usuario, pendente);

      if (acao === 'recuperar') {
        return Response.json({
          ok: true,
          recuperado: conclusao.aplicada,
          etapa: conclusao.etapa,
          correlacao: pendente.correlacao,
        });
      }

      if (!conclusao.aplicada) {
        // Diário órfão, nada aplicado: seguir com o pedido normalmente.
      } else if (pendente.acao === acao && (!etapaObservada || etapaObservada === pendente.de)) {
        // Mesma solicitação repetida: devolve o mesmo resultado, sem nova transição.
        return Response.json({
          ok: true,
          ja_aplicada: true,
          etapa: pendente.para,
          etapa_anterior: pendente.de,
          correlacao: pendente.correlacao,
          avisos: ['Esta transição já havia sido aplicada; nada foi executado de novo.'],
        });
      } else {
        return falha(
          `A transição anterior (${pendente.de} → ${pendente.para}) acabou de ser concluída. Recarregue a operação antes de solicitar outra.`,
          409,
          { etapa: pendente.para, correlacao: pendente.correlacao },
        );
      }
    }

    if (acao === 'recuperar') {
      return Response.json({ ok: true, recuperado: false, nada_pendente: true, etapa: normalizarEtapa(operacao.etapa) });
    }

    // 3. A tela pediu a partir de uma etapa que já não é a atual: não repetir.
    const etapaAtualServidor = normalizarEtapa(operacao.etapa);
    if (etapaObservada && etapaObservada !== etapaAtualServidor) {
      return falha(
        `A operação já está em "${etapaAtualServidor}". Recarregue para ver o estado atual antes de solicitar uma nova transição.`,
        409,
        { etapa: etapaAtualServidor, etapa_observada: etapaObservada },
      );
    }

    // 4. Dados que a regra precisa — lidos pelo servidor, nunca do corpo.
    const [titulos, cliente, configs] = await Promise.all([
      paginar(servico.entities.Cheque, { operation_id: operacaoId }),
      operacao.client_id ? servico.entities.Client.get(operacao.client_id).catch(() => null) : Promise.resolve(null),
      servico.entities.ConfiguracaoEmpresa.list({ limit: 1 }).catch(() => []),
    ]);

    const config = (Array.isArray(configs) ? configs : (configs && configs.items) || [])[0] || {};

    let exposicao = 0;
    if (cliente && acao === ACOES.AVANCAR && etapaAtualServidor === 'analise_credito') {
      const outras = await paginar(servico.entities.Operation, { client_id: operacao.client_id }, 5);
      exposicao = outras
        .filter((o) => o.id !== operacaoId
          && o.status !== 'quitado'
          && !['rejeitada', 'rascunho', 'finalizada'].includes(o.etapa || ''))
        .reduce((s, o) => s + numero(o.balance_due || o.total_receivable), 0);
    }

    let temContrato = false;
    if (acao === ACOES.AVANCAR && etapaAtualServidor === 'formalizacao' && operacao.needs_contract === true) {
      const docs = await paginar(servico.entities.Document, { operation_id: operacaoId }, 2);
      temContrato = docs.some((d) => d.doc_type === 'contrato' || !!d.file_url);
    }

    // Assinatura: o vínculo (assinantes) é pré-requisito do caminho próprio da
    // etapa de confirmação de títulos e também informa a etapa de pagamento.
    // Lido pelo SERVIDOR, nunca do corpo da requisição.
    let temVinculoAssinatura = false;
    const ehOperacaoAssinatura = (operacao.produto || operacao.type) === 'assinatura';
    if (acao === ACOES.AVANCAR && ehOperacaoAssinatura && ['confirmacao_titulos', 'pagamento'].includes(etapaAtualServidor)) {
      const vinculos = await paginar(servico.entities.AssinaturaVinculo, { operation_id: operacaoId }, 2);
      temVinculoAssinatura = vinculos.length > 0;
    }

    // 5. Decisão da regra pura (mesma cópia usada pela interface).
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

    // 6. Diário ANTES de tocar na etapa: é o que permite retomar depois.
    correlacaoAtual = crypto.randomUUID();
    const diario = await servico.entities.WorkflowTransicao.create({
      operation_id: operacaoId,
      acao,
      de: decisao.etapaAtual,
      para: decisao.destino,
      motivo: decisao.motivo || null,
      correlacao: correlacaoAtual,
      cancelar: decisao.cancelar || [],
      restaurar: decisao.restaurar || [],
      estado: 'iniciada',
      solicitante: usuario.email,
    });

    // 7. Compare-and-swap da etapa.
    const filtro = { id: operacaoId, $or: [{ etapa: decisao.etapaAtual }] };
    if (decisao.etapaAtual === 'rascunho') filtro.$or.push({ etapa: { $exists: false } });

    const aplicacao = await servico.entities.Operation.updateMany(filtro, {
      $set: { etapa: decisao.destino },
    });
    const aplicadas = Number((aplicacao && aplicacao.updated) || 0);
    if (aplicadas === 0) {
      await servico.entities.WorkflowTransicao.update(diario.id, {
        estado: 'abortada',
        erro: 'Compare-and-swap não venceu (concorrência).',
      });
      return falha('A operação mudou de etapa durante a solicitação. Recarregue e tente novamente.', 409, {
        etapa: decisao.etapaAtual,
      });
    }

    // 8. Efeitos: títulos + auditoria, pelo mesmo caminho da recuperação.
    await servico.entities.WorkflowTransicao.update(diario.id, { estado: 'aplicada', etapa_apos: decisao.destino });
    const conclusao = await concluirEfeitos(servico, usuario, {
      ...diario,
      estado: 'aplicada',
    });

    return Response.json({
      ok: true,
      etapa: decisao.destino,
      etapa_anterior: decisao.etapaAtual,
      avisos: decisao.avisos || [],
      titulos_cancelados: (decisao.cancelar || []).length,
      titulos_restaurados: (decisao.restaurar || []).length,
      correlacao: correlacaoAtual,
      recuperado: conclusao.aplicada === false,
    });
  } catch (error) {
    // A etapa pode ter sido trocada e os efeitos não: o diário continua
    // pendente e a próxima chamada conclui. A resposta diz isso, em vez de
    // fingir que nada aconteceu.
    return Response.json({
      ok: false,
      erro: `A transição foi registrada mas os efeitos não terminaram (${error.message}). Repita a solicitação: o servidor conclui o que falta sem duplicar.`,
      correlacao: correlacaoAtual,
      pendente: true,
    }, { status: 500 });
  }
}