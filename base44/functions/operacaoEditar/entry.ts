/**
 * M5.1 — AUTORIDADE ÚNICA DAS ESCRITAS DE OPERAÇÃO.
 *
 * A entidade Operation teve a escrita pelo navegador FECHADA nas regras de
 * acesso (a plataforma não oferece restrição por CAMPO em entidade comum —
 * verificado: uma regra de campo é aceita e ignorada). Como consequência, toda
 * edição legítima da tela passa por aqui.
 *
 * ── O QUE ESTA FUNÇÃO GARANTE ──────────────────────────────────────────────
 *  1. Identidade vem do token, nunca do corpo.
 *  2. Perfil: admin, ou usuário com a página Operações liberada (menor privilégio).
 *  3. `etapa`, `status`, `payment_executed` e `payment_execution_date` são
 *     RECUSADOS nesta função: só mudam por `workflowOperacao` (etapa) e
 *     `executeOperationDisbursement` (repasse). É o que impede a tela — ou uma
 *     chamada direta — de reescrever o estado do workflow.
 *  4. Criação nasce sempre em `etapa: 'rascunho'` / `status: 'ativo'`, qualquer que
 *     seja o corpo: não existe operação criada já "finalizada".
 *  5. `onde` permite gravação condicional (ex.: amount_paid observado), devolvendo
 *     conflito em vez de sobrescrever recebimento.
 *  6. Toda escrita deixa rastro em AuditLog.
 *
 * ── O QUE ELA NÃO FAZ ─────────────────────────────────────────────────────
 * Não calcula valores, não mexe em títulos, não estorna e não chama Asaas.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import { papelDoUsuario, efeitosFinanceiros } from '../../shared/operationWorkflow.js';

const falha = (erro, status = 400, extra = {}) => Response.json({ ok: false, erro, ...extra }, { status });

/** Campos que esta função NUNCA aceita: pertencem à autoridade do workflow/repasse. */
const PROTEGIDOS = [
  'etapa',
  'status',
  'payment_executed',
  'payment_execution_date',
  'id',
  'created_by_id',
  'created_date',
  'updated_date',
];

const ROTULO_PROTEGIDO = {
  etapa: 'etapa do workflow',
  status: 'status da operação',
  payment_executed: 'execução do repasse',
  payment_execution_date: 'data de execução do repasse',
};

/**
 * Remove campos protegidos e reporta quais vieram.
 * Campo protegido NÃO é ignorado em silêncio: a requisição é recusada, para que
 * um erro de integração apareça em vez de virar gravação parcial.
 */
function separarProtegidos(campos) {
  const entrada = campos && typeof campos === 'object' ? campos : {};
  const limpos = {};
  const recusados = [];
  for (const [chave, valor] of Object.entries(entrada)) {
    if (valor === undefined) continue;
    if (PROTEGIDOS.includes(chave)) { recusados.push(chave); continue; }
    limpos[chave] = valor;
  }
  return { limpos, recusados };
}

async function registrarAuditoria(servico, usuario, { action, operacaoId, description, before, after }) {
  await servico.entities.AuditLog.create({
    user_email: usuario.email,
    user_name: usuario.full_name || usuario.email,
    action,
    entity: 'Operation',
    entity_id: operacaoId,
    description,
    before: before || {},
    after: after || {},
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    const usuario = await base44.auth.me().catch(() => null);
    if (!usuario || !usuario.email) return falha('Não autenticado.', 401);

    const papel = papelDoUsuario(usuario);
    if (papel !== 'admin' && papel !== 'operacional') {
      return falha('Página de Operações não liberada para este usuário.', 403, { papel });
    }

    let body = {};
    try { body = (await req.json()) || {}; } catch (_) { body = {}; }

    const acao = String(body.acao || 'editar');
    const servico = base44.asServiceRole;

    // ── CRIAÇÃO ────────────────────────────────────────────────────────────
    if (acao === 'criar') {
      const { limpos, recusados } = separarProtegidos(body.campos);
      const tentouProtegido = recusados.filter((c) => ['etapa', 'status'].includes(c));
      if (tentouProtegido.length > 0) {
        return falha(
          `A criação não define ${tentouProtegido.map((c) => ROTULO_PROTEGIDO[c]).join(' / ')}: toda operação nasce em "rascunho" e ativa.`,
          403,
        );
      }
      const criada = await servico.entities.Operation.create({
        ...limpos,
        etapa: 'rascunho',
        status: 'ativo',
        amount_paid: 0,
        balance_due: limpos.total_receivable !== undefined ? limpos.total_receivable : limpos.balance_due,
      });
      await registrarAuditoria(servico, usuario, {
        action: 'operacao_criada',
        operacaoId: criada.id,
        description: `Operação #${String(criada.numero_operacao || criada.id.slice(-6)).padStart(6, '0')} criada como RASCUNHO (etapa definida pelo servidor).`,
        after: { etapa: 'rascunho', status: 'ativo' },
      });
      return Response.json({ ok: true, operacao: criada });
    }

    const operacaoId = String(body.operacaoId || '');
    if (!operacaoId) return falha('operacaoId é obrigatório.', 400);

    const operacao = await servico.entities.Operation.get(operacaoId).catch(() => null);
    if (!operacao) return falha('Operação não encontrada.', 404);

    // ── CONTRATO ASSINADO (única via legítima de mexer em `status`) ────────
    if (acao === 'contrato') {
      const contrato = body.contrato && typeof body.contrato === 'object' ? body.contrato : {};
      const confirmar = contrato.confirmar === true;

      if (confirmar) {
        const url = String(contrato.url || operacao.signed_contract_url || '');
        if (!url) return falha('Anexe o contrato assinado antes de confirmar o recebimento.', 409);
        const hoje = new Date().toISOString().split('T')[0];
        const atualizada = await servico.entities.Operation.update(operacaoId, {
          signed_contract_url: contrato.url || operacao.signed_contract_url,
          contract_signed_confirmed: true,
          contract_signed_date: hoje,
          status: operacao.status === 'pendente_contrato' ? 'ativo' : operacao.status,
        });
        await registrarAuditoria(servico, usuario, {
          action: 'contrato_confirmado',
          operacaoId,
          description: `Contrato assinado confirmado para ${operacao.client_name || operacaoId}.`,
          before: { status: operacao.status },
          after: { status: atualizada.status },
        });
        return Response.json({ ok: true, operacao: atualizada });
      }

      const titulos = await servico.entities.Cheque.filter({ operation_id: operacaoId }, { limit: 200 }).catch(() => []);
      const efeitos = efeitosFinanceiros(operacao, Array.isArray(titulos) ? titulos : (titulos?.items || []));
      if (efeitos.algum) {
        return falha('Não é possível desfazer a confirmação: a operação já tem efeito financeiro.', 409);
      }
      const atualizada = await servico.entities.Operation.update(operacaoId, {
        signed_contract_url: null,
        contract_signed_confirmed: false,
        contract_signed_date: null,
        status: 'pendente_contrato',
      });
      await registrarAuditoria(servico, usuario, {
        action: 'contrato_desconfirmado',
        operacaoId,
        description: `Confirmação do contrato removida para ${operacao.client_name || operacaoId}.`,
        before: { status: operacao.status },
        after: { status: 'pendente_contrato' },
      });
      return Response.json({ ok: true, operacao: atualizada });
    }

    if (acao !== 'editar') return falha('Ação desconhecida.', 403);

    // ── EDIÇÃO DE CAMPOS COMERCIAIS ────────────────────────────────────────
    const { limpos, recusados } = separarProtegidos(body.campos);
    if (recusados.length > 0) {
      const nomes = recusados.filter((c) => ROTULO_PROTEGIDO[c]).map((c) => ROTULO_PROTEGIDO[c]);
      return falha(
        `Campo protegido: ${nomes.length ? nomes.join(' / ') : recusados.join(', ')}. `
        + 'Esses campos só mudam pela autoridade do workflow (transição de etapa / execução do repasse).',
        403,
        { campos_recusados: recusados },
      );
    }
    if (Object.keys(limpos).length === 0) return falha('Nenhum campo para salvar.', 400);

    const onde = body.onde && typeof body.onde === 'object' ? body.onde : null;
    let atualizada = null;

    if (onde) {
      const filtro = { id: operacaoId };
      for (const [campo, valor] of Object.entries(onde)) {
        if (PROTEGIDOS.includes(campo)) continue;
        filtro[campo] = valor;
      }
      const res = await servico.entities.Operation.updateMany(filtro, { $set: limpos });
      if (!res || Number(res.updated) !== 1) {
        return falha('A operação mudou desde que a tela foi aberta. Recarregue para ver o estado atual.', 409);
      }
      atualizada = await servico.entities.Operation.get(operacaoId).catch(() => null);
    } else {
      atualizada = await servico.entities.Operation.update(operacaoId, limpos);
    }

    await registrarAuditoria(servico, usuario, {
      action: 'operacao_editada',
      operacaoId,
      description: `Operação #${String(operacao.numero_operacao || operacaoId.slice(-6)).padStart(6, '0')} editada: ${Object.keys(limpos).join(', ')}.`,
      after: { campos: Object.keys(limpos) },
    });

    return Response.json({ ok: true, operacao: atualizada, campos: Object.keys(limpos) });
  } catch (error) {
    return Response.json({ ok: false, erro: error.message }, { status: 500 });
  }
}